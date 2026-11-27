'use strict';
(() => {
 function init({header,api,onError}){
  let active=null,finished=Promise.resolve();
  const control=event=>Boolean(event.target?.closest?.('button'));
  const queue=(session,task)=>{session.queue=session.queue.then(()=>session.failed?undefined:task()).catch(error=>{session.failed=true;onError(error);});};
  const move=(session,event)=>{
   const dx=event.screenX-session.x,dy=event.screenY-session.y;
   if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
   if(!session.moved){
    if(session.mode==='move'?Math.hypot(dx,dy)<4:dx===0)return;
    session.moved=true;
    if(session.mode==='move')try{header.setPointerCapture(session.id);}catch{}
    session.queue=finished;
    queue(session,async()=>{session.token=(await api.beginFloatingDrag(session.mode)).token;});
   }
   session.position=[dx,dy];
   if(session.sending)return;
   session.sending=true;
   queue(session,async()=>{
    while(session.position){
     const position=session.position;session.position=null;
     await api.moveFloatingDrag(session.token,...position);
    }
    session.sending=false;
   });
  };
  const finish=(event,finalPosition=false)=>{
   const session=active;if(!session||event?.pointerId!==undefined&&event.pointerId!==session.id)return;
   if(finalPosition&&(session.moved||session.mode!=='move'))move(session,event);active=null;
   try{header.releasePointerCapture(session.id);}catch{/* Capture may already be released. */}
   if(session.moved){session.queue=session.queue.then(()=>session.token?api.endFloatingDrag(session.token):undefined).catch(onError);finished=session.queue;}
  };
  header.addEventListener('pointerdown',event=>{
   if(event.button!==0||event.isPrimary===false||control(event))return;
   if(active)finish();
   const side=event.target?.closest?.('[data-resize]')?.dataset?.resize;
   active={id:event.pointerId,x:event.screenX,y:event.screenY,moved:false,failed:false,mode:side==='left'||side==='right'?'resize-'+side:'move'};
   // A fast resize can leave the grip before the first pointermove.
   if(active.mode!=='move'){
    event.preventDefault();
    try{header.setPointerCapture(active.id);}catch{}
   }
  });
  header.addEventListener('pointermove',event=>{if(active&&event.pointerId===active.id)move(active,event);});
  header.addEventListener('pointerup',event=>finish(event,true));
  for(const event of ['pointercancel','lostpointercapture'])header.addEventListener(event,value=>finish(value));
  header.addEventListener('pointerleave',event=>{if(active?.mode==='move'&&!active.moved)finish(event);});
  const menu=event=>{
   event.preventDefault();finish();
   const anchor=event.type==='contextmenu'&&event.button===2?{x:event.clientX,y:event.clientY}:undefined;
   return finished.then(()=>api.openFloatingHeaderMenu(anchor)).catch(onError);
  };
  header.addEventListener('contextmenu',menu);
  header.addEventListener('keydown',event=>{if((event.shiftKey&&event.key==='F10')||event.key==='ContextMenu')return menu(event);});
  return {cancel:()=>finish(),settled:()=>finished};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={init};else window.floatingHeader=Object.freeze({init});
})();
