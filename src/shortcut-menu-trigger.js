'use strict';
// Delay native menus until the accelerator modifiers have been released.
// A focus transfer can lose key-up; the bounded fallback avoids a stuck request.
class ShortcutMenuTrigger {
 constructor({window,show,defer=setTimeout,cancel=clearTimeout}){Object.assign(this,{window,show,defer,cancel});this.pending=null;}
 close(){this.pending?.cleanup();this.pending=null;}
 run(task,{released=false}={}){
  this.close();this.show();const owner=this.window();if(!owner||owner.isDestroyed())return;
  owner.focus();const wc=owner.webContents;let timer,settle;
  const entry={cleanup:()=>{this.cancel(timer);this.cancel(settle);wc.removeListener('before-input-event',input);for(const name of ['blur','hide','closed'])owner.removeListener(name,abort);}};
  const abort=()=>{if(this.pending===entry)this.close();};
  const finish=()=>{if(this.pending!==entry)return;this.close();if(!owner.isDestroyed()&&owner.isVisible()&&owner.isFocused())task();};
  const input=(event,key)=>{if(key.key==='Escape'){event.preventDefault();abort();return;}if(key.type==='keyUp'){event.preventDefault();if(!key.control&&!key.alt&&!key.shift&&!key.meta){this.cancel(settle);settle=this.defer(finish,40);}}};
  this.pending=entry;wc.on('before-input-event',input);for(const name of ['blur','hide','closed'])owner.on(name,abort);timer=this.defer(finish,released?40:1500);
 }
}
module.exports={ShortcutMenuTrigger};
