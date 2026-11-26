'use strict';

(() => {
 const api=window.logSticker,$=id=>document.getElementById(id),header=$('sticker-header'),heading=$('heading');
 let updated=false,changing=false,drag=null,lastTap=null,lastPointerToggle=-Infinity,finishedDrag=Promise.resolve();
 let current,editSession=null,editPending=false;
 const draftBody=$('draft-body');
 function error(message){const status=$('status');status.hidden=false;status.textContent=message;}
 const report=failure=>error(failure.message);
 function text(tag,label){
  const node=document.createElement(tag);
  node.textContent=label;
  return node;
 }
 function linkButton(label,action){
  const control=text('button',label);
  control.type='button';control.className='sticker-link';control.title=label;
  if(action)control.addEventListener('click',action);
  return control;
 }
 function fileCell(label,action,mode){
  const cell=document.createElement('td');
  const control=linkButton(label,event=>{if(event.detail===0)return action();});
  cell.append(control);
  if(mode==='single')cell.addEventListener('click',event=>{if(event.detail===1)return action();});
  else cell.addEventListener('dblclick',action);
  return cell;
 }
 function render(data){
  updated=true;current=data;
  const style=document.documentElement.style;
  style.setProperty('--sticker-background',data.background);
  style.setProperty('--sticker-foreground',data.foreground);
  style.setProperty('--sticker-header-background',data.headerBackground||'#d5eaf8');
  style.setProperty('--sticker-header-foreground',data.headerForeground||'#203749');
  style.setProperty('--sticker-header-height',(data.size?.collapsedHeight||36)+'px');
  $('sticker-grip').hidden=data.showGrip!==true;
  document.body.classList.toggle('header-at-bottom',data.headerAtBottom===true);
  if(heading.textContent!==data.heading)heading.textContent=data.heading;
  heading.title=data.heading+' ／ 雙擊'+(data.collapsed?'展開':'收合')+' · 拖曳移動 · 右鍵選單';
  heading.setAttribute('aria-expanded',String(!data.collapsed));
  const title=$('title');
  const label=data.visit?linkButton(data.title,()=>api.visit().catch(report)):text('span',data.title);
  if(data.visit){label.className='sticker-title-link';label.title=data.visit;label.setAttribute('aria-label',data.title+' · '+data.visit);}
  title.replaceChildren(label);
  $('notes').textContent=data.notes;
  renderEditor();
  $('fields').replaceChildren(...data.fields.flatMap(({label,value})=>[text('dt',label),text('dd',value)]));
  const items=data.items||[];
  $('tag-items').replaceChildren(...items.map(label=>text('li',label)));
  $('tag-items').hidden=!items.length;
  const rows=[],links=[];
  for(const [index,{kind,label,location,ref}] of data.links.entries()){
   if(location!==undefined){
    const open=()=>kind==='item'?api.openItem().catch(report):api.openLink(index,ref??data.version,'open',location).catch(report);
    const locate=()=>kind==='item'?api.locate().catch(report):api.openLink(index,ref??data.version,'show',location).catch(report);
    const row=document.createElement('tr');row.append(fileCell(label,open,data.openClick),fileCell(location,locate,data.locationClick));rows.push(row);
   }else links.push(linkButton(label,()=>api.openLink(index,data.version).catch(report)));
  }
  const openGesture=data.openClick==='single'?'單擊':'雙擊',locateGesture=data.locationClick==='single'?'單擊':'雙擊';
  $('attachment-hint').textContent=openGesture+'名稱開啟，'+locateGesture+'位置在檔案總管定位。';
  $('attachment-rows').replaceChildren(...rows);
  $('attachments').hidden=!rows.length;
  $('links').replaceChildren(...links);
  $('links').hidden=!links.length;
  $('record').hidden=data.collapsed;
  if(!editSession)$('status').hidden=true;
 }

 function renderEditor(){
  const editable=current?.kind==='draft',editing=editable&&editSession!==null;
  $('edit-draft').hidden=!editable||editing;
  $('edit-draft').disabled=editPending;
  $('draft-editor').hidden=!editing;
  $('notes').hidden=editing||!current?.notes;
  draftBody.readOnly=editPending;
  $('save-draft').disabled=editPending;
  $('cancel-draft').disabled=editPending;
 }
 $('edit-draft').addEventListener('click',async()=>{
  if(editPending)return;
  editPending=true;renderEditor();
  try{
   editSession=await api.readDraft();
   draftBody.value=editSession.body;
   if(editSession.maxLength===null)draftBody.removeAttribute('maxlength');
   else draftBody.maxLength=editSession.maxLength;
   $('status').hidden=true;
  }catch(failure){report(failure);}
  finally{editPending=false;renderEditor();if(editSession)draftBody.focus();}
 });
 $('draft-editor').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!editSession||editPending)return;
  editPending=true;renderEditor();
  try{
   const body=editSession.body.replace(/\r\n?/g,'\n')===draftBody.value?editSession.body:draftBody.value;
   const data=await api.saveDraft(editSession.version,body);
   editSession=null;render(data);
   error('已儲存草稿正文');
   $('edit-draft').focus();
  }catch(failure){
   if(/草稿已變更/.test(failure.message))error('草稿已有其他修改。可先複製這裡的文字，再取消並重新編輯。');
   else report(failure);
  }finally{editPending=false;renderEditor();if(editSession)draftBody.focus();}
 });
 $('cancel-draft').addEventListener('click',()=>{
  if(editPending)return;
  editSession=null;$('status').hidden=true;renderEditor();$('edit-draft').focus();
 });

 async function toggle(point){
  if(changing)return;
  changing=true;
  try{render(await api.toggle(point));}
  catch(failure){report(failure);}
  finally{changing=false;}
 }

 const isClose=event=>Boolean(event.target?.closest?.('#close'));
 function openHeaderMenu(event,point){
  event.preventDefault();lastTap=null;
  return api.menu(point).catch(report);
 }
 header.addEventListener('contextmenu',event=>openHeaderMenu(event,{x:event.clientX,y:event.clientY}));
 header.addEventListener('dblclick',event=>{
  if(isClose(event)||event.timeStamp-lastPointerToggle<100)return;
  return toggleAt(event);
 });
 heading.addEventListener('keydown',event=>{
  if(event.repeat)return;
  if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
   const {left,bottom}=heading.getBoundingClientRect();
   return openHeaderMenu(event,{x:left,y:bottom});
  }
  if(!['Enter',' '].includes(event.key))return;
  event.preventDefault();return toggle();
 });
 header.addEventListener('pointerdown',event=>{
  if(isClose(event))lastTap=null;
  if(event.button!==0||event.isPrimary===false||isClose(event)||drag)return;
  drag={id:event.pointerId,x:event.screenX,y:event.screenY,moved:false,queue:finishedDrag};
 });
 function moveDrag(session,dx,dy){
  session.pending=[dx,dy];
  if(session.moving)return;
  session.moving=true;
  session.queue=session.queue.then(async()=>{
   while(session.pending){
    const position=session.pending;session.pending=null;
    await api.drag('move',...position);
   }
  }).catch(report).finally(()=>{session.moving=false;});
 }
 header.addEventListener('pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.screenX-drag.x,dy=event.screenY-drag.y;
  if(!drag.moved){
   if(Math.hypot(dx,dy)<4)return;
   drag.moved=true;lastTap=null;
   header.setPointerCapture?.(event.pointerId);
   drag.queue=drag.queue.then(()=>api.drag('start')).catch(report);
  }
  moveDrag(drag,dx,dy);
 });
 function toggleAt(event){return toggle({x:event.screenX,y:event.screenY,clientX:event.clientX,clientY:event.clientY});}
 function finishDrag(event){
  if(!drag||drag.id!==event.pointerId)return;
  const session=drag;drag=null;
  if(session.moved){
   if(event.type==='pointerup')moveDrag(session,event.screenX-session.x,event.screenY-session.y);
   finishedDrag=session.queue.then(()=>api.drag('end')).catch(report);
   lastPointerToggle=event.timeStamp; // Ignore any trailing native double-click after a drag.
  }else if(event.type==='pointerup'&&!isClose(event)){
   const tap={x:event.screenX,y:event.screenY,time:event.timeStamp};
   if(lastTap&&tap.time-lastTap.time<=500&&Math.hypot(tap.x-lastTap.x,tap.y-lastTap.y)<=6){
    lastTap=null;lastPointerToggle=tap.time;
    return toggleAt(event);
   }
   lastTap=tap;
  }else lastTap=null;
 }
 for(const type of ['pointerup','pointercancel','lostpointercapture'])header.addEventListener(type,finishDrag);
 header.addEventListener('pointerleave',event=>{if(!drag?.moved){lastTap=null;finishDrag(event);}});
 $('close').addEventListener('click',()=>{
  if(editPending)return;
  if(editSession&&draftBody.value!==editSession.body.replace(/\r\n?/g,'\n')&&!window.confirm('關閉便條並放棄未儲存的正文？'))return;
  return api.close().catch(report);
 });
 window.addEventListener?.('blur',()=>{lastTap=null;});
 api.onChanged(render);
 api.onError(error);
 api.get().then(data=>{if(!updated)render(data);}).catch(report);
})();
