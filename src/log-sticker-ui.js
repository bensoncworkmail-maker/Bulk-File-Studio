'use strict';

(() => {
 const api=window.logSticker,$=id=>document.getElementById(id),header=$('sticker-header'),heading=$('heading');
 let updated=false,changing=false,drag=null,lastTap=null,lastPointerToggle=-Infinity,finishedDrag=Promise.resolve();
 let current,editSession=null,writing=null,saveTimer,composing=false,conflict=false,closing=false,allowClose=false;
 let imageSignature,imageObserver;
 const draftBody=$('draft-body'),recoverDraft=$('recover-draft');
 const normalizeLines=value=>value.replace(/\r\n?/g,'\n');
 const draftDirty=()=>editSession&&normalizeLines(editSession.body)!==draftBody.value;
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
 function fileCell(label,action,mode,type){
  const cell=document.createElement('td');
  const parentName=!type&&label.length>48&&label.match(/[^\\/]+[\\/]*$/)?.[0];
  const display=parentName&&parentName!==label?'…'+(label.includes('\\')?'\\':'/')+parentName:label;
  const control=linkButton(display,event=>{if(event.detail===0)return action();});
  control.title=label;
  control.setAttribute('aria-label',(type?'開啟'+type+' ':'在檔案總管定位 ')+label);
  if(type){
   const badge=text('span',type);
   badge.className='sticker-attachment-type';badge.setAttribute('aria-hidden','true');
   const name=document.createElement('div');
   name.className='sticker-attachment-name';name.append(badge,control);cell.append(name);
  }else cell.append(control);
  if(mode==='single')cell.addEventListener('click',event=>{if(event.detail===1)return action();});
  else cell.addEventListener('dblclick',action);
  return cell;
 }
 function imageArgs(index){
  const link=current.links[index];
  return [index,link.ref??current.version,link.location];
 }
 function renderImages(data){
  const entries=data.collapsed?[]:data.links
   .map(({image,label,location,imageKey},index)=>({image,label,location,imageKey,index}))
   .filter(link=>link.image&&link.location!==undefined);
  const signature=JSON.stringify([data.imageOpen,entries]);
  if(signature===imageSignature)return;
  imageSignature=signature;imageObserver?.disconnect();
  const root=$('image-previews'),loaders=new Map();
  root.replaceChildren();root.hidden=!entries.length;
  const actionLabel=data.imageOpen==='internal'?'在程式內放大':'以系統預設應用程式開啟';
  for(const {index,label} of entries){
   const figure=document.createElement('figure'),image=document.createElement('img');
   const button=linkButton(label,()=>{
    const [i,version,location]=imageArgs(index);
    return api.openLink(i,version,'enlarge',location).catch(report);
   });
   button.className='sticker-image-button';
   button.setAttribute('aria-label',actionLabel+' '+label);
   button.title=actionLabel;
   image.alt='';image.decoding='async';image.addEventListener('error',()=>{figure.hidden=true;});
   button.replaceChildren(image);
   figure.append(button,text('figcaption',label));
   root.append(figure);
   loaders.set(figure,async()=>{
    const [i,version,location]=imageArgs(index);
    try{
     let source;
     try{source=await api.openLink(i,version,'preview',location);}
     catch(failure){
      if(signature!==imageSignature||imageArgs(index)[1]===version)throw failure;
      const [,nextVersion,nextLocation]=imageArgs(index);
      source=await api.openLink(i,nextVersion,'preview',nextLocation);
     }
     if(signature===imageSignature)image.src=source;
    }catch{if(signature===imageSignature)figure.hidden=true;}
   });
  }
  if(!entries.length)return;
  if(!window.IntersectionObserver){
   for(const load of loaders.values())void load();
   return;
  }
  imageObserver=new window.IntersectionObserver(observed=>{
   for(const entry of observed)if(entry.isIntersecting&&loaders.has(entry.target)){
    imageObserver.unobserve(entry.target);
    const load=loaders.get(entry.target);loaders.delete(entry.target);void load();
   }
  },{root:$('record'),rootMargin:'64px'});
  for(const figure of loaders.keys())imageObserver.observe(figure);
 }
 function render(data){
  if(data.draft&&current?.draft?.version>data.draft.version)data={...data,draft:current.draft};
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
  $('draft-editor').hidden=!data.draft;
  $('notes').hidden=!data.notes;
  if(data.draft&&!draftDirty()&&!writing&&!composing)adoptDraft(data.draft);
  $('fields').hidden=!data.fields.length;
  $('fields').replaceChildren(...data.fields.flatMap(({label,value})=>[text('dt',label),text('dd',value)]));
  const items=data.items||[];
  $('tag-items').replaceChildren(...items.map(label=>text('li',label)));
  $('tag-items').hidden=!items.length;
  const rows=[],links=[];
  for(const [index,{kind,label,location,ref,type,image}] of data.links.entries()){
   if(location!==undefined){
    const open=()=>kind==='item'?api.openItem().catch(report):api.openLink(index,ref??data.version,'open',location).catch(report);
    const locate=()=>kind==='item'?api.locate().catch(report):api.openLink(index,ref??data.version,'show',location).catch(report);
    const row=document.createElement('tr');
    row.append(fileCell(label,open,data.openClick,type==='folder'?'資料夾':image?'圖片':'檔案'),fileCell(location,locate,data.locationClick));rows.push(row);
   }else links.push(linkButton(label,()=>api.openLink(index,data.version).catch(report)));
  }
  const openGesture=data.openClick==='single'?'單擊':'雙擊',locateGesture=data.locationClick==='single'?'單擊':'雙擊';
  $('attachment-hint').textContent=openGesture+'名稱開啟，'+locateGesture+'位置在檔案總管定位。';
  $('attachment-hint').hidden=data.showAttachmentHint!==true;
  $('attachment-rows').replaceChildren(...rows);
  $('attachment-count').textContent=String(rows.length);
  $('attachments').hidden=!rows.length;
  $('links').replaceChildren(...links);
  $('links').hidden=!links.length;
  $('record').hidden=data.collapsed;
  renderImages(data);
 }
 function draftStatus(message,recovery=''){
  $('draft-status').textContent=message;
  recoverDraft.textContent=recovery;
  recoverDraft.hidden=!recovery;
 }
 function adoptDraft(draft){
  editSession=draft;
  const body=normalizeLines(draft.body);
  if(draftBody.value!==body)draftBody.value=body;
  if(draft.maxLength===null)draftBody.removeAttribute('maxlength');
  else draftBody.maxLength=draft.maxLength;
 }
 function flushDraft(){
  clearTimeout(saveTimer);
  if(writing)return writing;
  if(!draftDirty()||conflict||composing)return Promise.resolve(!draftDirty());
  writing=(async()=>{
   try{
    while(!composing&&draftDirty()){
     draftStatus('正在儲存…');
     const data=await api.saveDraft(editSession.version,draftBody.value);
     editSession=data.draft;
     // A save can finish after a newer update from the full draft window.
     if(data.draft.version>=current.draft.version)render(data);
    }
    if(!draftDirty())draftStatus('已自動儲存');
    return !draftDirty();
   }catch(failure){
    conflict=/草稿已變更/.test(failure.message);
    if(conflict)draftStatus('草稿在另一個視窗更新。此處未儲存的文字已保留，可先複製再重新載入。','載入最新正文');
    else draftStatus('未能自動儲存。'+failure.message,'重試');
    return false;
   }
  })().finally(()=>{
   writing=null;
   if(!draftDirty()&&current?.draft&&current.draft.version>editSession.version)adoptDraft(current.draft);
  });
  return writing;
 }
 function queueDraft(){
  clearTimeout(saveTimer);
  if(conflict||composing)return;
  if(!draftDirty()){if(!writing)draftStatus('');return;}
  draftStatus('等候自動儲存…');
  saveTimer=setTimeout(()=>void flushDraft(),350);
 }
 draftBody.addEventListener('input',queueDraft);
 draftBody.addEventListener('compositionstart',()=>{composing=true;clearTimeout(saveTimer);});
 draftBody.addEventListener('compositionend',()=>{composing=false;queueDraft();});
 draftBody.addEventListener('blur',()=>void flushDraft());
 recoverDraft.addEventListener('click',async()=>{
  if(!conflict){await flushDraft();return;}
  if(!window.confirm('載入最新正文並放棄此便條未儲存的修改？'))return;
  recoverDraft.disabled=true;
  try{
   const draft=await api.readDraft();
   adoptDraft(current.draft?.version>draft.version?current.draft:draft);
   conflict=false;draftStatus('已載入最新正文');draftBody.focus();
  }catch(failure){draftStatus(failure.message,'載入最新正文');}
  finally{recoverDraft.disabled=false;}
 });
 async function finishClose(action){
  if(closing)return;
  closing=true;
  try{
   if(!await flushDraft()){
    if(!window.confirm('關閉便條並放棄未儲存的正文？'))return;
    if(editSession)adoptDraft(editSession);
   }
   allowClose=true;await action();
  }catch(failure){report(failure);}
  finally{allowClose=false;closing=false;}
 }

 async function toggle(point){
  if(changing)return;
  changing=true;
  try{void flushDraft();render(await api.toggle(point));}
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
 $('close').addEventListener('click',()=>finishClose(()=>api.close()));
 window.addEventListener?.('blur',()=>{lastTap=null;void flushDraft();});
 window.addEventListener?.('beforeunload',event=>{
  if(allowClose||(!draftDirty()&&!writing))return;
  event.returnValue=false;
  void finishClose(()=>window.close());
 });
 api.onChanged(render);
 api.onError(error);
 api.get().then(data=>{if(!updated)render(data);}).catch(report);
})();
