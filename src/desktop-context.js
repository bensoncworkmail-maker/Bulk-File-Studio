'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url'),{fitBounds}=require('./desktop-state');
class DesktopContext{
 constructor(options){Object.assign(this,options);this.window=null;this.expanded=false;this.busy=0;this.held=false;this.transitioning=false;this.quitting=false;}
 owns(event){return Boolean(this.window&&!this.window.isDestroyed()&&event?.sender===this.window.webContents&&event.senderFrame?.url===pathToFileURL(path.join(__dirname,'desktop-context.html')).href);}
 persist(patch){return this.saveState(patch);}
 ensure(){
  if(this.window&&!this.window.isDestroyed())return this.window;
  const state=this.getState(),point=this.screen.getCursorScreenPoint?.()||{x:150,y:150},bounds=fitBounds(state.bounds?{...state.bounds,width:state.bounds.width>=900?360:Math.min(640,state.bounds.width),height:state.bounds.width>=900?480:Math.min(840,state.bounds.height)}:{x:point.x,y:point.y,width:360,height:480},this.screen.getAllDisplays(),{width:360,height:480,minWidth:300,minHeight:260});this.anchor={...bounds};
  const size=state.iconSize;const window=new this.BrowserWindow({x:bounds.x,y:bounds.y,width:size,height:size,minWidth:size,minHeight:size,frame:false,show:false,skipTaskbar:true,alwaysOnTop:state.topmost,resizable:false,maximizable:false,minimizable:false,fullscreenable:false,maxWidth:640,maxHeight:840,title:'Bulk File Studio · 桌面工作情境',backgroundColor:this.settings().theme==='light'?'#f4f6fb':'#151e30',webPreferences:{preload:path.join(__dirname,'desktop-context-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});this.window=window;this.secureWindow(window);
  this.pinController=window.pinController||new(require('./floating-pin').FloatingPin)(window,()=>({floatingOnTop:this.getState().topmost}),{onError:this.onError});
  window.on('ready-to-show',()=>{if(this.window===window&&!window.isDestroyed()&&this.getState().visible){window.showInactive();this.refresh();}});
  window.on('blur',()=>this.scheduleCollapse(300));
  for(const event of ['move','resize'])window.on(event,()=>{if(this.transitioning)return;clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.record(),250);});
  window.on('close',event=>{if(!this.quitting){event.preventDefault();if(!this.busy&&!this.held)this.hide();}});
  window.on('closed',()=>{clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);clearTimeout(this.saveTimer);if(this.window===window){this.window=null;this.held=false;}});
  Promise.resolve(window.loadFile(path.join(__dirname,'desktop-context.html'))).catch(error=>{this.onError(error);if(!window.isDestroyed())window.destroy();});return window;
 }
 record(){if(!this.window||this.window.isDestroyed()||this.transitioning)return;const bounds=this.window.getBounds?.()||this.window.getNormalBounds();this.anchor={...this.anchor,x:bounds.x,y:bounds.y,...(this.expanded?{width:bounds.width,height:bounds.height}:{})};try{this.persist({bounds:this.anchor});}catch(error){this.onError(error);}}
 place(expanded){if(this.expanded&&!expanded)this.record();const window=this.ensure(),size=this.getState().iconSize,bounds=fitBounds({...this.anchor,...(!expanded?{width:size,height:size}:{})},this.screen.getAllDisplays(),expanded?{width:360,height:480,minWidth:300,minHeight:260}:{width:size,height:size,minWidth:size,minHeight:size});this.transitioning=true;try{window.setMinimumSize(expanded?Math.min(320,bounds.width):size,expanded?Math.min(300,bounds.height):size);window.setResizable(expanded);window.setBounds(bounds);this.expanded=expanded;}finally{this.transitioning=false;}this.refresh();}

 show(expand=true){const window=this.ensure();this.persist({visible:true});this.place(expand||this.getState().pinned);if(expand){window.show();window.focus();}else window.showInactive();return {opened:true,desktop:true};}
 hover(){clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);if(!this.expanded)this.hoverTimer=setTimeout(()=>{if(this.window?.isVisible?.()){this.place(true);this.window.showInactive();}},280);}
 scheduleCollapse(delay=500){clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);if(this.getState().pinned||this.held||this.busy||this.window?.isFocused?.())return;this.closeTimer=setTimeout(()=>{if(!this.getState().pinned&&!this.held&&!this.busy&&!this.window?.isFocused?.()&&this.window?.isVisible?.())this.place(false);},delay);}
 async perform(task){this.busy++;clearTimeout(this.closeTimer);try{return await task();}finally{this.busy--;this.refresh();}}
 control(action,value){
  if(action==='hover'){this.hover();return;}if(action==='enter'){clearTimeout(this.closeTimer);return;}if(action==='leave'){this.scheduleCollapse();return;}
  if(action==='hold'){if(typeof value!=='boolean')throw Error('編輯狀態無效');this.held=value;if(value)clearTimeout(this.closeTimer);return;}
  if(action==='icon-size'){if(!Number.isInteger(value)||value<24||value>64)throw Error('圖示大小須為 24–64 的整數');this.persist({iconSize:value});if(!this.expanded)this.place(false);this.refresh();return;}
  if(action==='toolbar'){this.persist({iconMode:false,pinned:true});this.place(true);return;}
  if(action==='compact'){this.record();this.anchor={...this.anchor,width:360,height:480};this.place(true);this.record();return;}
  if(action==='hide')return this.hide();if(action==='expand'){this.place(true);this.window.show();this.window.focus();return;}
  if(action==='icon'){if(this.busy||this.held)throw Error('請先完成或取消目前編輯');this.persist({pinned:false,iconMode:true,visible:true});this.place(false);return;}
  if(action==='pin'){if(typeof value!=='boolean')throw Error('釘選狀態無效');this.persist({pinned:value});if(value)this.place(true);this.refresh();return;}
  if(action==='topmost'){if(typeof value!=='boolean')throw Error('置頂設定無效');this.persist({topmost:value});this.pinController.sync();this.refresh();return;}
  throw Error('不支援的桌面情境操作');
 }
 hide(){if(this.busy||this.held)throw Error('請先完成或取消目前編輯');clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);this.record();this.persist({visible:false});this.window?.hide();return {hidden:true};}
 payload(){return {state:this.snapshot(),preferences:this.getState(),expanded:this.expanded,theme:this.settings().theme,fontSize:this.settings().fontSize};}
 refresh(){this.broadcast?.();if(this.window&&!this.window.isDestroyed())try{this.window.webContents.send('desktop-context-changed',this.payload());}catch(error){this.onError(error);}}
 close(){this.record();this.quitting=true;clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);clearTimeout(this.saveTimer);this.window?.destroy();this.window=null;}
}
module.exports={DesktopContext};
