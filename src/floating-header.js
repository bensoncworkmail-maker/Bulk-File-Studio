'use strict';
(() => {
 function init({header,api,getSettings,onError,now=Date.now}){
  let active=null,lastDrag=-Infinity,finished=Promise.resolve();
  const control=event=>Boolean(event.target?.closest?.('button'));
  const queue=(session,task)=>{session.queue=session.queue.then(()=>session.failed?undefined:task()).catch(error=>{session.failed=true;onError(error);});};
  const move=(session,event)=>{
   const dx=event.screenX-session.x,dy=event.screenY-session.y;
   if(!Number.isFinite(dx)||!Number.isFinite(dy)||!session.moved&&Math.hypot(dx,dy)<4)return;
   if(!session.moved){session.moved=true;session.queue=finished;queue(session,async()=>{session.token=(await api.beginFloatingDrag()).token;});}
   queue(session,()=>api.moveFloatingDrag(session.token,dx,dy));lastDrag=now();
  };
  const finish=(event,finalPosition=false)=>{
   const session=active;if(!session||event?.pointerId!==undefined&&event.pointerId!==session.id)return;
   if(finalPosition&&session.moved)move(session,event);active=null;
   try{header.releasePointerCapture(session.id);}catch{/* Capture may already be released. */}
   if(session.moved){session.queue=session.queue.then(()=>session.token?api.endFloatingDrag(session.token):undefined).catch(onError);finished=session.queue;}
  };
  header.addEventListener('pointerdown',event=>{
   if(event.button!==0||event.isPrimary===false||control(event)||active)return;
   active={id:event.pointerId,x:event.screenX,y:event.screenY,moved:false,failed:false};
   // Do not cancel pointerdown: browser dblclick events must remain available.
   try{header.setPointerCapture(event.pointerId);}catch{/* The pointer may have left the window. */}
  });
  header.addEventListener('pointermove',event=>{if(active&&event.pointerId===active.id)move(active,event);});
  header.addEventListener('pointerup',event=>finish(event,true));
  for(const event of ['pointercancel','lostpointercapture'])header.addEventListener(event,value=>finish(value));
  header.addEventListener('dblclick',event=>{
   if(control(event)||getSettings().floatingHeaderDoubleClick===false||now()-lastDrag<350)return;
   event.preventDefault();api.headerDoubleClick().catch(onError);
  });
  return {cancel:()=>finish(),settled:()=>finished};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={init};else window.floatingHeader=Object.freeze({init});
})();
