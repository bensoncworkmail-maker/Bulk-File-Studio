'use strict';
// Desired state belongs to preferences; native state is observed independently.
// Maintenance never raises a healthy window, and repeated failures exhaust a budget.
class FloatingPin{
 constructor(window,settings,{setIntervalFn=setInterval,clearIntervalFn=clearInterval,onError=()=>{},maxAttempts=3}={}){
  Object.assign(this,{window,settings,clearIntervalFn,onError,maxAttempts});this.syncing=false;this.failures=0;
  const refresh=()=>this.sync(),recover=()=>this.sync({force:true});
  for(const event of ['show','restore'])window.on(event,recover);
  for(const event of ['focus','blur','always-on-top-changed'])window.on(event,refresh);
  this.timer=setIntervalFn(refresh,2000);this.timer?.unref?.();window.on('closed',()=>clearIntervalFn(this.timer));this.sync();
 }
 sync({force=false}={}){
  const win=this.window;if(this.syncing||win.isDestroyed()||win.nativeMenuOpen&&!force)return;
  const desired=this.settings().floatingOnTop===true;if(desired&&!win.isVisible())return;
  if(force||this.desired!==desired){this.failures=0;this.reported=false;}this.desired=desired;
  let actual;this.syncing=true;
  try{
   actual=win.isAlwaysOnTop?.();this.actual=actual;
   if(actual===desired&&!force){this.failures=0;this.reported=false;return;}
   if(this.failures>=this.maxAttempts)return;
   if(desired&&force){win.setAlwaysOnTop(false);win.setAlwaysOnTop(true,'floating');win.moveTop?.();}
   else if(desired&&actual!==true)win.setAlwaysOnTop(true,'floating');
   else if(!desired&&actual!==false)win.setAlwaysOnTop(false);
   if(typeof win.isAlwaysOnTop==='function'){
    this.actual=win.isAlwaysOnTop();if(this.actual!==desired){win.setAlwaysOnTop(desired,...(desired?['floating']:[]));this.actual=win.isAlwaysOnTop();}
    if(this.actual!==desired)this.failed(new Error('置頂未同步：desired='+desired+', actual='+this.actual));else this.failures=0;
   }
  }catch(error){this.failed(error);}finally{this.syncing=false;}
 }
 failed(error){this.failures++;if(this.failures>=this.maxAttempts&&!this.reported){this.reported=true;this.onError(error);}}
}
module.exports={FloatingPin};
