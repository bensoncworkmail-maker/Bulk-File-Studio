'use strict';
(() => {
 function bind(input){
  input.readOnly=true;
  input.dataset.accelerator='';
  input.placeholder='未設定；點選後按組合鍵';
  input.addEventListener('keydown',event=>{
   if(event.key==='Tab')return;
   event.preventDefault();event.stopPropagation();
   if(event.key==='Escape'){input.blur();return;}
   if(event.key==='Backspace'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){set(input,'');return;}
   const value=window.globalShortcutModel.fromEvent(event);
   if(value!==null)set(input,value);
  });
 }
 function set(input,value){input.dataset.accelerator=value||'';input.value=window.globalShortcutModel.display(value);}
 window.shortcutControls=Object.freeze({bind,set,get:input=>input.dataset.accelerator||''});
})();
