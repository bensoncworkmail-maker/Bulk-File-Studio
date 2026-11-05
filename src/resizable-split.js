'use strict';
(() => {
 function attach(root,{width=250,min=160,max=600,label='調整清單寬度',save=()=>{}}={}){
  const handle=document.createElement('div');handle.className='split-handle';handle.tabIndex=0;
  handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label',label);
  root.insertBefore(handle,root.children[1]||null);
  let current=width,drag=null;
  const bounds=()=>root.clientWidth>0?Math.max(min,Math.min(max,root.clientWidth-240)):max;
  function set(value){current=Math.round(Math.max(min,Math.min(bounds(),value)));root.style.setProperty('--split-width',current+'px');handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',bounds());handle.setAttribute('aria-valuenow',current);}
  function persist(){Promise.resolve(save(current)).catch(()=>{handle.title='寬度未能儲存，請重試';});}
  handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();drag={x:event.clientX,width:current};handle.setPointerCapture(event.pointerId);});
  handle.addEventListener('pointermove',event=>{if(drag)set(drag.width+event.clientX-drag.x);});
  const end=()=>{if(!drag)return;drag=null;persist();};
  handle.addEventListener('pointerup',end);handle.addEventListener('lostpointercapture',end);
  handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();set(event.key==='Home'?min:event.key==='End'?max:current+(event.key==='ArrowRight'?10:-10));persist();});
  set(width);return {set,handle};
 }
 window.resizableSplit=Object.freeze({attach});
})();
