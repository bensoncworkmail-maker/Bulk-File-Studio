'use strict';
(() => {
 function mount(root,api,{inApp=false}={}){
 const $=id=>document.getElementById(id),labels={record:'主紀錄',tracking:'追蹤',snippet:'文字範本',workset:'工作集',view:'儲存檢視'};let payload,busy=false,dirty=false,detail=null,selectedResource=null,previewRevision=null,holdQueue=Promise.resolve();
 const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
 const current=()=>payload?.state.contexts.find(row=>row.id===payload.state.activeContextId)||null;
 const status=(text,error=false)=>{$('desktop-status').textContent=text||'';$('desktop-status').classList.toggle('error',error);};
 function hold(value){dirty=value;holdQueue=holdQueue.then(()=>api.control('hold',value)).catch(error=>status(error.message,true));return holdQueue;}
 function discard(){return !dirty||window.confirm('放棄尚未複製的參數或內容？');}
 function button(text,task,parent){const value=node('button',text);value.type='button';value.addEventListener('click',()=>run(task));parent.append(value);return value;}
 async function run(task){if(busy)return;const wasDirty=dirty;busy=true;renderShell();status('處理中…');try{await holdQueue;const result=await task();if(result?.canceled)status('已取消。');else if(!result?.keepStatus)status('');return result;}catch(error){if(wasDirty&&!dirty)await hold(true);try{receive(await api.get());}catch{}status(error.message,true);}finally{busy=false;renderShell();search.disabled=false;if(!detail)resources();}}
 function renderShell(){if(!payload)return;const selected=current();if(!inApp){document.documentElement.dataset.theme=payload.theme==='light'?'light':'dark';document.documentElement.style.fontSize=(payload.fontSize||13)+'px';}$('desktop-context-icon').hidden=payload.expanded;$('desktop-context-panel').hidden=!payload.expanded;$('icon-open').title=selected?'目前：'+selected.name+'；懸停展開，點擊操作':'工作情境：懸停展開，點擊操作';$('desktop-pin').setAttribute('aria-pressed',String(payload.preferences.pinned));$('desktop-topmost').checked=payload.preferences.topmost;$('desktop-keep-open').checked=payload.preferences.pinned;$('desktop-icon-size').value=String(payload.preferences.iconSize||32);const picker=$('desktop-select');picker.replaceChildren();const none=node('option','未使用情境');none.value='';picker.append(none);for(const row of payload.state.contexts){const option=node('option',row.name);option.value=row.id;picker.append(option);}picker.value=selected?.id||'';picker.disabled=busy||!payload.state.contexts.length;$('desktop-current').textContent=selected?(selected.masterTitle?'主紀錄：'+selected.masterTitle:selected.missingMaster?'主紀錄已移除，請修正連結':'未設定主紀錄'):'選擇客戶或專案，直接開啟相關資源。';$('desktop-manage').textContent=payload.state.contexts.length?'管理情境':'建立情境';for(const id of ['desktop-refresh','desktop-manage','desktop-pin','desktop-topmost','desktop-icon-mode','desktop-hide','desktop-keep-open','desktop-icon-save','desktop-compact','desktop-icon-toolbar','desktop-toolbar-mode'])$(id).disabled=busy;}
 const resourceOrder=['record','workset','tracking','snippet','view'];
 const search=$('desktop-resource-search');
 function resources(){
  const container=$('desktop-resources');
  container.replaceChildren();
  const context=current(),all=context?.resources||[];
  search.hidden=!all.length||Boolean(detail);
  search.disabled=busy;
  const words=search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matched=all.filter(item=>words.every(word=>(labels[item.kind]+' '+item.name).toLocaleLowerCase().includes(word)));
  for(const kind of resourceOrder){
   const items=matched.filter(item=>item.kind===kind);
   if(!items.length)continue;
   const group=node('section'),heading=node('h3',labels[kind]);
   group.className='context-resource-group';
   group.append(heading);
   for(const item of items){
    const value=button(item.name,async()=>{
     if(!discard())return {canceled:true};
     await hold(false);
     const result=await api.resource(item.kind,item.id,context.id);
     if(!result.canceled){
      selectedResource={kind:item.kind,id:item.id,contextId:context.id};
      showDetail(result);
     }
     return result;
    },group);
    value.className='resource-button';
    value.disabled=busy||!item.available;
    if(!item.available)value.title='資源已移除或目前不可用';
   }
   container.append(group);
  }
  if(!matched.length)container.append(node('p',!all.length?'尚無資源，可在「管理情境」加入。':'沒有符合的情境資源。'));
 }
 search.addEventListener('input',resources);
 search.addEventListener('keydown',event=>{
  const buttons=[...$('desktop-resources').querySelectorAll('button')].filter(button=>!button.disabled);
  if(event.key==='ArrowDown'&&buttons.length){event.preventDefault();buttons[0].focus();}
  if(event.key==='Enter'&&buttons.length===1){event.preventDefault();buttons[0].click();}
 });
 function back(){detail=null;selectedResource=null;previewRevision=null;$('desktop-detail').hidden=true;$('desktop-resources').hidden=false;resources();}
 function showDetail(value){detail=value;search.hidden=true;const root=$('desktop-detail');root.replaceChildren();root.hidden=false;$('desktop-resources').hidden=true;button('← 常用資源',async()=>{if(!discard())return {canceled:true};await hold(false);back();},root);root.append(node('h2',value.title));
  if(value.kind==='snippet'){root.append(node('p',value.masterTitle?'將帶入：'+value.masterTitle:'此情境沒有主紀錄'));const fields=[];for(const key of value.parameters){const label=node('label'),input=node('input');label.className='parameter';label.append(node('span',key),input);root.append(label);fields.push([key,input]);input.addEventListener('input',()=>{previewRevision=null;preview.value='';copy.disabled=true;void hold(true);});}const preview=node('textarea');preview.readOnly=true;preview.setAttribute('aria-label','文字預覽');root.append(preview);const values=()=>Object.fromEntries(fields.map(([key,input])=>[key,input.value]));let generation=0;for(const [,input]of fields)input.addEventListener('input',()=>generation++);button('預覽文字',async()=>{const ticket=generation,result=await api.snippet(value.id,value.contextId,values(),false);if(ticket!==generation)return {keepStatus:true};preview.value=result.text;previewRevision=result.revision;copy.disabled=false;},root);const copy=button('複製文字',async()=>{const ticket=generation,result=await api.snippet(value.id,value.contextId,values(),true,previewRevision);if(ticket===generation){preview.value=result.text;await hold(false);}status('文字已複製，可到其他程式貼上。');return {keepStatus:true};},root);copy.disabled=true;}
  else if(value.kind==='record'){root.append(node('pre',value.notes||''));for(const field of value.fields){const row=node('div');row.className='detail-row';row.append(node('strong',field.label),node('span',String(field.value??'')));root.append(row);}for(const link of value.links){const row=node('div');row.className='detail-row';row.append(node('strong',link.label),node('small',link.path));for(const [action,label]of [['open','開啟'],['show','所在位置'],['copy','複製路徑']])button(label,()=>api.file(value.token,link.index,action),row);root.append(row);}}
  else if(value.kind==='tracking'){window.desktopContextFiles.mount(root,value,{file:(index,action)=>run(()=>api.file(value.token,index,action)),copy:indices=>run(async()=>{const result=await api.files(value.token,indices);status('已複製 '+result.copied+' 項路徑。');return {keepStatus:true};})});}
  else{if(value.kind==='workset')root.append(node('p','已開啟 '+value.opened+' 個位置'+(value.failures?.length?'；未開啟：'+value.failures.join('；'):'')));root.append(node('p','共 '+value.total+' 筆紀錄'+(value.total>200?'；顯示前 200 筆':'')));for(const item of value.rows)button(item.title,async()=>showDetail(await api.record(value.token,item.id)),root);}
 }
 function receive(next){const previous=current()?.id;payload=next;renderShell();if(previous!==current()?.id){search.value='';if(!dirty)back();else status('目前情境已更新，請保留文字並重新開啟範本。',true);}else if(!detail)resources();}
 $('desktop-select').addEventListener('change',()=>{const id=$('desktop-select').value||null;void run(async()=>{if(!discard())return {canceled:true};await hold(false);const result=await api.select(id,payload.state.revision);payload={...payload,state:result};search.value='';back();status('情境已切換，主視窗不會被叫出。');return {keepStatus:true};});});
 $('desktop-keep-open').addEventListener('change',()=>{const value=$('desktop-keep-open').checked;return run(()=>api.control('pin',value));});$('desktop-icon-save').addEventListener('click',()=>{const value=Number($('desktop-icon-size').value);return run(()=>api.control('icon-size',value));});$('desktop-toolbar-mode').addEventListener('click',()=>run(()=>api.control('toolbar')));$('desktop-compact').addEventListener('click',()=>run(()=>api.control('compact')));$('desktop-icon-toolbar').addEventListener('click',()=>run(async()=>{if(!discard())return {canceled:true};await hold(false);return api.control('icon');}));
 $('desktop-pin').addEventListener('click',()=>run(()=>api.control('pin',!payload.preferences.pinned)));$('desktop-topmost').addEventListener('change',()=>{const value=$('desktop-topmost').checked;return run(()=>api.control('topmost',value));});$('desktop-refresh').addEventListener('click',()=>run(async()=>{if(selectedResource){if(!discard())return {canceled:true};await hold(false);showDetail(await api.resource(selectedResource.kind,selectedResource.id,selectedResource.contextId));}else receive(await api.get());}));$('desktop-manage').addEventListener('click',()=>run(async()=>{if(!discard())return {canceled:true};await hold(false);return api.manage();}));
 for(const [id,action]of [['desktop-icon-mode','icon'],['desktop-hide','hide']])$(id).addEventListener('click',()=>run(async()=>{if(!discard())return {canceled:true};await hold(false);return api.control(action);}));
 $('desktop-context-icon').addEventListener('pointerenter',()=>api.control('hover').catch(error=>status(error.message,true)));$('desktop-context-panel').addEventListener('pointerenter',()=>api.control('enter').catch(()=>{}));document.body.addEventListener('pointerleave',()=>api.control('leave').catch(()=>{}));$('icon-open').addEventListener('click',()=>api.control('expand').catch(error=>status(error.message,true)));
 document.addEventListener('keydown',event=>{if(inApp)return;if(event.key==='Escape'&&!busy){event.preventDefault();event.stopImmediatePropagation?.();void run(async()=>{if(!discard())return {canceled:true};await hold(false);if(detail)back();else return api.control('icon');});}});window.addEventListener('focus',()=>{if(!busy)api.get().then(receive).catch(error=>status(error.message,true));if(!inApp&&payload?.expanded&&!dirty)($('desktop-select').disabled?$('desktop-manage'):$('desktop-select')).focus();});api.onChanged(receive);api.get().then(receive).catch(error=>status(error.message,true));return {requestClose:async()=>{if(busy||!discard())return false;const hadEdits=dirty;await hold(false);if(hadEdits)back();return true;},refresh:()=>api.get().then(receive).catch(error=>status(error.message,true)),dispose(){}};
 }
 window.desktopContextView={mount};if(window.desktopContextAPI&&!document.getElementById('app-context-dialog')&&!document.getElementById('floating-context-template'))mount(document.body,window.desktopContextAPI);
})();
