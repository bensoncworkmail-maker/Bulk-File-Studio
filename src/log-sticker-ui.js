'use strict';

(() => {
 const api=window.logSticker,$=id=>document.getElementById(id),header=$('sticker-header'),heading=$('heading');
 let updated=false,changing=false,drag=null,suppressDoubleClickUntil=0,finishedDrag=Promise.resolve();
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
 function fileCell(label,action){
  const cell=document.createElement('td');
  const control=linkButton(label,event=>{if(event.detail===0)return action();});
  cell.append(control);
  cell.addEventListener('dblclick',action);
  return cell;
 }
 function render(data){
  updated=true;
  const style=document.documentElement.style;
  style.setProperty('--sticker-background',data.background);
  style.setProperty('--sticker-foreground',data.foreground);
  style.setProperty('--sticker-header-height',(data.size?.collapsedHeight||36)+'px');
  $('sticker-grip').hidden=data.showGrip===false;
  document.body.classList.toggle('header-at-bottom',data.headerAtBottom===true);
  if(heading.textContent!==data.heading)heading.textContent=data.heading;
  heading.title=data.heading+' ／ 雙擊'+(data.collapsed?'展開':'收合')+' · 拖曳移動';
  heading.setAttribute('aria-expanded',String(!data.collapsed));
  $('title').textContent=data.title;
  $('notes').textContent=data.notes;
  $('notes').hidden=!data.notes;
  $('fields').replaceChildren(...data.fields.flatMap(({label,value})=>[text('dt',label),text('dd',value)]));
  const items=data.items||[];
  $('tag-items').replaceChildren(...items.map(label=>text('li',label)));
  $('tag-items').hidden=!items.length;
  const rows=[],links=[];
  for(const [index,{kind,label,location}] of data.links.entries()){
   if(kind==='file'||kind==='item'){
    const open=()=>kind==='file'?api.openLink(index,data.version,'open',location).catch(report):api.visit().catch(report);
    const locate=()=>kind==='file'?api.openLink(index,data.version,'show',location).catch(report):api.locate().catch(report);
    const row=document.createElement('tr');row.append(fileCell(label,open),fileCell(location,locate));rows.push(row);
   }else links.push(linkButton(label,()=>api.openLink(index,data.version).catch(report)));
  }
  $('attachment-rows').replaceChildren(...rows);
  $('attachments').hidden=!rows.length;
  $('links').replaceChildren(...links);
  $('links').hidden=!links.length;
  $('visit').textContent=data.visit;$('visit').hidden=!data.visit||data.kind==='favorite'||data.kind==='tracking';
  $('record').hidden=data.collapsed;
  $('status').hidden=true;
 }

 async function toggle(point){
  if(changing)return;
  changing=true;
  try{render(await api.toggle(point));}
  catch(failure){report(failure);}
  finally{changing=false;}
 }

 const isClose=event=>Boolean(event.target?.closest?.('#close'));
 header.addEventListener('dblclick',event=>{
  if(isClose(event)||Date.now()<suppressDoubleClickUntil)return;
  return toggle({x:event.screenX,y:event.screenY});
 });
 heading.addEventListener('keydown',event=>{
  if(!['Enter',' '].includes(event.key)||event.repeat)return;
  event.preventDefault();return toggle();
 });
 header.addEventListener('pointerdown',event=>{
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
   drag.moved=true;
   header.setPointerCapture?.(event.pointerId);
   drag.queue=drag.queue.then(()=>api.drag('start')).catch(report);
  }
  moveDrag(drag,dx,dy);
 });
 function finishDrag(event){
  if(!drag||drag.id!==event.pointerId)return;
  if(drag.moved){
   if(event.type==='pointerup')moveDrag(drag,event.screenX-drag.x,event.screenY-drag.y);
   finishedDrag=drag.queue.then(()=>api.drag('end')).catch(report);
   suppressDoubleClickUntil=Date.now()+350;
  }
  drag=null;
 }
 for(const type of ['pointerup','pointercancel','lostpointercapture'])header.addEventListener(type,finishDrag);
 header.addEventListener('pointerleave',event=>{if(drag&&!drag.moved)finishDrag(event);});
 $('close').addEventListener('click',()=>api.close().catch(report));
 $('visit').addEventListener('click',()=>api.visit().catch(report));
 api.onChanged(render);
 api.onError(error);
 api.get().then(data=>{if(!updated)render(data);}).catch(report);
})();
