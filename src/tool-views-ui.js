'use strict';
(() => {
 const titles={logs:'查看紀錄',planning:'日曆／看板速覽',snippets:'常用文字片段'};
 const descriptions={
  logs:'依表格瀏覽工作區紀錄，或用日期、主紀錄與欄位值縮小範圍。',
  planning:'快速查看這個月的日期與提醒，或依狀態瀏覽看板。',
  snippets:'找出常用回覆，填入稱呼後即可複製。'
 };
 const sorts=[['recent','日期：新到舊'],['oldest','日期：舊到新'],['title','標題']];
 const layouts=[['list','精簡清單'],['cards','卡片']];
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
 function mount(root,api,config,filters={query:config.query||'',page:0}){
  let request=0,timer,disposed=false;
  const controls=node('div',undefined,'tool-view-filters');
  const results=node('div',undefined,'tool-view-results');
  const status=node('p',undefined,'tool-view-status');status.setAttribute('role','status');
  const toolbar=node('header',undefined,'tool-view-heading');
  const title=node('div');
  title.append(node('h1',titles[config.kind]),node('p',descriptions[config.kind]));
  toolbar.append(title);
  const actions=node('div',undefined,'tool-view-actions');
  if(api.clearScope)actions.append(button('返回預設表格',api.clearScope));
  if(config.kind==='planning')actions.append(button('開啟完整日曆／看板',()=>act('main')));
  if(actions.children.length)toolbar.append(actions);
  const filterPanel=node('div',undefined,'tool-view-filter-panel');
  filterPanel.append(controls);
  root.replaceChildren(toolbar,filterPanel,status,results);
  const inputs={};
  function field(key,label,type,parent=controls){
   const wrap=node('label',undefined,key==='query'?'tool-view-query':undefined);
   const input=node(type==='select'?'select':'input');
   if(type!=='select')input.type=type;
   input.setAttribute('aria-label',label);inputs[key]=input;
   input.value=filters[key]||'';
   const typing=type==='text'||type==='search';
   input.addEventListener(typing?'input':'change',()=>{
    filters[key]=input.value;filters.page=0;
    if(key==='sheetId'){
     for(const dependent of ['masterId','dateField','stateField','value'])delete filters[dependent];
    }
    if(key==='stateField'||key==='mode')delete filters.value;
    request++;
    clearTimeout(timer);timer=setTimeout(load,typing?140:0);
   });
   wrap.append(node('span',label),input);parent.append(wrap);return input;
  }
  field('query','搜尋標題或內容','search').maxLength=256;
  if(config.kind==='logs'){
   field('sheetId','紀錄表格','select');
   field('layout','顯示方式','select');
   field('sort','排序','select');
   const advanced=node('details',undefined,'tool-view-advanced');
   const advancedFields=node('div',undefined,'tool-view-filters');
   advanced.open=config.scope==='master';
   advanced.append(node('summary','主紀錄、日期與欄位篩選'),advancedFields);
   filterPanel.append(advanced);
   for(const [key,label,type] of [
    ['masterId','所屬主紀錄','select'],['dateField','日期欄位','select'],
    ['from','日期由','date'],['to','日期至','date'],['stateField','欄位','select'],['value','欄位值','select']
   ])field(key,label,type,advancedFields);
  }else if(config.kind==='planning'){
   field('mode','檢視','select');
   field('month','月份','month').value=filters.month||new Date().toLocaleDateString('sv-SE').slice(0,7);
   for(const [key,label] of [['sheetId','表格'],['stateField','狀態欄位'],['value','篩選狀態']]){
    field(key,label,'select').parentElement.hidden=filters.mode!=='board';
   }
  }else{
   field('customer','客戶／稱呼','text').maxLength=200;
  }
  function choices(key,options,selected=filters[key]){
   const input=inputs[key];
   input.replaceChildren();
   for(const [value,label] of options){
    const item=node('option',label);item.value=value;input.append(item);
   }
   input.value=options.some(([value])=>value===selected)?selected:(options[0]?.[0]||'');
  }
  if(inputs.mode)choices('mode',[['calendar','月曆行程'],['board','狀態看板']]);
  async function act(action,value){
   try{
    await api.action(action,value,inputs.customer?.value||'');
    if(action==='copy')status.textContent='已複製文字片段。';
   }catch(error){status.textContent=error.message;}
  }
  function card(row){
   const item=node('article',undefined,'tool-view-result');
   const body=node('div',undefined,'tool-view-result-body');
   body.append(node('h3',row.title));
   if(row.detail)body.append(node('small',row.detail));
   if(row.summary)body.append(node('p',row.summary));
   item.append(body,button(config.kind==='snippets'?'複製':'開啟紀錄',()=>act(config.kind==='snippets'?'copy':'visit',row.id)));
   if(row.eventKind)item.dataset.eventKind=row.eventKind;
   return item;
  }
  function showRows(data){
   const list=node('div',undefined,'tool-view-list');
   list.dataset.layout=data.layout||'list';
   if(config.kind==='planning'){
    let current,group;
    for(const row of data.rows){
     if(!group||current!==row.group){
      current=row.group;
      group=node('section',undefined,'tool-view-group');
      group.append(node('h2',current));
      list.append(group);
     }
     group.append(card(row));
    }
   }else{
    for(const row of data.rows)list.append(card(row));
   }
   results.replaceChildren(list);
   if(!data.rows.length){
    const hint=data.restricted&&!data.tables.length?'目前沒有可用的指定表格。請到「設定 → 資料工作區 → 查看紀錄」更新選擇。':
     data.masterRequired&&!inputs.masterId.value?'先選擇主紀錄，即可查看相關明細。':'沒有符合條件的項目。';
    results.append(node('p',hint,'tool-view-empty'));
   }
   if(data.last){
    const pager=node('div',undefined,'tool-view-pager');
    const go=page=>{filters.page=page;load(true);};
    const prev=button('上一頁',()=>go(data.page-1));
    const next=button('下一頁',()=>go(data.page+1));
    prev.disabled=data.page===0;next.disabled=data.page===data.last;
    pager.append(prev,node('span',(data.page+1)+' / '+(data.last+1)),next);
    results.append(pager);
   }
  }
  async function load(focusResults=false){
   if(disposed)return;
   const version=++request;
   results.setAttribute('aria-busy','true');
   try{
    const data=await api.data({...filters});if(version!==request)return;
    filters.page=data.page;
    if(config.kind==='logs'){
     choices('sheetId',data.tables.map(item=>[item.id,item.name]),data.sheetId);
     choices('layout',layouts,data.layout);
     choices('sort',sorts,data.sort);
     choices('masterId',[['',data.masterRequired?'選擇主紀錄':'全部主紀錄'],...data.masters.map(item=>[item.id,item.title])]);
     inputs.masterId.parentElement.hidden=!data.masters.length&&!data.masterRequired;
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
    status.textContent='共 '+data.total+' 筆';
    showRows(data);
    if(focusResults){status.tabIndex=-1;status.focus();}
   }catch(error){
    if(version===request){status.textContent=error.message;results.replaceChildren();}
   }finally{
    if(version===request)results.setAttribute('aria-busy','false');
   }
  }
  load();return {refresh:()=>load(),dispose(){disposed=true;request++;clearTimeout(timer);}};
 }
 window.toolViewsUI={mount};

 const overlay=document.getElementById('tool-overlay'),api=window.toolOverlayAPI;
 if(overlay&&api){
  const header=node('header',undefined,'tool-overlay-bar');
  const tabs=node('div',undefined,'tool-overlay-tabs');
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','切換浮動工具');
  const notice=node('span');notice.setAttribute('role','status');
  const tabButtons={};
  for(const kind of ['planning','snippets']){
   tabButtons[kind]=button(kind==='planning'?'日曆／看板':titles[kind],()=>{
    api.switchTab(kind).catch(error=>notice.textContent=error.message);
   });
   tabs.append(tabButtons[kind]);
  }
  const viewRoot=node('section');
  header.append(tabs,button('關閉',api.close),notice);
  overlay.append(header,viewRoot);
  let view,last;
  const states=new Map();
  const render=({config,theme,fontSize})=>{
   document.documentElement.dataset.theme=theme;
   document.documentElement.dataset.fontSize=fontSize;
   const signature=JSON.stringify(config);
   if(signature===last){view?.refresh();return;}
   view?.dispose();last=signature;
   tabs.hidden=config.kind==='logs';
   for(const [kind,tab] of Object.entries(tabButtons))tab.setAttribute('aria-pressed',String(config.kind===kind));
   const prior=states.get(config.kind);
   const filters=prior?.signature===signature?prior.filters:{query:config.query||'',page:0};
   states.set(config.kind,{signature,filters});
   notice.textContent='';
   view=mount(viewRoot,{
    data:filters=>api.data(config.kind,filters),
    action:(action,value,customer)=>api.action(config.kind,action,value,customer)
   },config,filters);
   document.title=config.kind==='logs'?titles.logs:'日曆／看板與文字片段';
  };
  api.onRefresh(render);
  api.get().then(data=>{if(!last)render(data);})
   .catch(error=>notice.textContent=error.message);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing)api.close();});
 }
})();
