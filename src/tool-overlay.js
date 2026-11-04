'use strict';

const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {fitBounds}=require('./desktop-state');
const {captureBounds}=require('./floating-capture');

class ToolOverlay{
 constructor(options){Object.assign(this,options);this.windows=new Map();}
 open(config){
  const existing=this.windows.get(config.kind);
  if(existing&&!existing.window.isDestroyed()){
   existing.config=config;
   existing.window.webContents.send('tool-overlay-refresh',config);
   existing.window.show();
   existing.window.focus();
   return {opened:true,popup:true};
  }
  const parent=this.parent(),displays=this.screen.getAllDisplays();
  const size=this.size(config.kind)||{width:540,height:620};
  const bounds=parent?captureBounds(parent.getNormalBounds(),displays,size):
   fitBounds(null,displays,{...size,minWidth:340,minHeight:280});
  const window=new this.BrowserWindow({
   ...bounds,parent,show:false,skipTaskbar:true,alwaysOnTop:this.settings().floatingOnTop,
   autoHideMenuBar:true,title:'Bulk File Studio',
   webPreferences:{preload:path.join(__dirname,'tool-overlay-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}
  });
  this.windows.set(config.kind,{window,config});
  try{
   this.secureWindow(window);
   this.remember(config.kind,window);
   window.on('closed',()=>{if(this.windows.get(config.kind)?.window===window)this.windows.delete(config.kind);});
   window.on('ready-to-show',()=>window.show());
   Promise.resolve(window.loadFile(path.join(__dirname,'tool-overlay.html'))).catch(error=>{
    this.error(error);
    if(!window.isDestroyed())window.destroy();
   });
  }catch(error){
   this.windows.delete(config.kind);
   if(!window.isDestroyed())window.destroy();
   throw error;
  }
  return {opened:true,popup:true};
 }
 owner(event){
  if(event?.senderFrame?.url!==pathToFileURL(path.join(__dirname,'tool-overlay.html')).href)return null;
  return [...this.windows.values()].find(item=>!item.window.isDestroyed()&&item.window.webContents===event.sender);
 }
 invalidate(kind){
  for(const [key,{window,config}] of this.windows){
   if((!kind||key===kind)&&!window.isDestroyed())window.webContents.send('tool-overlay-refresh',config);
  }
 }
 close(){for(const {window} of this.windows.values())if(!window.isDestroyed())window.destroy();}
}

module.exports={ToolOverlay};
