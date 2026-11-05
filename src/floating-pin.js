'use strict';
// Windows may lower a tool window after a native menu or another owned window closes.
// Reapply its topmost band without taking keyboard focus from the user's program.
class FloatingPin{
 constructor(window,settings,{setIntervalFn=setInterval,clearIntervalFn=clearInterval,onError=()=>{}}={}){
  Object.assign(this,{window,settings,clearIntervalFn});
  const refresh=()=>{try{this.sync();}catch(error){onError(error);}};
  for(const event of ['show','focus','blur'])window.on(event,refresh);
  this.timer=setIntervalFn(refresh,2000);this.timer?.unref?.();
  window.on('closed',()=>clearIntervalFn(this.timer));this.sync();
 }
 sync(){const win=this.window;if(win.isDestroyed())return;const pinned=this.settings().floatingOnTop===true;
  if(pinned&&win.isVisible()){win.setAlwaysOnTop(true,'floating');if(win.isAlwaysOnTop?.()===false)win.moveTop?.();}
  else if(!pinned&&win.isAlwaysOnTop?.())win.setAlwaysOnTop(false);
 }
}
module.exports={FloatingPin};
