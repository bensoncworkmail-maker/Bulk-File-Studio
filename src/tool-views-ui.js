'use strict';
(() => {
 const titles={logs:'查看紀錄',planning:'日曆／看板速覽',snippets:'常用文字片段'};
 const node=(tag,text,className)=>{
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(className)el.className=className;
  return el;
 };
 const button=(label,task)=>{
  const el=node('button',label,'btn btn-secondary');el.type='button';
  el.addEventListener('click',task);return el;
 };
 function mount(root,api,config){
  let filters={query:config.query||'',page:0},request=0,timer;
  const controls=node('div',undefined,'tool-view-filters'),results=node('div',undefined,'tool-view-results');
  const status=node('p',undefined,'tool-view-status');status.setAttribute('role','status');
  const toolbar=node('div',undefined,'tool-view-heading');
  toolbar.append(node('h1',titles[config.kind]));
  if(api.close)toolbar.append(button('關閉',api.close));
  if(api.clearScope)toolbar.append(button('選擇其他表格',api.clearScope));
  if(config.kind==='planning')toolbar.append(button('開啟完整日曆／看板',()=>act('main')));
  root.replaceChildren(toolbar,controls,status,results);
  const inputs={};
  function field(key,label,type){
   const wrap=node('label',label),input=node(type==='select'?'select':'input');
   if(type!=='select')input.type=type;
   input.setAttribute('aria-label',label);inputs[key]=input;
   input.value=filters[key]||'';
   input.addEventListener(type==='text'||type==='search'?'input':'change',()=>{
    filters[key]=input.value;filters.page=0;
    if(key==='sheetId'){
     for(const dependent of ['masterId','dateField','stateField','value'])delete filters[dependent];
    }
    if(key==='stateField'||key==='mode')delete filters.value;
    clearTimeout(timer);timer=setTimeout(load,type==='text'||type==='search'?140:0);
   });
   wrap.append(input);controls.append(wrap);return input;
  }
  field('query','搜尋標題或內容','search').maxLength=256;
  if(config.kind==='logs'){
   field('sheetId','紀錄表格','select');field('masterId','所屬主紀錄','select');
   field('dateField','日期欄位','select');field('from','日期由','date');field('to','日期至','date');
   field('stateField','快速值篩選','select');field('value','欄位值','select');field('sort','排序','select');
  }else if(config.kind==='planning'){
   field('mode','檢視','select');
   field('month','月份','month').value=new Date().toLocaleDateString('sv-SE').slice(0,7);
   for(const [key,label] of [['sheetId','表格'],['stateField','狀態欄位'],['value','篩選狀態']]){
    field(key,label,'select').parentElement.hidden=true;
   }

  }else{
   field('customer','客戶／稱呼','text').maxLength=200;
  }
  function choices(key,options,selected=filters[key]){
   const input=inputs[key];if(!input)return;
   input.replaceChildren();
   for(const [value,label] of options){const item=node('option',label);item.value=value;input.append(item);}
   input.value=options.some(([value])=>value===selected)?selected:(options[0]?.[0]||'');
  }
  if(inputs.mode)choices('mode',[['calendar','日曆'],['board','看板速覽']]);
  if(inputs.sort)choices('sort',[['recent','日期：新到舊'],['oldest','日期：舊到新'],['title','標題']]);
  async function act(action,value){
   try{await api.action(action,value,inputs.customer?.value||'');if(action==='copy')status.textContent='已複製文字片段。';}
   catch(error){status.textContent=error.message;}
  }
  async function load(){
   const version=++request;
   try{
    const data=await api.data({...filters});if(version!==request)return;
    if(config.kind==='logs'){
     choices('sheetId',data.tables.map(item=>[item.id,item.name]),data.sheetId);
     choices('masterId',[['',data.masterRequired?'選擇主紀錄':'全部主紀錄'],...data.masters.map(item=>[item.id,item.title])]);
     inputs.masterId.parentElement.hidden=!data.masters.length;
     choices('dateField',[['','最後修改日期'],...data.dateFields.map(item=>[item.id,item.label])]);
     choices('stateField',[['','不限欄位'],...data.stateFields.map(item=>[item.id,item.label])]);
     choices('value',[['','全部值'],...data.states.map(value=>[value,data.checkbox?(value==='true'?'已勾選':'未勾選'):value])]);
     inputs.value.parentElement.hidden=!data.states.length;
    }
    if(config.kind==='planning'){
     const board=filters.mode==='board';
     inputs.month.parentElement.hidden=board;
     for(const key of ['sheetId','stateField','value'])inputs[key].parentElement.hidden=!board;
     if(board){
      choices('sheetId',data.tables.map(item=>[item.id,item.name]),data.sheetId);
      choices('stateField',data.stateFields.map(item=>[item.id,item.label]),data.stateField);
      choices('value',[['','全部狀態'],...data.states.map(value=>[value,value])]);
     }
    }
    status.textContent=data.masterRequired&&!filters.masterId?'請先選擇一筆主紀錄。':'共 '+data.total+' 筆';
    results.replaceChildren();
    for(const row of data.rows){
     const card=node('article',undefined,'tool-view-result');
     card.append(node('strong',row.title));
     if(row.detail)card.append(node('small',row.detail));
     if(row.summary)card.append(node('p',row.summary));
     card.append(button(config.kind==='snippets'?'複製':'開啟紀錄',()=>act(config.kind==='snippets'?'copy':'visit',row.id)));
     results.append(card);
    }
    if(!data.rows.length)results.append(node('p','沒有符合條件的項目。','notes-hint'));
    if(data.last){
     const pager=node('div',undefined,'tool-view-pager');
     const prev=button('上一頁',()=>{filters.page=data.page-1;load();});
     const next=button('下一頁',()=>{filters.page=data.page+1;load();});
     prev.disabled=data.page===0;next.disabled=data.page===data.last;
     pager.append(prev,node('span',(data.page+1)+' / '+(data.last+1)),next);
     results.append(pager);
    }
   }catch(error){if(version===request){status.textContent=error.message;results.replaceChildren();}}
  }
  load();return {refresh:load,dispose(){request++;clearTimeout(timer);}};
 }
 window.toolViewsUI={mount};
 const overlay=document.getElementById('tool-overlay'),api=window.toolOverlayAPI;
 if(overlay&&api){
  let view,last;
  const render=config=>{
   if(JSON.stringify(config)===JSON.stringify(last)){view?.refresh();return;}
   view?.dispose();last=config;view=mount(overlay,api,config);
   document.title=titles[config.kind];
  };
  api.get().then(({config,theme})=>{document.documentElement.dataset.theme=theme;render(config);})
   .catch(error=>overlay.textContent=error.message);
  api.onRefresh(render);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')api.close();});
 }
})();
