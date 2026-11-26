'use strict';
class FloatingMenu{
 constructor({Menu,getWindow,showWindow,settings,onSettled=()=>{},onError=()=>{},defer=setTimeout}){
  Object.assign(this,{Menu,getWindow,showWindow,settings,onSettled,onError,defer});this.current=null;this.bound=new WeakSet();this.owners=new WeakMap();
 }
 bind(owner){
  if(this.bound.has(owner))return;this.bound.add(owner);
  owner.on('blur',()=>{const entry=this.current;if(entry?.owner!==owner)return;
   this.defer(()=>{if(this.current===entry&&!owner.isDestroyed()&&!owner.isFocused())this.close();},80);
  });
  for(const event of ['hide','close','closed'])owner.on(event,()=>{if(this.current?.owner===owner)this.close();});
 }
 activeFor(owner){return this.owners.has(owner);}
 release(entry){
  if(this.current===entry)this.current=null;
  const {owner}=entry;
  if(this.owners.get(owner)!==entry)return;
  this.owners.delete(owner);owner.nativeMenuOpen=false;
  // Native popup teardown can finish after closePopup returns. A replacement owns its own recovery.
  this.defer(()=>{
   if(this.activeFor(owner)||owner.isDestroyed())return;
   try{owner.pinController?.sync({force:true});this.onSettled();}
   catch(error){this.onError(error);}
  },0)?.unref?.();
 }
 closeAndWait(){
  const entry=this.current||this.owners.get(this.getWindow());if(!entry)return Promise.resolve();
  this.close();if(entry.nativeClosed)return Promise.resolve();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{entry.waiters.delete(done);reject(new Error('選單仍在關閉，文字已複製；請手動貼上'));},500);const done=()=>{clearTimeout(timer);resolve();};entry.waiters.add(done);});
 }
 close(){
  const entry=this.current;if(!entry)return;
  this.current=null;
  try{
   if(entry.owner.isDestroyed())entry.menu.closePopup();else entry.menu.closePopup(entry.owner);
   if(!entry.nativeClosed)this.defer(()=>this.release(entry),500)?.unref?.();
  }catch(error){this.release(entry);this.onError(error);}
 }
 popup(template,{allowCollapsed=false,anchor}={}){
  let owner=this.getWindow();if(!owner||owner.isDestroyed()||!owner.isVisible()){this.showWindow();owner=this.getWindow();}
  if(!owner||owner.isDestroyed()||!allowCollapsed&&this.settings().floatingCollapsed)throw new Error('請先展開浮動工具');
  this.close();this.bind(owner);
  // A global accelerator can arrive while another application owns foreground focus.
  // Native menus dismiss correctly only when their owner participates in activation.
  const entry={owner,menu:this.Menu.buildFromTemplate(template),waiters:new Set(),nativeClosed:false};
  this.current=entry;this.owners.set(owner,entry);owner.nativeMenuOpen=true;
  const bounds=anchor&&(owner.getContentBounds?.()||owner.getNormalBounds()),zoom=owner.webContents.getZoomFactor?.()||1;
  const point=bounds&&Number.isFinite(anchor.x)&&Number.isFinite(anchor.y)?{
   x:Math.round(Math.min(bounds.width,Math.max(0,anchor.x*zoom))),
   y:Math.round(Math.min(bounds.height,Math.max(0,anchor.y*zoom)))
  }:{};
  try{owner.show();owner.focus();entry.menu.popup({window:owner,...point,callback:()=>{entry.nativeClosed=true;for(const done of entry.waiters)done();entry.waiters.clear();this.release(entry);}});}
  catch(error){this.release(entry);throw error;}
 }
}
module.exports={FloatingMenu};
