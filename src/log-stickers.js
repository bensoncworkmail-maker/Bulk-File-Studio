'use strict';

const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {fitBounds}=require('./desktop-state');
const {FloatingPin}=require('./floating-pin');
const {isPreviewImage}=require('./document-preview');
const page=path.join(__dirname,'log-sticker.html');
const gap=10,minWidth=180,minHeight=130;
const currentBounds=window=>window.getBounds?.()||window.getNormalBounds();

class LogStickers {
 constructor(options){
  Object.assign(this,options);
  this.windows=new Map();
  this.loadLayout();
 }
 loadLayout(){
  const {hidden,layouts}=this.readLayout();
  this.hidden=hidden;
  this.layouts=new Map(Object.entries(layouts));
 }
 remember(entry){
  const {id,window,expanded,collapsedWidth,collapsed,headerAtBottom}=entry;
  if(!window.isDestroyed())this.layouts.set(id,{bounds:currentBounds(window),expanded,collapsedWidth,collapsed,headerAtBottom});
 }
 checkpoint(hidden=this.hidden){
  for(const entry of this.windows.values())this.remember(entry);
  const pinned=this.pinnedIds();
  for(const id of this.layouts.keys())if(!pinned.has(id))this.layouts.delete(id);
  this.saveLayout({hidden,layouts:Object.fromEntries(this.layouts)});
 }
 persist(){
  try{this.checkpoint();}catch(error){this.onError(error);}
 }
 visibleCount(){return this.hidden?0:this.windows.size;}
 applyOpacity(entry,focused=entry.window.isFocused()){
  entry.window.setOpacity(focused?1:entry.appearance.opacity/100);
 }
 show(entry){
  if(!entry.ready||this.hidden||entry.window.isDestroyed())return;
  entry.window.showInactive();
  entry.window.pinController.sync();
 }
 setHidden(hidden){
  this.checkpoint(hidden);
  this.hidden=hidden;
  for(const entry of this.windows.values()){
   if(hidden){entry.dragBounds=null;entry.window.hide();}
   else this.show(entry);
  }
 }
 clear(){
  this.close();
  this.layouts.clear();
  this.persist();
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
  const occupied=[...this.windows.values()].map(({window})=>currentBounds(window));
  for(let index=0;index<columns*rows;index++){
   cell={x:area.x+area.width-width-gap-(index%columns)*(width+gap),y:area.y+gap+Math.floor(index/columns)*(height+gap),width,height};
   if(!occupied.some(other=>cell.x<other.x+other.width&&other.x<cell.x+cell.width&&cell.y<other.y+other.height&&other.y<cell.y+cell.height))break;
  }
  return fitBounds(cell,displays,defaults);
 }
 open(id,detail=this.read([id]).get(id)){
  if(!detail)return;
  const existing=this.windows.get(id);
  if(existing){this.show(existing);return;}
  const appearance=this.appearance(),layout=this.layouts.get(id),collapsed=layout?.collapsed===true;
  const restored=layout&&{...layout.bounds,...(collapsed?{height:appearance.size.collapsedHeight}:{})};
  const bounds=this.bounds(appearance,restored,collapsed);
  const window=new this.BrowserWindow({...bounds,title:detail.heading,frame:false,show:false,skipTaskbar:true,alwaysOnTop:true,
   backgroundColor:appearance.background,autoHideMenuBar:true,maxWidth:1200,maxHeight:collapsed?bounds.height:1000,
   webPreferences:{preload:path.join(__dirname,'log-sticker-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
  const entry={id,window,detail,appearance,expanded:layout?.expanded??null,collapsedWidth:layout?.collapsedWidth??null,
   collapsed,headerAtBottom:layout?.headerAtBottom===true,ready:false};
  this.windows.set(id,entry);
  this.secureWindow(window);
  this.applyOpacity(entry,false);
  window.on('focus',()=>this.applyOpacity(entry,true));
  window.on('blur',()=>this.applyOpacity(entry,false));
  window.pinController=new FloatingPin(window,()=>({floatingOnTop:true}),{onError:this.onError});
  window.on('ready-to-show',()=>{
   if(this.windows.get(id)!==entry)return;
   entry.ready=true;
   this.show(entry);
  });
  // Only the named unpin action removes the saved pin. Native close may also come from Windows.
  window.on('close',()=>this.persist());
  window.on('closed',()=>{
   if(this.windows.get(id)===entry){this.windows.delete(id);this.onClosed?.();}
  });
  Promise.resolve(window.loadFile(page)).catch(error=>{this.remove(id);this.onError(error);});
 }
 owner(event){
  if(event?.senderFrame?.url!==pathToFileURL(page).href)return null;
  return [...this.windows.values()].find(({window})=>!window.isDestroyed()&&window.webContents===event.sender)||null;
 }
 payload(entry){
  const {links,...detail}=entry.detail;
  return {...detail,links:links.map(link=>({kind:link.kind,label:link.label,location:link.location,
   ref:this.linkRef(link),image:Boolean(link.path&&isPreviewImage(link.path))})),...entry.appearance,collapsed:entry.collapsed,headerAtBottom:entry.headerAtBottom};
 }
 toggle(entry,point){
  const content=point&&entry.window.getContentBounds?.();
  const anchor=content&&Number.isFinite(point.clientX)&&Number.isFinite(point.clientY)?
   {x:content.x+point.clientX,y:content.y+point.clientY}:point;
  return this.setCollapsed(entry,!entry.collapsed,anchor);
 }
 setCollapsed(entry,collapsed,point){
  if(entry.collapsed===collapsed)return this.payload(entry);
  if(collapsed){
   const {width,height}=currentBounds(entry.window);
   entry.expanded={width,height};
  }else entry.collapsedWidth=currentBounds(entry.window).width;
  entry.collapsed=collapsed;
  this.resize(entry,point);
  return this.payload(entry);
 }
 resize(entry,point,previousHeaderHeight=entry.appearance.size.collapsedHeight){
  const {window,appearance,expanded,collapsed}=entry,size=appearance.size,current=currentBounds(window);
  const headerY=entry.headerAtBottom?current.y+current.height-previousHeaderHeight:current.y;
  const target=collapsed?{width:entry.collapsedWidth??size.collapsedWidth,height:size.collapsedHeight}:{width:expanded?.width||size.width,height:expanded?.height||size.height};
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
  if(this.hidden)return;
  if(phase==='start'){entry.dragBounds=currentBounds(entry.window);return;}
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
 remove(id,{forget=false}={}){
  const entry=this.windows.get(id);
  if(forget&&this.layouts.delete(id)){
   this.windows.delete(id);
   this.persist();
  }
  if(!entry)return;
  this.windows.delete(id);
  if(!entry.window.isDestroyed())entry.window.destroy();
 }
 restore(){
  for(const [id,detail] of this.read())this.open(id,detail);
 }
 refresh(ids=this.windows.keys()){
  if(!this.windows.size)return;
  const selected=[...ids],details=this.read(selected),appearance=this.appearance();
  for(const id of selected){
   const entry=this.windows.get(id);
   const detail=details.get(id);
   if(!detail){this.remove(id);continue;}
   const oldSize=entry.appearance.size,newSize=appearance.size;
   const expandedChanged=oldSize.width!==newSize.width||oldSize.height!==newSize.height;
   const collapsedWidthChanged=oldSize.collapsedWidth!==newSize.collapsedWidth;
   const headerChanged=oldSize.collapsedHeight!==newSize.collapsedHeight;
   if(JSON.stringify(appearance)===JSON.stringify(entry.appearance)&&JSON.stringify(detail)===JSON.stringify(entry.detail))continue;
   entry.detail=detail;
   const previousOpacity=entry.appearance.opacity;
   entry.appearance=appearance;
   if(expandedChanged)entry.expanded=null;
   if(collapsedWidthChanged)entry.collapsedWidth=null;
   if(headerChanged||(entry.collapsed?collapsedWidthChanged:expandedChanged))this.resize(entry,undefined,oldSize.collapsedHeight);
   entry.window.setTitle(detail.heading);
   entry.window.setBackgroundColor?.(appearance.background);
   if(appearance.opacity!==previousOpacity)this.applyOpacity(entry);
   entry.window.webContents.send('log-sticker-changed',this.payload(entry));
  }
 }
 recover(){
  for(const entry of this.windows.values()){
   const current=currentBounds(entry.window);
   entry.window.setBounds(this.bounds(entry.appearance,current,entry.collapsed));
  }
 }
 syncTopmost(options){for(const entry of this.windows.values())entry.window.pinController.sync(options);}
 close(){for(const id of this.windows.keys())this.remove(id);}
}

module.exports={LogStickers};
