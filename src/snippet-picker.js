'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url'),model=require('./snippet-picker-model');
class SnippetPicker {
 constructor(options){Object.assign(this,options);this.window=null;}
 owns(event){return Boolean(this.window&&!this.window.isDestroyed()&&event?.sender===this.window.webContents&&event.senderFrame?.url===pathToFileURL(path.join(__dirname,'snippet-picker.html')).href);}
 open(rows,target,onSelect){
  this.close();this.target=target;this.rows=rows;this.onSelect=onSelect;this.used=false;
  this.prefs=model.normalize(this.settings().snippetPicker);
  const point=this.screen.getCursorScreenPoint?.()||{x:100,y:100},area=(this.screen.getDisplayNearestPoint?.(point)||this.screen.getAllDisplays()[0]).workArea;
  const width=Math.min(this.prefs.width,area.width),height=Math.min(this.prefs.height,area.height);
  // No parent, focus(), show(), or native popup: keep the external text field active.
  const owner=new this.BrowserWindow({width,height,x:Math.round(Math.max(area.x,Math.min(point.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(point.y,area.y+area.height-height))),frame:false,show:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,resizable:false,webPreferences:{preload:path.join(__dirname,'snippet-picker-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
  this.window=owner;this.secureWindow(owner);
  owner.on('ready-to-show',()=>{
   if(this.window!==owner||owner.isDestroyed())return;
   this.clickWatch=this.watchPicker?.(owner,target);
   this.clickWatch?.ready.catch(()=>{}); // Foreground tracking still works if the native hook is unavailable.
   owner.showInactive();
  });
  owner.on('closed',()=>{if(this.window===owner)this.close();});
  this.timer=setTimeout(()=>this.close(),60000);this.timer.unref?.();
  this.keys=[];
  const bind=(key,action)=>{
   try{if(this.globalShortcut.register(key,action)){this.keys.push(key);return true;}}catch{/* Mouse selection is still available. */}
   return false;
  };
  this.escape=bind('Escape',()=>this.close());
  const firstNavigationKey=this.keys.length;
  this.keyboard=['Up','Down','Left','Right','Enter'].every(key=>bind(key,()=>{
   if(this.window===owner&&!owner.isDestroyed())owner.webContents.send('snippet-picker-key',key);
  }));
  if(!this.keyboard)for(const key of this.keys.splice(firstNavigationKey))this.globalShortcut.unregister(key);
  if(this.isCurrentTarget){
   let checking=false;
   this.targetTimer=setInterval(async()=>{
    if(checking)return;
    checking=true;
    try{if(!await this.isCurrentTarget(target,this.clickWatch?.handle)&&this.window===owner)this.close();}
    catch{if(this.window===owner)this.close();}
    finally{checking=false;}
   },this.watchPicker?65:250);
   this.targetTimer.unref?.();
  }
  Promise.resolve(owner.loadFile(path.join(__dirname,'snippet-picker.html'))).catch(error=>{if(this.window===owner){this.close();this.onError(error);}});
  return {opened:true,popup:true,nonActivating:true};
 }
 data(){return {keyboard:this.keyboard,escape:this.escape,rows:this.rows.map(({id,title,detail,summary})=>({id,title,groupKey:detail||'',summary})),theme:this.settings().theme,prefs:this.prefs,groupStates:model.history(this.groupStates?.())};}
 setGroups(changes){
  model.updateGroups([],changes,this.rows.map(row=>row.detail||''));
  if(!this.prefs.rememberGroups||!model.normalize(this.settings().snippetPicker).rememberGroups)return {saved:false};
  return this.saveGroups(changes);
 }
 async select(id){
  if(this.used||!this.window||!this.rows.some(row=>row.id===id))throw Error('片段選擇已失效');
  this.used=true;
  const owner=this.window,target=this.target,select=this.onSelect;
  if(this.clickWatch&&this.isCurrentTarget&&!await this.isCurrentTarget(target,this.clickWatch.handle)){
   if(this.window===owner)this.close();
   throw Error('片段選擇已關閉，已取消貼上');
  }
  if(this.window!==owner)throw Error('片段選擇已失效');
  this.close();
  return select(id,{...target,noActivate:true});
 }
 close(){const owner=this.window;this.window=null;clearTimeout(this.timer);clearInterval(this.targetTimer);this.clickWatch?.stop();this.clickWatch=null;for(const key of this.keys||[])this.globalShortcut.unregister?.(key);this.keys=[];this.rows=[];this.target=null;this.onSelect=null;if(owner&&!owner.isDestroyed())owner.destroy();}
}
module.exports={SnippetPicker};
