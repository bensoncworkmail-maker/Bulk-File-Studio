'use strict';

const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {fitBounds}=require('./desktop-state');
const page=path.join(__dirname,'log-sticker.html');
const gap=10,minWidth=180,minHeight=130;

class LogStickers {
 constructor(options){
  Object.assign(this,options);
  this.windows=new Map();
 }
 bounds(appearance,requested,collapsed=false){
  const displays=this.screen.getAllDisplays(),size=appearance.size;
  const defaults={width:size.width,height:size.height,minWidth,minHeight:collapsed?size.collapsedHeight:minHeight};
  if(requested)return fitBounds(requested,displays,defaults);
  const point=this.screen.getCursorScreenPoint?.()||{x:100,y:100};
  const area=(this.screen.getDisplayNearestPoint?.(point)||displays[0]).workArea;
  const {width,height}=size;
  const columns=Math.max(1,Math.floor((area.width-gap)/(width+gap)));
  const rows=Math.max(1,Math.floor((area.height-gap)/(height+gap)));
  let cell;
  const occupied=[...this.windows.values()].map(({window})=>window.getNormalBounds());
  for(let index=0;index<columns*rows;index++){
   cell={x:area.x+area.width-width-gap-(index%columns)*(width+gap),y:area.y+gap+Math.floor(index/columns)*(height+gap),width,height};
   if(!occupied.some(other=>cell.x<other.x+other.width&&other.x<cell.x+cell.width&&cell.y<other.y+other.height&&other.y<cell.y+cell.height))break;
  }
  return fitBounds(cell,displays,defaults);
 }
 open(id,detail=this.read([id]).get(id)){
  if(!detail)return;
  const existing=this.windows.get(id);
  if(existing){existing.window.showInactive();return;}
  const appearance=this.appearance();
  const window=new this.BrowserWindow({...this.bounds(appearance),title:detail.heading,frame:false,show:false,skipTaskbar:true,alwaysOnTop:true,
   backgroundColor:appearance.background,autoHideMenuBar:true,maxWidth:1200,maxHeight:1000,
   webPreferences:{preload:path.join(__dirname,'log-sticker-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
  const entry={id,window,detail,appearance,expanded:null,collapsed:false,headerAtBottom:false};
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
  return {...detail,links:links.map(({kind,label,location})=>({kind,label,location})),...entry.appearance,collapsed:entry.collapsed,headerAtBottom:entry.headerAtBottom};
 }
 toggle(entry,point){return this.setCollapsed(entry,!entry.collapsed,point);}
 setCollapsed(entry,collapsed,point){
  if(entry.collapsed===collapsed)return this.payload(entry);
  if(collapsed){
   const {width,height}=entry.window.getNormalBounds();
   entry.expanded={width,height};
  }
  entry.collapsed=collapsed;
  this.resize(entry,point);
  return this.payload(entry);
 }
 resize(entry,point,previousHeaderHeight=entry.appearance.size.collapsedHeight){
  const {window,appearance,expanded,collapsed}=entry,size=appearance.size,current=window.getNormalBounds();
  const headerY=entry.headerAtBottom?current.y+current.height-previousHeaderHeight:current.y;
  const target=collapsed?{width:size.collapsedWidth,height:size.collapsedHeight}:{width:expanded?.width||size.width,height:expanded?.height||size.height};
  target.x=current.x;target.y=headerY;
  // Keep the title under the pointer when shrinking or opening near the edge of a display.
  if(point&&Number.isFinite(point.x)&&point.x>=current.x&&point.x<current.x+current.width&&
   Number.isFinite(point.y)&&point.y>=headerY&&point.y<headerY+previousHeaderHeight){
   target.x=Math.max(target.x,Math.ceil(point.x-target.width+48));
  }
  const area=this.screen.getAllDisplays().map(display=>display.workArea).find(area=>
   current.x>=area.x&&current.x<area.x+area.width&&headerY>=area.y&&headerY<area.y+area.height);
  entry.headerAtBottom=false;
  if(!collapsed&&area){
   const below=area.y+area.height-headerY,above=headerY-area.y+size.collapsedHeight;
   entry.headerAtBottom=target.height>below&&above>below;
   const available=entry.headerAtBottom?above:below;
   target.height=Math.min(target.height,Math.max(minHeight,available));
   if(entry.headerAtBottom)target.y=headerY+size.collapsedHeight-target.height;
  }
  const next=this.bounds(appearance,target,collapsed);
  // Keep the native window style stable between states so the title remains a client-area target.
  window.setMaximumSize?.(1200,1000);
  window.setMinimumSize(next.minWidth,next.minHeight);
  window.setBounds(next);
  if(collapsed)window.setMaximumSize?.(1200,next.height);
 }
 drag(entry,phase,dx,dy){
  if(phase==='start'){entry.dragBounds=entry.window.getNormalBounds();return;}
  if(phase==='end'){entry.dragBounds=null;return;}
  if(phase!=='move'||![dx,dy].every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=100000))throw Error('便條拖曳位置無效');
  const original=entry.dragBounds;
  if(!original)return;
  const bounds=this.bounds(entry.appearance,{...original,x:Math.round(original.x+dx),y:Math.round(original.y+dy)},entry.collapsed);
  entry.window.setBounds(bounds);
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
   const resized=JSON.stringify(appearance.size)!==JSON.stringify(entry.appearance.size);
   if(JSON.stringify(appearance)===JSON.stringify(entry.appearance)&&JSON.stringify(detail)===JSON.stringify(entry.detail))continue;
   entry.detail=detail;
   const previousHeaderHeight=entry.appearance.size.collapsedHeight;
   entry.appearance=appearance;
   if(resized){entry.expanded=null;this.resize(entry,undefined,previousHeaderHeight);}
   entry.window.setTitle(detail.heading);
   entry.window.setBackgroundColor?.(appearance.background);
   entry.window.webContents.send('log-sticker-changed',this.payload(entry));
  }
 }
 recover(){
  for(const entry of this.windows.values()){
   const current=entry.window.getNormalBounds();
   entry.window.setBounds(this.bounds(entry.appearance,current,entry.collapsed));
  }
 }
 close(){for(const id of this.windows.keys())this.remove(id);}
}

module.exports={LogStickers};
