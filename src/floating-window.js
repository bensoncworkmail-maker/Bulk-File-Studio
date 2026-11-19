'use strict';
const {fitBounds,validBounds}=require('./desktop-state');
const {randomUUID}=require('node:crypto');
const layout=require('./floating-layout');
const DEFAULTS={width:320,height:400,minWidth:220,minHeight:120};
function collapsedMinimumWidth(settings){const items=settings.floatingCollapsedItems||['pin','close'];return Math.max(92,8+27*(1+['pin','close','main','search','draft','focus'].filter(key=>items.includes(key)&&(key!=='search'||settings.floatingGlobalSearch!==false)).length)+(items.includes('focus')?30:0)+(items.includes('caption')?30:0)+(items.includes('quick-actions')?50:0));}
function launcherBounds(settings){const size=layout.capsule(settings.floatingLauncher,settings.floatingDockEdge);return size?{...size,minWidth:size.width,minHeight:size.height}:null;}
function windowDefaults(settings={}){const mode=settings.floatingLauncher,edge=settings.floatingDockEdge,modern=layout.modern(mode),size=layout.defaults(mode,edge),minimum=layout.minimum(mode,edge);return {...DEFAULTS,width:Math.max(size?.width||160,settings.floatingDefaultWidth||320),height:Math.max(size?.height||80,settings.floatingDefaultHeight||400),minWidth:Math.max(modern?minimum.width:160,settings.floatingMinWidth||220),minHeight:Math.max(modern?minimum.height:80,settings.floatingMinHeight||120)};}
class FloatingWindow {
 constructor(window,desktop,screen){
  this.window=window;this.desktop=desktop;this.screen=screen;this.collapsed=false;this.transitioning=false;this.expanded=this.liveBounds();this.drag=null;
  this.facade={on:(...args)=>window.on(...args),isDestroyed:()=>window.isDestroyed(),isMinimized:()=>window.isMinimized(),isMaximized:()=>false,getNormalBounds:()=>this.savedBounds(),getLauncherBounds:()=>this.launcherPosition()};
  for(const event of ['resize','move'])window.on(event,()=>this.captureExpanded());
  desktop.attach('floating',this.facade);
  window.on('focus',()=>this.opacity(true));window.on('blur',()=>this.opacity(false));window.on('hide',()=>{this.drag=null;});
  this.apply();
 }
 liveBounds(){const bounds=this.window.getContentBounds?.()||this.window.getBounds?.()||this.window.getNormalBounds();return {...bounds};}
 captureExpanded(){if(this.collapsed||this.transitioning)return;const bounds=this.liveBounds();if(validBounds(bounds)&&bounds.width>=160&&bounds.height>=80)this.expanded=bounds;}
 launcherPosition(){if(!layout.modern(this.launcherMode))return null;const bounds=this.liveBounds(),box=layout.surfaces(this.launcherMode,this.dockEdge,this.collapsed,bounds.width,bounds.height).launcher,size=launcherBounds(this.desktop.settings),inset=this.launcherMode==='bubble'?3:4;return {x:bounds.x+box.x-inset,y:bounds.y+box.y-inset,width:size.width,height:size.height};}
 savedBounds(){this.captureExpanded();const bounds=this.liveBounds(),expanded={...bounds,width:this.expanded.width,height:this.expanded.height};if(this.collapsed&&layout.modern(this.launcherMode)){const current=layout.surfaces(this.launcherMode,this.dockEdge,true,bounds.width,bounds.height).launcher,next=layout.surfaces(this.launcherMode,this.dockEdge,false,expanded.width,expanded.height).launcher;expanded.x+=current.x-next.x;expanded.y+=current.y-next.y;}return expanded;}
 record(){if(this.collapsed&&this.drag&&this.drag.mode!=='move'){this.desktop.update({floatingCollapsedWidth:this.liveBounds().width});this.appliedCollapsedWidth=this.desktop.settings.floatingCollapsedWidth;}this.desktop.record('floating',this.facade);}
 place(bounds,defaults){const displays=this.screen.getAllDisplays(),fitted=fitBounds(bounds,displays,defaults);if(this.desktop.settings.floatingLauncher==='dock'){const area=displays.find(d=>fitted.x>=d.workArea.x&&fitted.x<d.workArea.x+d.workArea.width&&fitted.y>=d.workArea.y&&fitted.y<d.workArea.y+d.workArea.height)?.workArea||displays[0]?.workArea;if(area){const edge=this.desktop.settings.floatingDockEdge;if(edge==='left')fitted.x=area.x;if(edge==='right')fitted.x=area.x+area.width-fitted.width;if(edge==='top')fitted.y=area.y;if(edge==='bottom')fitted.y=area.y+area.height-fitted.height;}}const minimum=[fitted.minWidth,fitted.minHeight],transitioning=this.transitioning;this.transitioning=true;try{if(String(minimum)!==String(this.nativeMinimum)){this.window.setMinimumSize(...minimum);this.nativeMinimum=minimum;}if(this.window.setContentBounds)this.window.setContentBounds({x:fitted.x,y:fitted.y,width:fitted.width,height:fitted.height});else this.window.setBounds(fitted);}finally{this.transitioning=transitioning;}}
 opacity(focused=this.window.isFocused?.()||false){const settings=this.desktop.settings;this.window.setOpacity(settings.floatingOpaqueOnFocus&&focused?1:settings.floatingOpacity/100);}
 startDrag(mode='move'){if(mode!=='move'&&launcherBounds(this.desktop.settings))throw new Error('入口大小由顯示模式決定');if(!['move','resize-left','resize-right'].includes(mode)||mode!=='move'&&!this.collapsed)throw new Error('不支援的拖曳操作');if(this.window.isDestroyed()||this.window.isVisible?.()===false)throw new Error('浮動工具未顯示');this.drag={token:randomUUID(),bounds:this.liveBounds(),mode};return {token:this.drag.token};}
 moveDrag(token,dx,dy){
  if(!this.drag||token!==this.drag.token)throw new Error('拖曳已結束');
  if(![dx,dy].every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000))throw new Error('拖曳位置無效');
  const resizing=this.drag.mode!=='move',width=resizing?Math.max(collapsedMinimumWidth(this.desktop.settings),Math.min(800,Math.round(this.drag.bounds.width+(this.drag.mode==='resize-left'?-dx:dx)))):this.drag.bounds.width;
  const bounds=resizing?{...this.drag.bounds,x:this.drag.bounds.x+(this.drag.mode==='resize-left'?this.drag.bounds.width-width:0),width,height:40}:{...this.drag.bounds,x:Math.round(this.drag.bounds.x+dx),y:Math.round(this.drag.bounds.y+dy)},defaults=this.collapsed?(launcherBounds(this.desktop.settings)||{width:this.desktop.settings.floatingCollapsedWidth,height:40,minWidth:collapsedMinimumWidth(this.desktop.settings),minHeight:40}):windowDefaults(this.desktop.settings);
  this.place(bounds,defaults);this.captureExpanded();
 }
 endDrag(token){if(!this.drag||token!==this.drag.token)return;const resizing=this.drag.mode!=='move';this.record();this.drag=null;if(resizing){this.appliedCollapsedWidth=this.desktop.settings.floatingCollapsedWidth;return {settings:this.desktop.settings};}}
 apply(){
  const launcher=launcherBounds(this.desktop.settings),collapsed=this.desktop.settings.floatingCollapsed,defaults=windowDefaults(this.desktop.settings),minimum=collapsed?(launcher?[launcher.minWidth,launcher.minHeight]:[collapsedMinimumWidth(this.desktop.settings),40]):[defaults.minWidth,defaults.minHeight],width=this.desktop.settings.floatingCollapsedWidth,changed=collapsed!==this.collapsed;
  if(changed||this.launcherMode!==this.desktop.settings.floatingLauncher||this.dockEdge!==this.desktop.settings.floatingDockEdge||collapsed&&this.appliedCollapsedWidth!==width||String(minimum)!==String(this.minimum)){
   this.captureExpanded();const current=this.liveBounds(),mode=this.desktop.settings.floatingLauncher,edge=this.desktop.settings.floatingDockEdge,modeChanged=mode!==this.launcherMode;
   const target=collapsed?{...current,width:launcher?.width||width,height:launcher?.height||40}:changed||modeChanged?{...current,width:Math.max(this.expanded.width,this.launcherMode==='classic'&&layout.modern(mode)?defaults.width:defaults.minWidth),height:Math.max(this.expanded.height,this.launcherMode==='classic'&&layout.modern(mode)?defaults.height:defaults.minHeight)}:current;
   const oldMode=this.launcherMode||mode,oldEdge=this.dockEdge||edge;
   if(layout.modern(oldMode)&&layout.modern(mode)){
    const old=layout.surfaces(oldMode,oldEdge,this.collapsed,current.width,current.height).launcher,next=layout.surfaces(mode,edge,collapsed,target.width,target.height).launcher;
    target.x+=old.x-next.x;target.y+=old.y-next.y;
   }
   const remembered=this.desktop.data.windows.floating?.launcherBounds;if(this.launcherMode===undefined&&collapsed&&launcher&&this.desktop.settings.rememberWindow&&validBounds(remembered)){target.x=remembered.x;target.y=remembered.y;}
   this.transitioning=true;this.drag=null;
   try{this.window.setResizable(!collapsed);this.place(target,collapsed?(launcher||{width,minWidth:collapsedMinimumWidth(this.desktop.settings),height:40,minHeight:40}):defaults);this.collapsed=collapsed;this.launcherMode=this.desktop.settings.floatingLauncher;this.dockEdge=this.desktop.settings.floatingDockEdge;this.minimum=minimum;this.appliedCollapsedWidth=width;}
   finally{this.transitioning=false;}
   this.captureExpanded();this.record();
  }
  this.opacity();
 }
 ensureVisible(){const bounds=this.liveBounds(),defaults=this.collapsed?(launcherBounds(this.desktop.settings)||{width:this.desktop.settings.floatingCollapsedWidth,height:40,minWidth:collapsedMinimumWidth(this.desktop.settings),minHeight:40}):windowDefaults(this.desktop.settings);this.place(bounds,defaults);this.captureExpanded();this.record();}
 saveDefaultSize(){this.captureExpanded();const settings=this.desktop.update({floatingDefaultWidth:this.expanded.width,floatingDefaultHeight:this.expanded.height,floatingCollapsed:false});this.apply();this.record();return settings;}
 restoreDefaultSize(){this.desktop.update({floatingCollapsed:false});this.apply();const defaults=windowDefaults(this.desktop.settings);this.expanded={...this.liveBounds(),width:defaults.width,height:defaults.height};this.place(this.expanded,defaults);this.captureExpanded();this.record();return this.desktop.settings;}
 compactSize(){if(this.collapsed&&launcherBounds(this.desktop.settings)){this.expanded={...this.liveBounds(),width:260,height:300};this.record();return;}this.expanded={...this.liveBounds(),width:260,height:300};this.transitioning=true;try{this.place({...this.expanded,width:this.collapsed?this.desktop.settings.floatingCollapsedWidth:260,height:this.collapsed?40:300},this.collapsed?{width:this.desktop.settings.floatingCollapsedWidth,minWidth:collapsedMinimumWidth(this.desktop.settings),height:40,minHeight:40}:windowDefaults(this.desktop.settings));}finally{this.transitioning=false;}this.captureExpanded();this.record();}
}
module.exports={launcherBounds,FloatingWindow,DEFAULTS,windowDefaults,collapsedMinimumWidth};
