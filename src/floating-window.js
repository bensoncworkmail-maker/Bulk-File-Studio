'use strict';
const {fitBounds,validBounds}=require('./desktop-state');
const {randomUUID}=require('node:crypto');
const DEFAULTS={width:320,height:400,minWidth:220,minHeight:120};
function windowDefaults(settings={}){return {...DEFAULTS,width:settings.floatingDefaultWidth||320,height:settings.floatingDefaultHeight||400,minWidth:settings.floatingMinWidth||220,minHeight:settings.floatingMinHeight||120};}
class FloatingWindow {
 constructor(window,desktop,screen){
  this.window=window;this.desktop=desktop;this.screen=screen;this.collapsed=false;this.transitioning=false;this.expanded=this.liveBounds();this.drag=null;
  this.facade={on:(...args)=>window.on(...args),isDestroyed:()=>window.isDestroyed(),isMinimized:()=>window.isMinimized(),isMaximized:()=>false,getNormalBounds:()=>this.savedBounds()};
  for(const event of ['resize','move'])window.on(event,()=>this.captureExpanded());
  desktop.attach('floating',this.facade);
  window.on('focus',()=>this.opacity(true));window.on('blur',()=>this.opacity(false));window.on('hide',()=>{this.drag=null;});
  this.apply();
 }
 liveBounds(){const bounds=this.window.getBounds?.()||this.window.getNormalBounds();return {...bounds};}
 captureExpanded(){if(this.collapsed||this.transitioning)return;const bounds=this.liveBounds();if(validBounds(bounds)&&bounds.width>=160&&bounds.height>=80)this.expanded=bounds;}
 savedBounds(){this.captureExpanded();const bounds=this.liveBounds();return {...bounds,width:this.expanded.width,height:this.expanded.height};}
 record(){this.desktop.record('floating',this.facade);}
 place(bounds,defaults){const fitted=fitBounds(bounds,this.screen.getAllDisplays(),defaults),minimum=[fitted.minWidth,fitted.minHeight],transitioning=this.transitioning;this.transitioning=true;try{if(String(minimum)!==String(this.nativeMinimum)){this.window.setMinimumSize(...minimum);this.nativeMinimum=minimum;}this.window.setBounds(fitted);}finally{this.transitioning=transitioning;}}
 opacity(focused=this.window.isFocused?.()||false){const settings=this.desktop.settings;this.window.setOpacity(settings.floatingOpaqueOnFocus&&focused?1:settings.floatingOpacity/100);}
 startDrag(){if(this.window.isDestroyed()||this.window.isVisible?.()===false)throw new Error('浮動工具未顯示');this.drag={token:randomUUID(),bounds:this.liveBounds()};return {token:this.drag.token};}
 moveDrag(token,dx,dy){
  if(!this.drag||token!==this.drag.token)throw new Error('拖曳已結束');
  if(![dx,dy].every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000))throw new Error('拖曳位置無效');
  const bounds={...this.drag.bounds,x:Math.round(this.drag.bounds.x+dx),y:Math.round(this.drag.bounds.y+dy)},defaults=this.collapsed?{width:92,height:40,minWidth:92,minHeight:40}:windowDefaults(this.desktop.settings);
  this.place(bounds,defaults);this.captureExpanded();
 }
 endDrag(token){if(!this.drag||token!==this.drag.token)return;this.drag=null;this.record();}
 apply(){
  const collapsed=this.desktop.settings.floatingCollapsed,defaults=windowDefaults(this.desktop.settings),minimum=collapsed?[92,40]:[defaults.minWidth,defaults.minHeight],changed=collapsed!==this.collapsed;
  if(changed||String(minimum)!==String(this.minimum)){
   this.captureExpanded();const current=this.liveBounds(),target=collapsed?{...current,width:92,height:40}:changed?{...current,width:this.expanded.width,height:this.expanded.height}:current;
   this.transitioning=true;this.drag=null;
   try{this.window.setResizable(!collapsed);this.place(target,collapsed?{width:92,minWidth:92,height:40,minHeight:40}:defaults);this.collapsed=collapsed;this.minimum=minimum;}
   finally{this.transitioning=false;}
   this.captureExpanded();this.record();
  }
  this.opacity();
 }
 saveDefaultSize(){this.captureExpanded();const settings=this.desktop.update({floatingDefaultWidth:this.expanded.width,floatingDefaultHeight:this.expanded.height,floatingCollapsed:false});this.apply();this.record();return settings;}
 restoreDefaultSize(){this.desktop.update({floatingCollapsed:false});this.apply();const defaults=windowDefaults(this.desktop.settings);this.expanded={...this.liveBounds(),width:defaults.width,height:defaults.height};this.place(this.expanded,defaults);this.captureExpanded();this.record();return this.desktop.settings;}
 compactSize(){this.expanded={...this.liveBounds(),width:260,height:300};this.transitioning=true;try{this.place({...this.expanded,width:this.collapsed?92:260,height:this.collapsed?40:300},this.collapsed?{width:92,minWidth:92,height:40,minHeight:40}:windowDefaults(this.desktop.settings));}finally{this.transitioning=false;}this.captureExpanded();this.record();}
}
module.exports={FloatingWindow,DEFAULTS,windowDefaults};
