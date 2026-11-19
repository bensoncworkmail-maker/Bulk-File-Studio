'use strict';
// One debounced display-change subscription; all coordinates are Electron DIP.
class FloatingDisplays{
 constructor(screen,targets,{defer=setTimeout,cancel=clearTimeout,onError=()=>{}}={}){Object.assign(this,{screen,targets,defer,cancel,onError});this.change=()=>{cancel(this.timer);this.timer=defer(()=>this.recover(),150);this.timer?.unref?.();};for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on?.(event,this.change);}
 recover(){for(const recover of this.targets())try{recover();}catch(error){this.onError(error);}}
 close(){this.cancel(this.timer);for(const event of ['display-added','display-removed','display-metrics-changed'])this.screen.removeListener?.(event,this.change);}
}
module.exports={FloatingDisplays};
