'use strict';
(() => {
 const api=window.draftAPI,$=id=>document.getElementById(id);
 const title=$('title'),body=$('body'),sheet=$('sheet'),master=$('master'),status=$('status');
 let current=null,summaries=[],sheets=[],timer,writing,busy=false,closeRequested=false,closing=false;
 let mastersRequest=0,attachmentsRequest=0;
 const message=error=>String(error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/i,'');
 function report(text,error=false){status.textContent=text;status.dataset.error=String(error);}
 function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
 function option(value,text){const node=el('option',text);node.value=value;return node;}
 function caption(draft){return draft.title.trim()||draft.summary.trim()||'未命名草稿';}
 function renderList(){
  const buttons=summaries.map(draft=>{
   const button=el('button',caption(draft));
   button.type='button';button.title=button.textContent;button.disabled=busy;
   if(draft.id===current?.id)button.setAttribute('aria-current','true');
   button.addEventListener('click',()=>run(async()=>showDraft(await api.read(draft.id))));
   return button;
  });
  $('drafts').replaceChildren(...buttons);
 }
 function remember(draft){
  summaries=[{id:draft.id,title:draft.title,summary:draft.body.slice(0,80)},...summaries.filter(item=>item.id!==draft.id)];
  renderList();
 }
 function updateSend(){
  $('send').disabled=!current||!sheet.value||(!$('master-field').hidden&&!master.value)||
   (!title.value.trim()&&!body.value.trim()&&!current.attachments.length);
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
   const remove=el('button','移除');remove.type='button';remove.setAttribute('aria-label','移除 '+label.textContent);
   remove.addEventListener('click',()=>changeAttachments(()=>api.remove(current.id,current.version,index)));
   row.append(label,remove);target.append(row);
  }
 }
 function showDraft(draft){
  current=draft;
  $('send-reminder').checked=false;
  title.value=draft?.title||'';body.value=draft?.body||'';
  $('empty').hidden=Boolean(draft);$('editor').hidden=!draft;
  renderList();renderAttachments();updateSend();
 }
 function dirty(){return current&&(title.value!==current.title||body.value!==current.body);}
 function flush(){
  clearTimeout(timer);
  if(writing)return writing;
  if(!dirty())return Promise.resolve();
  writing=(async()=>{
   while(dirty()){
    report('正在儲存…');
    current=await api.save(current.id,current.version,{title:title.value,body:body.value});
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
 for(const input of [title,body])input.addEventListener('input',()=>{
  clearTimeout(timer);report('等候自動儲存…');updateSend();
  timer=setTimeout(()=>flush().catch(error=>report('無法儲存。'+message(error),true)),350);
 });
 document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.isComposing||event.keyCode===229)return;
  if(event.key==='Escape'){event.preventDefault();void closeEditor();return;}
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
 void run(async()=>{
  const data=await api.data();
  document.documentElement.dataset.theme=data.theme;
  document.documentElement.dataset.font=data.fontSize;
  summaries=data.drafts;
  const draft=summaries.length?await api.read(summaries[0].id):await api.newDraft();
  showDraft(draft);remember(draft);
  await refreshTargets(data);
  report('草稿儲存在本機');
  setBusy(false);body.focus();
 });
})();
