'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
class SnippetPicker {
 constructor(options){Object.assign(this,options);this.window=null;}
 owns(event){return Boolean(this.window&&!this.window.isDestroyed()&&event?.sender===this.window.webContents&&event.senderFrame?.url===pathToFileURL(path.join(__dirname,'snippet-picker.html')).href);}
 open(rows,target,onSelect){
  this.close();this.target=target;this.rows=rows;this.onSelect=onSelect;this.used=false;
  const point=this.screen.getCursorScreenPoint?.()||{x:100,y:100},area=(this.screen.getDisplayNearestPoint?.(point)||this.screen.getAllDisplays()[0]).workArea,width=Math.min(400,area.width),height=Math.min(520,area.height);
  const owner=new this.BrowserWindow({width,height,x:Math.round(Math.max(area.x,Math.min(point.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(point.y,area.y+area.height-height))),frame:false,show:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,resizable:false,webPreferences:{preload:path.join(__dirname,'snippet-picker-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
  this.window=owner;this.secureWindow(owner);owner.on('ready-to-show',()=>{if(this.window===owner&&!owner.isDestroyed())owner.showInactive();});owner.on('closed',()=>{if(this.window===owner)this.close();});
  this.timer=setTimeout(()=>this.close(),60000);this.timer.unref?.();
  try{this.escape=this.globalShortcut.register('Escape',()=>this.close());}catch{this.escape=false;}
  Promise.resolve(owner.loadFile(path.join(__dirname,'snippet-picker.html'))).catch(error=>{if(this.window===owner){this.close();this.onError(error);}});return {opened:true,popup:true,nonActivating:true};
 }
 data(){return {rows:this.rows.map(({id,title,detail,summary})=>({id,title,category:detail||'未分類',summary})),theme:this.settings().theme};}
 async select(id){if(this.used||!this.window||!this.rows.some(row=>row.id===id))throw new Error('片段選擇已失效');this.used=true;const target=this.target,select=this.onSelect;this.close();return select(id,{...target,noActivate:true});}
 close(){const owner=this.window;this.window=null;clearTimeout(this.timer);if(this.escape){this.globalShortcut.unregister?.('Escape');this.escape=false;}this.rows=[];this.target=null;this.onSelect=null;if(owner&&!owner.isDestroyed())owner.destroy();}
}
module.exports={SnippetPicker};
