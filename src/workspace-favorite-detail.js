'use strict';
(() => {
 const $=id=>document.getElementById(id),M=window.notesModel,api=window.workspaceAPI;
 const key=item=>item.kind+':'+item.id;
 let bookmarks=[],callbacks,current=null,documentData=null,files=[],request=0,loading=false,error='',back=null,expandedNotes=false,noteObserver;
 const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
 function button(text,task,className='btn btn-ghost'){
  const control=node('button',text,className);control.type='button';control.disabled=callbacks.isBusy();
  control.addEventListener('click',async()=>{if(callbacks.isBusy())return;try{await task();}catch(error){callbacks.showFailure('收藏操作未完成',error);}});return control;
 }
 function close(focus=true){
  const prior=current;current=null;documentData=null;request++;render();callbacks.onSelect();
  if(focus&&prior){const rows=$('workspace-favorite-list').querySelectorAll('.workspace-favorite-link');for(const control of rows)if(control.dataset.target===key(prior)){control.focus();break;}}
 }
 async function show(item,returnTo=null){
  if(callbacks.isBusy())return;
  current={...item,...bookmarks.find(value=>key(value)===key(item))};back=returnTo;expandedNotes=false;documentData=null;$('workspace-favorite-detail-body').scrollTop=0;
  callbacks.onSelect();await refresh();
 }
 async function refresh(){
  if(!current)return;
  const id=++request;loading=true;error='';render();
  try{
   const [state,locations]=await Promise.all([api.get(),api.favorites()]);
   if(id!==request)return;
   documentData=state.document;files=locations.items;
  }catch(reason){if(id!==request)return;error=String(reason.message||reason);}
  finally{if(id===request){loading=false;render();}}
 }
 function tags(parent,label,values){
  if(!values?.length)return;
  const group=node('div',undefined,'workspace-favorite-detail-tags');group.append(node('small',label));
  for(const tag of values)group.append(label==='收藏標籤'?button(tag,()=>callbacks.onTag(tag),'favorite-badge'):node('span',tag,'favorite-badge'));
  parent.append(group);
 }
 function textValue(parent,record,field,value){
  const text=M.cell(documentData,field,value)||'—';
  if(M.structured.isType(field.type)&&value?.length&&window.structuredNoteUI){parent.append(window.structuredNoteUI.view(field.type,value));return;}
  const links=['url','text','longtext'].includes(field.type)?window.webLinkModel?.links(text,{whole:field.type==='url'})||[]:[];
  if(!links.length){parent.textContent=text;return;}
  let end=0;
  for(const link of links){
   if(link.start>end)parent.append(node('span',text.slice(end,link.start)));
   parent.append(button(link.text,()=>api.openWebsite(record.id,field.id,'open',link.text),'notes-website-link'));
   end=link.start+link.text.length;
  }
  if(end<text.length)parent.append(node('span',text.slice(end)));
 }
 function recordBody(body,record,sheet,settings){
  tags(body,'紀錄標籤',record.tags);
  const fields=node('dl',undefined,'workspace-favorite-detail-fields');
  for(const field of sheet.fields){const value=node('dd');textValue(value,record,field,record.values[field.id]);fields.append(node('dt',field.label),value);}
  body.append(fields);
  if(record.notes){
   body.append(node('h3','筆記'));
   const notes=node('div',record.notes,'workspace-favorite-detail-notes'),lines=settings.notesDetailPreviewLines;
   if(lines&&!expandedNotes){notes.style.setProperty('--favorite-note-lines',lines);notes.dataset.collapsed='true';}
   body.append(notes);
   if(lines){
    notes.id='workspace-favorite-detail-note';
    const toggle=button(expandedNotes?'收合筆記':'展開筆記',()=>{expandedNotes=!expandedNotes;render();});
    toggle.setAttribute('aria-expanded',String(expandedNotes));toggle.setAttribute('aria-controls',notes.id);
    const update=()=>{toggle.hidden=!expandedNotes&&notes.scrollHeight<=notes.clientHeight+1;};
    body.append(toggle);update();
    if(typeof ResizeObserver!=='undefined'){noteObserver=new ResizeObserver(update);noteObserver.observe(notes);}
   }
  }
  if(record.fileLinks.length){
   body.append(node('h3','相關檔案／資料夾'));
   record.fileLinks.forEach((link,index)=>{
    const favorite=files.find(item=>item.id===link.favoriteId),path=favorite?.path||link.path;
    const row=node('div',undefined,'workspace-favorite-detail-file');
    row.append(button(favorite?.label||link.label||path.split(/[\\/]/).pop()||path,()=>api.openLink(record.id,index,'open'),'notes-file-link notes-file-name'),button(path,()=>api.openLink(record.id,index,'show'),'notes-file-link notes-file-location'));
    const actions=node('div',undefined,'workspace-favorite-actions');
    if(settings.notesShowFileLinkButtons)actions.append(button('開啟',()=>api.openLink(record.id,index,'open')),button('定位',()=>api.openLink(record.id,index,'show')));
    if(settings.notesShowDetailCopy)actions.append(button('複製路徑',()=>api.openLink(record.id,index,'copy')));
    row.append(actions);body.append(row);
   });
  }
  if(record.updatedAt){const date=new Date(record.updatedAt);body.append(node('p','最後修改：'+(Number.isNaN(date.valueOf())?record.updatedAt:date.toLocaleString('zh-HK')),'notes-hint'));}
 }
 function tableBody(body,sheet){
  const records=documentData.records.filter(item=>item.sheetId===sheet.id&&M.live(documentData,item));
  body.append(node('p',sheet.fields.length+' 個欄位・'+records.length+' 筆紀錄','notes-hint'),node('h3','表格欄位'));
  const fields=node('div',undefined,'workspace-favorite-detail-tags');for(const field of sheet.fields)fields.append(node('span',field.label,'favorite-badge'));body.append(fields);
  body.append(node('h3','紀錄預覽'));
  if(!records.length)body.append(node('p','此表格尚無紀錄。','notes-hint'));
  for(const record of records.slice(0,20)){
   const context=M.recordContext(documentData,record);
   const control=button('',()=>show({kind:'record',id:record.id,title:record.title,available:true,saved:false,tags:[],transient:true,context:context.area+' ／ '+context.sheet},current),'notes-related');
   control.append(node('strong',record.title));if(context.masters.length)control.append(node('small',context.masters.join('、')));body.append(control);
  }
  if(records.length>20)body.append(node('p','顯示前 20 筆；可在工作區查看全部紀錄。','notes-hint'));
 }
 function render(){
  noteObserver?.disconnect();noteObserver=null;
  const panel=$('workspace-favorite-detail'),layout=$('workspace-favorite-content-layout');
  panel.hidden=!current;layout.dataset.detail=String(Boolean(current));if(!current)return;
  panel.setAttribute('aria-busy',String(loading));
  const body=$('workspace-favorite-detail-body'),scroll=body.scrollTop||0;body.replaceChildren();
  body.append(node('h2',current.title));
  if(current.context)body.append(node('p',current.context,'notes-hint'));
  const actions=node('div',undefined,'workspace-favorite-detail-actions');
  if(back)actions.append(button('返回表格',()=>show(back)));
  if(current.available)actions.append(button('在工作區開啟',()=>callbacks.open(current)));
  actions.append(button(current.saved?'編輯標籤':'加入收藏',()=>callbacks.edit(current)));
  if(current.saved)actions.append(button('移除收藏',()=>callbacks.remove(current)));
  body.append(actions);tags(body,'收藏標籤',current.tags);
  if(current.logPinned)body.append(node('p',current.saved?'查看紀錄已釘選':'僅釘選・尚未加入收藏','notes-hint'));
  if(loading){body.append(node('p','讀取詳情…','notes-hint'));return;}
  if(error){body.append(node('p',error,'notes-status error'),button('重新讀取',refresh));return;}
  if(!documentData)return;
  const record=current.kind==='record'?documentData.records.find(item=>item.id===current.id&&M.live(documentData,item)):null;
  const sheet=documentData.sheets.find(item=>item.id===(current.kind==='sheet'?current.id:record?.sheetId)&&!item.deletedAt);
  if(!sheet){body.append(node('p','項目已移除或在回收筒。可移除收藏，或回工作區還原資料。','notes-hint'));return;}
  const settings=window.settingsUI.get();
  if(record){
   if(settings.notesShowDetailCopy)actions.append(button('複製總覽',async()=>{await api.copy({kind:'overview',ids:[record.id]});callbacks.showToast('已複製紀錄總覽');}),button('複製 CSV',async()=>{await api.copy({kind:'csv',ids:[record.id]});callbacks.showToast('已複製 CSV');}));
   recordBody(body,record,sheet,settings);
  }else tableBody(body,sheet);
  body.scrollTop=scroll;
 }
 function update(items){
  bookmarks=items;
  if(!current)return;
  const latest=items.find(item=>key(item)===key(current));
  if(latest)current={...latest};
  else if(current.transient)current={...current,saved:false,tags:[]};
  else{close(false);return;}
  render();
 }
 window.workspaceFavoriteDetailUI={
  init:options=>{callbacks=options;$('workspace-favorite-detail-close').addEventListener('click',()=>close());},
  show,refresh,render,update,isCurrent:item=>Boolean(current&&key(item)===key(current)),
  removed:item=>{if(current&&key(current)===key(item))close(false);}
 };
})();
