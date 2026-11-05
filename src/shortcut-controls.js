'use strict';
(() => {
 let active=null;
 function capture(input){if(!window.desktopAPI?.captureShortcuts)return;input.dataset.shortcutRecorder='true';input.addEventListener('focus',()=>{active=input;void window.desktopAPI.captureShortcuts(true).catch(error=>input.title=String(error.message||error));});input.addEventListener('blur',()=>{if(active!==input)return;active=null;void window.desktopAPI.captureShortcuts(false).catch(()=>{});});}
 document.addEventListener?.('focusin',event=>{if(active&&event.target!==active&&event.target.dataset?.shortcutRecorder!=='true'){active=null;void window.desktopAPI.captureShortcuts(false).catch(()=>{});}});
 window.addEventListener?.('focus',()=>{if(document.activeElement?.dataset?.shortcutRecorder==='true'){active=document.activeElement;void window.desktopAPI.captureShortcuts(true).catch(()=>{});}});
 function bind(input){capture(input);
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
 window.shortcutControls=Object.freeze({bind,capture,set,get:input=>input.dataset.accelerator||''});
})();
