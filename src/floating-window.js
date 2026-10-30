'use strict';
const {fitBounds}=require('./desktop-state');
const DEFAULTS={width:320,height:400,minWidth:220,minHeight:120};
class FloatingWindow {
 constructor(window,desktop,screen){this.window=window;this.desktop=desktop;this.screen=screen;this.collapsed=false;this.expanded=window.getNormalBounds();this.facade={on:(...args)=>window.on(...args),isDestroyed:()=>window.isDestroyed(),isMinimized:()=>window.isMinimized(),isMaximized:()=>false,getNormalBounds:()=>this.savedBounds()};desktop.attach('floating',this.facade);window.on('focus',()=>this.opacity(true));window.on('blur',()=>this.opacity(false));this.apply();}
 savedBounds(){const bounds=this.window.getNormalBounds();return this.collapsed?{...bounds,width:this.expanded.width,height:this.expanded.height}:bounds;}
 record(){this.desktop.record('floating',this.facade);}
 opacity(focused=this.window.isFocused?.()||false){const settings=this.desktop.settings;this.window.setOpacity(settings.floatingOpaqueOnFocus&&focused?1:settings.floatingOpacity/100);}
 apply(){const collapsed=this.desktop.settings.floatingCollapsed;if(collapsed!==this.collapsed){const current=this.window.getNormalBounds();if(collapsed)this.expanded=current;this.collapsed=collapsed;this.window.setMinimumSize(collapsed?92:220,collapsed?40:120);this.window.setResizable(!collapsed);const target=collapsed?{...current,width:92,height:40}:{...current,width:this.expanded.width,height:this.expanded.height};const defaults=collapsed?{...DEFAULTS,width:92,minWidth:92,height:40,minHeight:40}:DEFAULTS;this.window.setBounds(fitBounds(target,this.screen.getAllDisplays(),defaults));}this.opacity();}
 compactSize(){const current=this.window.getNormalBounds();this.expanded={...current,width:260,height:300};this.window.setBounds(fitBounds({...this.expanded,width:this.collapsed?92:260,height:this.collapsed?40:300},this.screen.getAllDisplays(),this.collapsed?{...DEFAULTS,width:92,minWidth:92,height:40,minHeight:40}:DEFAULTS));this.record();}
}
module.exports={FloatingWindow,DEFAULTS};
