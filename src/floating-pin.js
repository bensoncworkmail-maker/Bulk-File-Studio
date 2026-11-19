'use strict';
// Ordinary maintenance must not repeatedly reorder independent topmost tools.
// Explicit recovery rebuilds the native band without taking keyboard focus.
class FloatingPin{
 constructor(window,settings,{setIntervalFn=setInterval,clearIntervalFn=clearInterval,onError=()=>{}}={}){
  Object.assign(this,{window,settings,clearIntervalFn,onError});this.syncing=false;
  const refresh=()=>{try{this.sync();}catch(error){onError(error);}};
  const recover=()=>{try{this.sync({force:true});}catch(error){onError(error);}};
  for(const event of ['show','focus','restore'])window.on(event,recover);
  for(const event of ['blur','always-on-top-changed'])window.on(event,refresh);
  this.timer=setIntervalFn(refresh,2000);this.timer?.unref?.();window.on('closed',()=>clearIntervalFn(this.timer));this.sync();
 }
 sync({force=false}={}){const win=this.window;if(this.syncing||win.isDestroyed()||win.nativeMenuOpen&&!force)return;const pinned=this.settings().floatingOnTop===true;if(pinned&&!win.isVisible())return;this.syncing=true;try{
  const actual=win.isAlwaysOnTop?.();
  if(pinned&&force){win.setAlwaysOnTop(false);win.setAlwaysOnTop(true,'floating');win.moveTop?.();}
  else if(pinned&&actual!==true)win.setAlwaysOnTop(true,'floating');
  else if(!pinned&&actual!==false)win.setAlwaysOnTop(false);
 }finally{this.syncing=false;}}
}
module.exports={FloatingPin};
