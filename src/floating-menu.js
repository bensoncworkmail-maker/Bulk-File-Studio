'use strict';
class FloatingMenu{
 constructor({Menu,getWindow,showWindow,settings,onError=()=>{},defer=setTimeout}){
  Object.assign(this,{Menu,getWindow,showWindow,settings,onError,defer});this.current=null;this.bound=new WeakSet();
 }
 bind(owner){
  if(this.bound.has(owner))return;this.bound.add(owner);
  owner.on('blur',()=>{const entry=this.current;if(entry?.owner!==owner)return;
   this.defer(()=>{if(this.current===entry&&!owner.isDestroyed()&&!owner.isFocused())this.close();},80);
  });
  for(const event of ['hide','close','closed'])owner.on(event,()=>{if(this.current?.owner===owner)this.close();});
 }
 release(entry){
  if(this.current!==entry)return;this.current=null;
  entry.owner.nativeMenuOpen=false;
  if(!entry.owner.isDestroyed())try{entry.owner.pinController?.sync();}catch(error){this.onError(error);}
 }
 close(){
  const entry=this.current;if(!entry)return;
  try{if(!entry.owner.isDestroyed())entry.menu.closePopup(entry.owner);else entry.menu.closePopup();}catch(error){this.onError(error);}finally{this.release(entry);}
 }
 popup(template,{allowCollapsed=false,anchor}={}){
  let owner=this.getWindow();if(!owner||owner.isDestroyed()||!owner.isVisible()){this.showWindow();owner=this.getWindow();}
  if(!owner||owner.isDestroyed()||!allowCollapsed&&this.settings().floatingCollapsed)throw new Error('請先展開浮動工具');
  this.close();this.bind(owner);
  // A global accelerator can arrive while another application owns foreground focus.
  // Native menus dismiss correctly only when their owner participates in activation.
  owner.show();owner.focus();
  const entry={owner,menu:this.Menu.buildFromTemplate(template)};this.current=entry;owner.nativeMenuOpen=true;
  const bounds=anchor&&(owner.getContentBounds?.()||owner.getNormalBounds()),zoom=owner.webContents.getZoomFactor?.()||1;
  const point=bounds&&Number.isFinite(anchor.x)&&Number.isFinite(anchor.y)?{
   x:Math.round(Math.min(bounds.width,Math.max(0,anchor.x*zoom))),
   y:Math.round(Math.min(bounds.height,Math.max(0,anchor.y*zoom)))
  }:{};
  try{entry.menu.popup({window:owner,...point,callback:()=>this.release(entry)});}
  catch(error){this.release(entry);throw error;}
 }
}
module.exports={FloatingMenu};
