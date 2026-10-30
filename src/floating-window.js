'use strict';
const {fitBounds,validBounds}=require('./desktop-state');
const DEFAULTS={width:320,height:400,minWidth:220,minHeight:120};
const HEADER_DOUBLE_CLICK=0x00a3,HTCAPTION=2;
class FloatingWindow {
 constructor(window,desktop,screen,{platform=process.platform,onHeaderDoubleClick=()=>{}}={}){
  this.window=window;this.desktop=desktop;this.screen=screen;this.collapsed=false;this.transitioning=false;this.expanded=this.liveBounds();
  this.facade={on:(...args)=>window.on(...args),isDestroyed:()=>window.isDestroyed(),isMinimized:()=>window.isMinimized(),isMaximized:()=>false,getNormalBounds:()=>this.savedBounds()};
  for(const event of ['resize','move'])window.on(event,()=>this.captureExpanded());
  desktop.attach('floating',this.facade);
  window.on('focus',()=>this.opacity(true));window.on('blur',()=>this.opacity(false));
  if(platform==='win32'&&window.hookWindowMessage){
   // Draggable regions do not dispatch DOM mouse events. Only the caption hit
   // test is accepted, so double-clicking buttons or resize borders is excluded.
   window.hookWindowMessage(HEADER_DOUBLE_CLICK,wParam=>{
    if(!Buffer.isBuffer(wParam)||wParam.length<4||wParam.readUInt32LE(0)!==HTCAPTION||!desktop.settings.floatingHeaderDoubleClick)return;
    setImmediate(()=>{if(!window.isDestroyed()&&desktop.settings.floatingHeaderDoubleClick)onHeaderDoubleClick();});
   });
  }
  this.apply();
 }
 liveBounds(){const bounds=this.window.getBounds?.()||this.window.getNormalBounds();return {...bounds};}
 captureExpanded(){if(this.collapsed||this.transitioning)return;const bounds=this.liveBounds();if(validBounds(bounds)&&bounds.width>=DEFAULTS.minWidth&&bounds.height>=DEFAULTS.minHeight)this.expanded=bounds;}
 savedBounds(){this.captureExpanded();const bounds=this.liveBounds();return {...bounds,width:this.expanded.width,height:this.expanded.height};}
 record(){this.desktop.record('floating',this.facade);}
 opacity(focused=this.window.isFocused?.()||false){const settings=this.desktop.settings;this.window.setOpacity(settings.floatingOpaqueOnFocus&&focused?1:settings.floatingOpacity/100);}
 apply(){
  const collapsed=this.desktop.settings.floatingCollapsed;
  if(collapsed!==this.collapsed){
   this.captureExpanded();const current=this.liveBounds(),target={...current,width:collapsed?92:this.expanded.width,height:collapsed?40:this.expanded.height};
   this.transitioning=true;
   try{this.window.setMinimumSize(collapsed?92:220,collapsed?40:120);this.window.setResizable(!collapsed);this.window.setBounds(fitBounds(target,this.screen.getAllDisplays(),collapsed?{width:92,minWidth:92,height:40,minHeight:40}:DEFAULTS));this.collapsed=collapsed;}
   finally{this.transitioning=false;}
   this.captureExpanded();this.record();
  }
  this.opacity();
 }
 compactSize(){this.expanded={...this.liveBounds(),width:260,height:300};this.transitioning=true;try{this.window.setBounds(fitBounds({...this.expanded,width:this.collapsed?92:260,height:this.collapsed?40:300},this.screen.getAllDisplays(),this.collapsed?{width:92,minWidth:92,height:40,minHeight:40}:DEFAULTS));}finally{this.transitioning=false;}this.captureExpanded();this.record();}
}
module.exports={FloatingWindow,DEFAULTS,HEADER_DOUBLE_CLICK};
