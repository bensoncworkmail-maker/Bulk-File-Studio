'use strict';
const layout=require('./floating-layout');
class FloatingAutoCollapse{
 constructor({window,screen,settings,blocked=()=>false,collapse,onError=()=>{},now=Date.now,setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
  Object.assign(this,{window,screen,settings,blocked,collapse,onError,now,clearIntervalFn});this.outsideAt=null;this.blurAt=null;this.pending=false;
  window.on('blur',()=>{this.blurAt=now();});window.on('focus',()=>{this.blurAt=null;});window.on('hide',()=>this.reset());
  this.timer=setIntervalFn(()=>{try{this.tick();}catch(error){this.onError(error);}},150);this.timer?.unref?.();window.on('closed',()=>clearIntervalFn(this.timer));
 }
 reset(){this.outsideAt=this.blurAt=null;}
 tick(){
  const s=this.settings(),w=this.window;if(this.pending||w.isDestroyed())return;
  if(!s.floatingAutoCollapse||!layout.modern(s.floatingLauncher)||s.floatingCollapsed||s.floatingPanelPinned||!w.isVisible()||this.blocked()){this.reset();return;}
  const b=w.getContentBounds?.()||w.getBounds?.()||w.getNormalBounds(),point=this.screen.getCursorScreenPoint?.(),x=point?.x-b.x,y=point?.y-b.y;if(!point)return;
  const regions=layout.inputRegions(s.floatingLauncher,s.floatingDockEdge,false,b.width,b.height),inside=regions.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height),at=this.now();
  if(inside)this.outsideAt=null;else this.outsideAt??=at;
  if(this.outsideAt!==null&&at-this.outsideAt>=650||this.blurAt!==null&&at-this.blurAt>=250){this.pending=true;this.reset();Promise.resolve().then(()=>this.collapse()).catch(this.onError).finally(()=>{this.pending=false;});}
 }
}
module.exports={FloatingAutoCollapse};
