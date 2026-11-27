'use strict';
// Desired state belongs to preferences; native state is observed independently.
// Maintenance never raises a healthy window, and repeated failures exhaust a budget.
class FloatingPin{
 constructor(window,settings,{setIntervalFn=setInterval,clearIntervalFn=clearInterval,onError=()=>{},maxAttempts=3,
  canRecover=()=>settings().floatingOnTop===true,platform=process.platform}={}){
  Object.assign(this,{window,settings,clearIntervalFn,onError,maxAttempts,canRecover});this.syncing=false;this.failures=0;
  // Electron places the 'floating' level behind the Windows taskbar, which
  // can drop the window out of the topmost band when the taskbar is not topmost.
  this.topmostLevel=platform==='win32'?'pop-up-menu':'floating';
  const refresh=()=>this.sync(),recover=()=>this.sync({force:true});
  for(const event of ['show','restore'])window.on(event,recover);
  for(const event of ['focus','blur','always-on-top-changed'])window.on(event,refresh);
  this.timer=setIntervalFn(refresh,2000);this.timer?.unref?.();window.on('closed',()=>clearIntervalFn(this.timer));this.sync();
 }
 rendererGone(reason){
  if(!['crashed','killed','oom','abnormal-exit'].includes(reason)||this.recoveredRenderer||!this.canRecover())return;
  this.recoveredRenderer=true;
  setImmediate(()=>{
   const {window}=this;
   if(!window.isDestroyed()&&window.isVisible()&&this.canRecover())this.reloadCrashedRenderer();
  });
 }
 reloadCrashedRenderer(){
  if(this.window.isDestroyed())return;
  const contents=this.window.webContents;
  if(!contents?.isCrashed?.())return;
  try{contents.reload();}catch(error){this.onError(error);}
 }
 sync({force=false,raise=true}={}){
  const win=this.window;if(this.syncing||win.isDestroyed()||win.nativeMenuOpen)return;
  const desired=this.settings().floatingOnTop===true;if(desired&&(!win.isVisible()||win.isMinimized?.()))return;
  if(force||this.desired!==desired){this.failures=0;this.reported=false;}this.desired=desired;
  let actual;this.syncing=true;
  try{
   actual=win.isAlwaysOnTop?.();this.actual=actual;
   if(actual===desired&&!force){this.failures=0;this.reported=false;return;}
   if(this.failures>=this.maxAttempts)return;
   if(desired&&(force||actual!==true))win.setAlwaysOnTop(true,this.topmostLevel);
   else if(!desired&&actual!==false)win.setAlwaysOnTop(false);
   if(typeof win.isAlwaysOnTop==='function'){
    this.actual=win.isAlwaysOnTop();if(this.actual!==desired){win.setAlwaysOnTop(desired,...(desired?[this.topmostLevel]:[]));this.actual=win.isAlwaysOnTop();}
    if(this.actual!==desired){this.failed(new Error('置頂未同步：desired='+desired+', actual='+this.actual));return;}
    this.failures=0;
   }
   if(desired&&force&&raise)win.moveTop?.();
  }catch(error){this.failed(error);}finally{this.syncing=false;}
 }
 failed(error){this.failures++;if(this.failures>=this.maxAttempts&&!this.reported){this.reported=true;this.onError(error);}}
}
module.exports={FloatingPin};
