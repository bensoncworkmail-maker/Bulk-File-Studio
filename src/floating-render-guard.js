'use strict';
(() => {
 // A refresh must not replace the target between pointerdown and the native click.
 function create({paint,setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout}){
  let pointer=null,timer=null,pending=false;
  function request(){if(pointer!==null||timer!==null){pending=true;return;}paint();}
  function begin(event){
   if(event.button!==0||event.isPrimary===false||pointer!==null)return;
   if(timer!==null){clearTimeoutFn(timer);timer=null;}pointer=event.pointerId??0;
  }
  function finish(event){
   if(pointer===null||event?.pointerId!==undefined&&event.pointerId!==pointer)return;
   pointer=null;
   // Native click follows pointerup; let that dispatch finish before painting.
   timer=setTimeoutFn(()=>{timer=null;if(pending){pending=false;paint();}},0);
  }
  return Object.freeze({request,begin,finish,cancel:()=>finish()});
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.studioFloatingRender=Object.freeze(api);
})();
