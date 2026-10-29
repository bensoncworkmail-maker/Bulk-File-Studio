'use strict';
(() => {
 function init(options){
  const handle=document.getElementById('tag-panel-resizer'),root=document.documentElement;let drag=null;
  const clamp=value=>Math.round(Math.max(140,Math.min(480,value)));
  const show=value=>{root.style.setProperty('--tag-panel-width',value+'px');handle.setAttribute('aria-valuenow',String(value));};
  function finish(commit){if(!drag)return;const current=drag;drag=null;root.classList.remove('resizing-tags');if(handle.hasPointerCapture(current.pointer))handle.releasePointerCapture(current.pointer);if(commit)options.save(current.width);show(options.getWidth());}
  handle.addEventListener('pointerdown',event=>{if(drag||event.button!==0||options.isBusy())return;event.preventDefault();drag={pointer:event.pointerId,x:event.clientX,width:document.getElementById('favorite-tags-panel').getBoundingClientRect().width};drag.start=drag.width;handle.setPointerCapture(event.pointerId);root.classList.add('resizing-tags');});
  handle.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;drag.width=clamp(drag.start+event.clientX-drag.x);show(drag.width);});
  handle.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finish(true);});handle.addEventListener('pointercancel',event=>{if(drag?.pointer===event.pointerId)finish(false);});handle.addEventListener('lostpointercapture',event=>{if(drag?.pointer===event.pointerId)finish(false);});window.addEventListener('blur',()=>finish(false));
  handle.addEventListener('dblclick',()=>{if(!options.isBusy())options.save(220);});
  handle.addEventListener('keydown',event=>{if(options.isBusy())return;let width=options.getWidth();if(event.key==='ArrowLeft')width-=event.shiftKey?50:10;else if(event.key==='ArrowRight')width+=event.shiftKey?50:10;else if(event.key==='Home')width=140;else if(event.key==='End')width=480;else return;event.preventDefault();event.stopPropagation();options.save(clamp(width));});
 }
 window.sidebarResize=Object.freeze({init});
})();
