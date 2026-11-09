'use strict';
(() => {
 const api=window.draftAPI,structured=window.structuredNoteModel,$=id=>document.getElementById(id);
 const type=$('draft-type');
 let itemsEditor;
 const title=$('title'),body=$('body'),sheet=$('sheet'),master=$('master'),status=$('status');
 let current=null,summaries=[],sheets=[],timer,writing,busy=false,closeRequested=false,closing=false;
 let listFocusRequested=false,draftSplit;
 let mastersRequest=0,attachmentsRequest=0,preferences={draftLocalShortcuts:true,draftReminders:true,draftBodyLimit:100000},bodyResizeTimer;
 const message=error=>String(error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/i,'');
 function report(text,error=false){status.textContent=text;status.dataset.error=String(error);}
 function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
 function option(value,text){const node=el('option',text);node.value=value;return node;}
 for(const [key,label] of Object.entries(structured.TYPES))type.append(option(key,label));
 function draftItems(){return itemsEditor?.value()||[];}
 function renderItems(items){
  const host=$('draft-items'),enabled=structured.isType(type.value);
  host.hidden=!enabled;
  $('draft-type-hint').hidden=type.value!=='timeline';
  $('draft-type-hint').textContent='輸出時按日期排列';
  $('draft-transfer-hint').hidden=!enabled;
  itemsEditor=enabled?window.structuredNoteUI.editor(type.value,items,inputChanged):null;
  if(itemsEditor)itemsEditor.element.dataset.type=type.value;
  host.replaceChildren(...(itemsEditor?[itemsEditor.element]:[]));
 }
 type.addEventListener('change',()=>{
  const previous=itemsEditor?.element.dataset.type||'text';
  if(draftItems().length&&!window.confirm('切換類型會移除目前的清單項目。要繼續嗎？')){
   type.value=previous;
   return;
  }
  renderItems([]);inputChanged();
 });
 function caption(draft){return draft.title.trim()||draft.summary.trim()||'未命名草稿';}
 function renderList(){
  const buttons=summaries.map(draft=>{
   const button=el('button',caption(draft));
   button.type='button';button.dataset.draftId=draft.id;button.title=button.textContent;button.disabled=busy;
   if(draft.id===current?.id)button.setAttribute('aria-current','true');
   button.addEventListener('click',()=>{listFocusRequested=true;return run(async()=>showDraft(await api.read(draft.id)));});
   return button;
  });
  $('drafts').replaceChildren(...buttons);
 }
 function remember(draft){
  summaries=[{id:draft.id,title:draft.title,summary:(draft.body.trim()||draft.items?.[0]?.label||'').slice(0,80)},...summaries.filter(item=>item.id!==draft.id)];
  renderList();
 }
 function updateSend(){
  $('send').disabled=!current||!sheet.value||(!$('master-field').hidden&&!master.value)||
   (!title.value.trim()&&!body.value.trim()&&!draftItems().length&&!current.attachments.length);
 }
 function renderAttachments(){
  const target=$('attachments'),request=++attachmentsRequest;
  target.replaceChildren();
  if(!current)return;
  for(const [index,item] of current.attachments.entries()){
   const row=el('li'),label=el('span',item.image?'貼上的圖片 '+(index+1):item.path);
   label.title=item.path;
   if(item.image){
    const preview=el('img');preview.alt='貼上的圖片 '+(index+1);
    api.image(current.id,index).then(source=>{if(request===attachmentsRequest){preview.src=source;row.prepend(preview);}})
     .catch(()=>{if(request===attachmentsRequest)label.textContent+='（無法預覽）';});
   }
   const previewButton=el('button','預覽');previewButton.type='button';previewButton.title='預覽 '+item.path;previewButton.addEventListener('click',()=>run(async()=>showPreview(await api.preview(current.id,index))));
   const remove=el('button','移除');remove.type='button';remove.setAttribute('aria-label','移除 '+label.textContent);
   remove.addEventListener('click',()=>changeAttachments(()=>api.remove(current.id,current.version,index)));
   row.append(label,previewButton,remove);target.append(row);
  }
 }
 function showDraft(draft){
  current=draft;
  type.value=draft?.type||'text';renderItems(draft?.items||[]);
  $('send-reminder').checked=false;
  title.value=draft?.title||'';body.value=draft?.body||'';if(preferences.draftBodyLimit>0)body.maxLength=Math.max(preferences.draftBodyLimit,body.value.length);updateCount();
  $('empty').hidden=Boolean(draft);$('editor').hidden=!draft;
  renderList();renderAttachments();updateSend();
 }
 function dirty(){return current&&(title.value!==current.title||body.value!==current.body||type.value!==(current.type||'text')||JSON.stringify(draftItems())!==JSON.stringify(current.items||[]));}
 function flush(){
  clearTimeout(timer);
  if(writing)return writing;
  if(!dirty())return Promise.resolve();
  writing=(async()=>{
   while(dirty()){
    report('正在儲存…');
    current=await api.save(current.id,current.version,{title:title.value,body:body.value,type:type.value,items:draftItems()});
    remember(current);
   }
   report('已自動儲存');
  })().finally(()=>{writing=null;});
  return writing;
 }
 function setBusy(value){
  busy=value;
  $('editor').disabled=value;
  $('new-draft').disabled=value;
  for(const button of $('drafts').querySelectorAll('button'))button.disabled=value;
 }
 async function run(task){
  if(busy||closing)return;
  setBusy(true);
  try{await flush();await task();}
  catch(error){report(message(error),true);}
  finally{
   setBusy(false);updateSend();
   if(listFocusRequested){listFocusRequested=false;[...$('drafts').querySelectorAll('button')].find(button=>button.dataset.draftId===current?.id)?.focus();}
   if(closeRequested)void closeEditor();
  }
 }
 async function closeEditor(){
  if(closing)return;
  if(busy){closeRequested=true;return;}
  closeRequested=false;closing=true;setBusy(true);
  try{await flush();await api.close();}
  catch(error){
   report('草稿尚未儲存。'+message(error),true);
   closing=false;setBusy(false);
   await api.cancelClose().catch(()=>{});
  }
 }
 api.onClose(()=>void closeEditor());

 async function loadMasters(){
  const request=++mastersRequest,selected=sheets.find(item=>item.id===sheet.value);
  const requiresMaster=Boolean(selected?.parentSheetId);
  const previous=master.value;
  $('master-field').hidden=!requiresMaster;
  master.replaceChildren(option('',requiresMaster?'正在載入…':'請選擇主紀錄'));
  updateSend();
  if(!requiresMaster)return;
  try{
   const choices=await api.masters(selected.id);
   if(request!==mastersRequest)return;
   master.replaceChildren(option('',choices?.length?'請選擇主紀錄':'沒有可用主紀錄'),
    ...(choices||[]).map(item=>option(item.id,item.title)));
   if(choices?.some(item=>item.id===previous))master.value=previous;
   updateSend();
  }catch(error){
   if(request===mastersRequest){master.replaceChildren(option('','請更新表格'));report(message(error),true);}
  }
 }
 async function refreshTargets(data){
  const previous=sheet.value;sheets=data.sheets;
  sheet.replaceChildren(option('',sheets.length?'請選擇表格':'工作區尚無表格'),
   ...sheets.map(item=>option(item.id,item.group?item.group+' ／ '+item.name:item.name)));
  if(sheets.some(item=>item.id===previous))sheet.value=previous;
  await loadMasters();
 }
 async function nextDraft(removed){
  summaries=summaries.filter(item=>item.id!==removed);
  showDraft(null);
  if(summaries.length)showDraft(await api.read(summaries[0].id));
 }
 function changeAttachments(task){
  return run(async()=>{
   current=await task();remember(current);renderAttachments();report('附件已自動儲存');
  });
 }
 function inputChanged(){
  clearTimeout(timer);updateCount();report('等候自動儲存…');updateSend();
  timer=setTimeout(()=>flush().catch(error=>report('無法儲存。'+message(error),true)),350);
 }
 for(const input of [title,body])input.addEventListener('input',inputChanged);
 document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){if(document.querySelector('dialog[open]'))return;event.preventDefault();void closeEditor();return;}
  if(preferences.draftLocalShortcuts!==false&&!document.querySelector('dialog[open]')){
   const command=(event.ctrlKey||event.metaKey)&&!event.altKey;
   if(command&&event.key.toLowerCase()==='n'&&!event.shiftKey){event.preventDefault();$('new-draft').click();return;}
   if(command&&event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();if(current)$('save-as').click();return;}
   if(event.altKey&&!event.ctrlKey&&!event.metaKey&&event.key.toLowerCase()==='r'){event.preventDefault();if(preferences.draftReminders&&current){$('draft-reminder').open=true;$('reminder-at').focus();}return;}
   if(event.key==='Delete'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&event.target.closest?.('#drafts')&&event.target.dataset.draftId===current?.id){event.preventDefault();$('delete').click();return;}
  }
  if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='s'){
   event.preventDefault();void flush().catch(error=>report('無法儲存。'+message(error),true));
  }
 });
 document.addEventListener('paste',event=>{
  if(!current||busy||closing)return;
  const items=[...event.clipboardData.items].filter(item=>item.kind==='file'&&item.type.startsWith('image/'));
  if(!items.length)return;
  event.preventDefault();
  const image=items.find(item=>item.type==='image/png')?.getAsFile();
  if(!image||image.size>5*1024*1024){report('請貼上 5 MB 以下的 PNG 圖片。',true);return;}
  void changeAttachments(async()=>api.paste(current.id,current.version,new Uint8Array(await image.arrayBuffer())));
 });
 document.addEventListener('dragover',event=>{
  if(!event.dataTransfer.types.includes('Files'))return;
  event.preventDefault();
  event.dataTransfer.dropEffect=current&&!busy&&!closing?'link':'none';
  document.body.classList.toggle('dragging',Boolean(current&&!busy&&!closing));
 });
 document.addEventListener('dragleave',event=>{
  if(!event.relatedTarget)document.body.classList.remove('dragging');
 });
 document.addEventListener('drop',event=>{
  if(!event.dataTransfer.types.includes('Files'))return;
  event.preventDefault();document.body.classList.remove('dragging');
  if(!current||busy||closing)return;
  try{
   const paths=[...event.dataTransfer.files].map(file=>api.pathForFile(file)).filter(Boolean);
   if(!paths.length)throw new Error('找不到檔案路徑，請從檔案總管拖入');
   void changeAttachments(()=>api.attach(current.id,current.version,paths));
  }catch(error){report(message(error),true);}
 });
 $('new-draft').addEventListener('click',()=>run(async()=>{
  const draft=await api.newDraft();showDraft(draft);remember(draft);report('新草稿已儲存');
  setBusy(false);title.focus();
 }));
 $('delete').addEventListener('click',()=>{
  if(!window.confirm('刪除此草稿？'))return;
  void run(async()=>{const {id,version}=current;await api.deleteDraft(id,version);await nextDraft(id);report('已刪除草稿');});
 });
 $('refresh').addEventListener('click',()=>run(async()=>refreshTargets(await api.data())));
 sheet.addEventListener('change',()=>{master.value='';void loadMasters();});
 master.addEventListener('change',updateSend);
 $('send').addEventListener('click',()=>run(async()=>{
  const {id,version}=current;
  const withReminder=$('send-reminder').checked;
  const result=await api.send(id,version,sheet.value,master.value,withReminder);
  await nextDraft(id);
  report('已在「'+result.sheet+'」建立紀錄'+(result.reminderRequested?'，請在主視窗設定提醒。':''));
 }));
 function applyPreferences(settings){
  const previous=preferences;preferences={...preferences,...settings};
  if(settings.theme)document.documentElement.dataset.theme=settings.theme;
  if(settings.fontSize)document.documentElement.style.fontSize=settings.fontSize+'px';
  if(preferences.draftBodyLimit>0)body.maxLength=Math.max(preferences.draftBodyLimit,body.value.length);else body.removeAttribute('maxlength');
  if(previous.draftBodyHeight!==preferences.draftBodyHeight)body.style.height=(preferences.draftBodyHeight||280)+'px';
  if(previous.draftListWidth!==preferences.draftListWidth)draftSplit?.set(preferences.draftListWidth||170);
  $('draft-reminder').hidden=preferences.draftReminders===false;updateCount();
 }
 api.onSettings?.(applyPreferences);
 function updateCount(){const limit=preferences.draftBodyLimit||0;$('char-count').textContent=body.value.length.toLocaleString()+(limit?' / '+limit.toLocaleString()+' 字':' 字 · 不設字數上限');}
 async function showPreview(value){
  if(!value||value.canceled)return;
  if(value.opened){report('已開啟預覽：'+value.name);return;}
  const root=$('attachment-preview-content');root.replaceChildren();$('attachment-preview-title').textContent=value.name;
  if(value.type==='image'){const img=el('img');img.alt=value.name;img.src=value.data;root.append(img);}
  else root.append(el('pre',value.text));
  $('attachment-preview').showModal();
 }
 $('preview-close').addEventListener('click',()=>$('attachment-preview').close());
 $('attachment-preview').addEventListener('close',()=>$('attachment-preview-content').replaceChildren());
 for(const type of window.draftExportTypes.TYPES)$('export-type').append(option(type.extension,type.label));$('export-type').append(option('custom','自訂副檔名…'));$('export-type').value='txt';$('export-type').addEventListener('change',()=>{$('export-custom').hidden=$('export-type').value!=='custom';});
 $('save-as').addEventListener('click',()=>{if(current&&!busy)$('export-dialog').showModal();});
 $('export-confirm').addEventListener('click',()=>{const extension=$('export-type').value==='custom'?$('export-extension').value:$('export-type').value;void run(async()=>{const result=await api.export(current.id,current.version,extension);if(!result.canceled){$('export-dialog').close();report('已另存：'+result.path);}});});
 $('reminder-save').addEventListener('click',()=>run(async()=>{const at=new Date($('reminder-at').value);if(!Number.isFinite(at.getTime()))throw new Error('請選擇提醒時間');await api.remind(current.id,current.version,{at:at.toISOString(),repeat:$('reminder-repeat').value});report('草稿提醒已建立；可在提醒排程中管理，送出或刪除草稿後仍會保留。');}));
 const bodyObserver=new ResizeObserver(()=>{clearTimeout(bodyResizeTimer);if(!current)return;bodyResizeTimer=setTimeout(()=>{const height=Math.round(body.getBoundingClientRect().height);if(height>=140&&height<=2000)api.configure({draftBodyHeight:height}).catch(error=>report('編輯高度未能儲存：'+message(error),true));},350);});bodyObserver.observe(body);
 void run(async()=>{
  const data=await api.data();
  document.documentElement.dataset.theme=data.theme;
  document.documentElement.dataset.font=data.fontSize;
  applyPreferences(data.preferences||{});
  document.documentElement.style.fontSize=data.fontSize+'px';
  body.style.height=(preferences.draftBodyHeight||280)+'px';
  $('draft-reminder').hidden=preferences.draftReminders===false;
  draftSplit=window.resizableSplit.attach($('draft-layout'),{width:preferences.draftListWidth||170,min:110,max:600,label:'調整草稿清單寬度',save:width=>api.configure({draftListWidth:width})});
  const localDate=new Date(Date.now()+3600000);$('reminder-at').value=new Date(localDate.getTime()-localDate.getTimezoneOffset()*60000).toISOString().slice(0,16);
  summaries=data.drafts;
  const draft=summaries.length?await api.read(summaries[0].id):await api.newDraft();
  showDraft(draft);remember(draft);
  await refreshTargets(data);
  report('草稿儲存在本機');
  setBusy(false);body.focus();
 });
})();
