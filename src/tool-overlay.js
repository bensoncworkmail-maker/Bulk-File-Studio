'use strict';

const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {fitBounds}=require('./desktop-state');
const {captureBounds}=require('./floating-capture');
const {configuration}=require('./tool-views-model');

const windowKey=kind=>kind==='snippets'?'planning':kind;

class ToolOverlay{
 constructor(options){Object.assign(this,options);this.windows=new Map();}
 open(config){
  const key=windowKey(config.kind),existing=this.windows.get(key);
  if(existing&&!existing.window.isDestroyed()){
   existing.config=config;
   this.refresh(existing);
   existing.window.show();
   existing.window.focus();
   return {opened:true,popup:true};
  }
  const parent=this.parent(),displays=this.screen.getAllDisplays();
  const size=this.size(key)||{width:540,height:620};
  const sibling=[...this.windows.values()].find(entry=>!entry.window.isDestroyed())?.window;
  const anchor=sibling||parent;
  const bounds=anchor?captureBounds(anchor.getNormalBounds(),displays,size):
   fitBounds(null,displays,{...size,minWidth:340,minHeight:280});
  const window=new this.BrowserWindow({
   ...bounds,parent,show:false,skipTaskbar:true,alwaysOnTop:this.settings().floatingOnTop,
   autoHideMenuBar:true,title:'Bulk File Studio',
   webPreferences:{preload:path.join(__dirname,'tool-overlay-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}
  });
  this.windows.set(key,{window,config,parent});
  try{
   this.secureWindow(window);
   this.remember(key,window);
   window.on('closed',()=>{if(this.windows.get(key)?.window===window)this.windows.delete(key);});
   window.on('ready-to-show',()=>window.show());
   Promise.resolve(window.loadFile(path.join(__dirname,'tool-overlay.html'))).catch(error=>{
    this.error(error);
    if(!window.isDestroyed())window.destroy();
   });
  }catch(error){
   this.windows.delete(key);
   if(!window.isDestroyed())window.destroy();
   throw error;
  }
  return {opened:true,popup:true};
 }
 owner(event){
  if(event?.senderFrame?.url!==pathToFileURL(path.join(__dirname,'tool-overlay.html')).href)return null;
  return [...this.windows.values()].find(item=>!item.window.isDestroyed()&&item.window.webContents===event.sender);
 }
 switchTab(entry,kind){
  if(windowKey(entry.config.kind)!=='planning'||!['planning','snippets'].includes(kind)){
   throw new Error('此浮動工具沒有該分頁');
  }
  if(entry.config.kind!==kind){
   entry.config=configuration({kind});
   this.refresh(entry);
  }
 }
 payload({config}){
  const {theme,fontSize}=this.settings();
  return {config,theme,fontSize};
 }
 refresh(entry){
  if(!entry.window.isDestroyed())entry.window.webContents.send('tool-overlay-refresh',this.payload(entry));
 }
 invalidate(kind){
  for(const entry of this.windows.values()){
   if(!kind||entry.config.kind===kind)this.refresh(entry);
  }
 }
 updateSettings(previous){
  const settings=this.settings();
  for(const entry of this.windows.values()){
   if(entry.window.isDestroyed())continue;
   if(!previous||previous.floatingOnTop!==settings.floatingOnTop){
    entry.window.setAlwaysOnTop(settings.floatingOnTop);
   }
   if(previous&&(previous.theme!==settings.theme||previous.fontSize!==settings.fontSize||
    entry.config.kind==='logs'&&JSON.stringify(previous.logView)!==JSON.stringify(settings.logView))){
    this.refresh(entry);
   }
  }
 }
 closeForParent(parent){
  for(const entry of this.windows.values()){
   if(entry.parent===parent&&!entry.window.isDestroyed())entry.window.destroy();
  }
 }
 close(){for(const {window} of this.windows.values())if(!window.isDestroyed())window.destroy();}
}

module.exports={ToolOverlay};
