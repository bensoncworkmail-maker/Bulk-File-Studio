'use strict';
(() => {
 function bind(options,config){
  const handle=document.getElementById(config.handle),panel=document.getElementById(config.panel),root=document.documentElement;let drag=null;
  const clamp=value=>Math.round(Math.max(config.min,Math.min(config.max,value)));
  const show=value=>{root.style.setProperty(config.property,value+'px');handle.setAttribute('aria-valuenow',String(value));};
  function finish(commit){if(!drag)return;const current=drag;drag=null;root.classList.remove(config.dragClass);if(handle.hasPointerCapture(current.pointer))handle.releasePointerCapture(current.pointer);if(commit)options.save(current.width);show(options.getWidth());}
  handle.addEventListener('pointerdown',event=>{if(drag||event.button!==0||options.isBusy())return;event.preventDefault();drag={pointer:event.pointerId,x:event.clientX,start:panel.getBoundingClientRect().width};drag.width=drag.start;handle.setPointerCapture(event.pointerId);root.classList.add(config.dragClass);});
  handle.addEventListener('pointermove',event=>{if(!drag||drag.pointer!==event.pointerId)return;drag.width=clamp(drag.start+config.direction*(event.clientX-drag.x));show(drag.width);});
  handle.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finish(true);});handle.addEventListener('pointercancel',event=>{if(drag?.pointer===event.pointerId)finish(false);});handle.addEventListener('lostpointercapture',event=>{if(drag?.pointer===event.pointerId)finish(false);});window.addEventListener('blur',()=>finish(false));
  handle.addEventListener('dblclick',()=>{if(!options.isBusy()){options.save(config.defaultWidth);show(options.getWidth());}});
  handle.addEventListener('keydown',event=>{if(options.isBusy())return;let width=options.getWidth(),step=event.shiftKey?50:10;if(event.key==='ArrowLeft')width-=config.direction*step;else if(event.key==='ArrowRight')width+=config.direction*step;else if(event.key==='Home')width=config.min;else if(event.key==='End')width=config.max;else return;event.preventDefault();event.stopPropagation();options.save(clamp(width));show(options.getWidth());});
  show(options.getWidth());
 }
 window.sidebarResize=Object.freeze({
  init:options=>bind(options,{handle:'tag-panel-resizer',panel:'favorite-tags-panel',property:'--tag-panel-width',dragClass:'resizing-tags',min:140,max:480,defaultWidth:220,direction:1}),
  initSource:options=>bind(options,{handle:'source-panel-resizer',panel:'source-panel',property:'--source-panel-width',dragClass:'resizing-source',min:160,max:480,defaultWidth:220,direction:1}),
  initRules:options=>bind(options,{handle:'rules-panel-resizer',panel:'rules-panel',property:'--rules-width',dragClass:'resizing-rules',min:280,max:720,defaultWidth:420,direction:-1})
 });
})();
