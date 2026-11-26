'use strict';

const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {fitBounds}=require('./desktop-state');
const page=path.join(__dirname,'log-sticker.html');
const width=280,height=245,headerHeight=36,gap=10;

class LogStickers {
 constructor(options){
  Object.assign(this,options);
  this.windows=new Map();
 }
 bounds(entry){
  const displays=this.screen.getAllDisplays();
  const size={width,height,minWidth:200,minHeight:entry?.collapsed?headerHeight:120};
  if(entry){
   const current=entry.window.getNormalBounds();
   return fitBounds({...current,height:entry.collapsed?headerHeight:entry.height},displays,size);
  }
  const point=this.screen.getCursorScreenPoint?.()||{x:100,y:100};
  const area=(this.screen.getDisplayNearestPoint?.(point)||displays[0]).workArea;
  const columns=Math.max(1,Math.floor((area.width-gap)/(width+gap)));
  const rows=Math.max(1,Math.floor((area.height-gap)/(height+gap)));
  let cell;
  const occupied=[...this.windows.values()].map(({window})=>window.getNormalBounds());
  for(let index=0;index<columns*rows;index++){
   cell={x:area.x+area.width-width-gap-(index%columns)*(width+gap),y:area.y+gap+Math.floor(index/columns)*(height+gap),width,height};
   if(!occupied.some(other=>cell.x<other.x+other.width&&other.x<cell.x+cell.width&&cell.y<other.y+other.height&&other.y<cell.y+cell.height))break;
  }
  return fitBounds(cell,displays,size);
 }
 open(id,detail=this.read([id]).get(id)){
  if(!detail)return;
  const existing=this.windows.get(id);
  if(existing){existing.window.showInactive();return;}
  const appearance=this.appearance();
  const window=new this.BrowserWindow({...this.bounds(),title:detail.heading,frame:false,show:false,skipTaskbar:true,alwaysOnTop:true,
   backgroundColor:appearance.background,autoHideMenuBar:true,
   webPreferences:{preload:path.join(__dirname,'log-sticker-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
  const entry={id,window,detail,appearance,height:window.getNormalBounds().height,collapsed:false};
  this.windows.set(id,entry);
  this.secureWindow(window);
  window.on('ready-to-show',()=>{if(this.windows.get(id)===entry)window.showInactive();});
  window.on('close',event=>{
   event.preventDefault();
   try{this.unpin(id);}catch(error){window.webContents.send('log-sticker-error',error.message);this.onError(error);}
  });
  window.on('closed',()=>{if(this.windows.get(id)===entry)this.windows.delete(id);});
  Promise.resolve(window.loadFile(page)).catch(error=>{this.remove(id);this.onError(error);});
 }
 owner(event){
  if(event?.senderFrame?.url!==pathToFileURL(page).href)return null;
  return [...this.windows.values()].find(({window})=>!window.isDestroyed()&&window.webContents===event.sender)||null;
 }
 payload(entry){
  const {links,...detail}=entry.detail;
  return {...detail,links:links.map(({label})=>({label})),...entry.appearance,collapsed:entry.collapsed};
 }
 toggle(entry){return this.setCollapsed(entry,!entry.collapsed);}
 setCollapsed(entry,collapsed){
  if(entry.collapsed===collapsed)return this.payload(entry);
  const {window}=entry;
  if(collapsed)entry.height=window.getNormalBounds().height;
  entry.collapsed=collapsed;
  window.setMinimumSize(200,entry.collapsed?headerHeight:120);
  window.setResizable(!entry.collapsed);
  window.setBounds(this.bounds(entry));
  return this.payload(entry);
 }
 setAllCollapsed(collapsed){
  for(const entry of this.windows.values()){
   if(entry.collapsed!==collapsed)entry.window.webContents.send('log-sticker-changed',this.setCollapsed(entry,collapsed));
  }
 }
 remove(id){
  const entry=this.windows.get(id);
  if(!entry)return;
  this.windows.delete(id);
  if(!entry.window.isDestroyed())entry.window.destroy();
 }
 restore(){
  for(const [id,detail] of this.read())this.open(id,detail);
 }
 refresh(){
  if(!this.windows.size)return;
  const details=this.read(this.windows.keys()),appearance=this.appearance();
  for(const [id,entry] of this.windows){
   const detail=details.get(id);
   if(!detail){this.remove(id);continue;}
   if(appearance.background===entry.appearance.background&&JSON.stringify(detail)===JSON.stringify(entry.detail))continue;
   entry.detail=detail;
   entry.appearance=appearance;
   entry.window.setTitle(detail.heading);
   entry.window.setBackgroundColor?.(appearance.background);
   entry.window.webContents.send('log-sticker-changed',this.payload(entry));
  }
 }
 recover(){
  for(const entry of this.windows.values()){
   if(!entry.collapsed)entry.height=entry.window.getNormalBounds().height;
   entry.window.setBounds(this.bounds(entry));
  }
 }
 close(){for(const id of this.windows.keys())this.remove(id);}
}

module.exports={LogStickers};
