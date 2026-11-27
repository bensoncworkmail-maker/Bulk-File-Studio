'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {fitBounds}=require('./desktop-state'),{captureBounds}=require('./floating-capture'),{configuration}=require('./tool-views-model'),{logFilterKey}=require('./log-view-settings-model'),{FloatingPin}=require('./floating-pin');
const extras=new Set(['files','drafts','clipboard']);
class ToolOverlay{
 constructor(options){Object.assign(this,options);this.windows=new Map();this.quitting=false;}
 layout(kind){return this.settings().floatingToolLayout?.[kind];}
 save(entry,patch){if(this.layout(entry.config.kind))this.saveLayout?.(entry.config.kind,patch);entry.state={...entry.state,...patch};}
 open(config){
  const key=config.kind;if(!extras.has(key))config=configuration(config);
  const existing=this.windows.get(key);if(existing&&!existing.window.isDestroyed()){existing.config=config;this.save(existing,{visible:true});this.recover(existing);this.refresh(existing);if(existing.window.isMinimized?.())existing.window.restore();existing.window.pinController.reloadCrashedRenderer();existing.window.show();existing.window.focus();return {opened:true,popup:true};}
  const state=this.layout(key),pinned=key==='logs'?this.settings().floatingLogsPinned===true:state?.pinned===true,parent=pinned||key==='logs'?undefined:this.parent(),displays=this.screen.getAllDisplays(),size=state?.panelSize||this.size(key)||(key==='logs'?{width:430,height:580}:{width:420,height:540});
  const anchor=[...this.windows.values()].find(entry=>!entry.window.isDestroyed())?.window||this.parent();
  const bounds=state?.bounds?fitBounds({...state.bounds,...(state.panelSize||{})},displays,{...size,minWidth:320,minHeight:280}):anchor?captureBounds(anchor.getNormalBounds(),displays,size):fitBounds(null,displays,{...size,minWidth:320,minHeight:280});
  const window=new this.BrowserWindow({...bounds,parent,frame:key==='logs',show:false,skipTaskbar:true,alwaysOnTop:key==='logs'&&pinned||(state?.topmost??this.settings().floatingOnTop),autoHideMenuBar:true,title:'Bulk File Studio',webPreferences:{preload:path.join(__dirname,'tool-overlay-preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
  const entry={window,config,parent,pinned,state:{...state,bounds,collapsed:false}};this.windows.set(key,entry);
  try{
   this.secureWindow(window);this.remember(key,window);
   if(state?.opacity<100)window.setOpacity?.(state.opacity/100);
   window.pinController=new FloatingPin(window,()=>({floatingOnTop:this.desiredTopmost(entry)}),{
    onError:this.error,canRecover:()=>entry.pinned||this.desiredTopmost(entry)
   });
   const record=()=>{if(!entry.state.collapsed&&!window.isDestroyed()){const b=window.getNormalBounds();this.save(entry,{bounds:b,displayId:this.screen.getAllDisplays().find(d=>b.x>=d.workArea.x&&b.x<d.workArea.x+d.workArea.width&&b.y>=d.workArea.y&&b.y<d.workArea.y+d.workArea.height)?.id??null});}};
   for(const event of ['move','resize','moved','resized'])window.on(event,record);window.on('focus',()=>this.refresh(entry));window.on('blur',()=>this.onBlur?.());
   window.on('close',event=>{if(this.quitting)return;if(this.blocked?.(key)){event.preventDefault();return;}record();this.save(entry,{visible:false});});
   window.on('closed',()=>{if(this.windows.get(key)?.window===window)this.windows.delete(key);});
   window.on('ready-to-show',()=>{if(this.windows.get(key)!==entry||window.isDestroyed())return;this.save(entry,{visible:true});window.show();if(key!=='logs'&&state?.collapsed)this.control(entry,'collapse',true);});
   Promise.resolve(window.loadFile(path.join(__dirname,extras.has(key)?'floating-tool-panel.html':'tool-overlay.html'))).catch(error=>{this.error(error);if(!window.isDestroyed())window.destroy();});
  }catch(error){this.windows.delete(key);if(!window.isDestroyed())window.destroy();throw error;}
  return {opened:true,popup:true};
 }
 owner(event){const url=event?.senderFrame?.url;if(!['tool-overlay.html','floating-tool-panel.html'].some(file=>url===pathToFileURL(path.join(__dirname,file)).href))return null;return [...this.windows.values()].find(entry=>!entry.window.isDestroyed()&&entry.window.webContents===event.sender)||null;}
 switchTab(entry,kind){if(!['planning','snippets'].includes(entry.config.kind)||!['planning','snippets'].includes(kind))throw Error('此浮動工具沒有該分頁');return this.open(configuration({kind}));}
 desiredTopmost(entry){return (entry.config.kind==='logs'&&entry.pinned)||(this.layout(entry.config.kind)?.topmost??this.settings().floatingOnTop);}
 syncTopmost(options){for(const entry of this.windows.values())entry.window.pinController?.sync(options);}
 payload(entry){const {theme,fontSize}=this.settings(),{config,pinned}=entry;return {config,theme,fontSize,pinnedWindow:Boolean(pinned),topmost:this.desiredTopmost(entry),collapsed:Boolean(entry.state.collapsed),...(config.kind==='logs'?{logFilters:this.logFilters(config),logContext:logFilterKey(config)}:{})};}
 setPinned(entry,pinned){
  if(typeof pinned!=='boolean')throw Error('視窗釘選設定無效');
  const logs=entry.config.kind==='logs',parent=pinned||logs?undefined:this.parent()||undefined;
  if(entry.parent!==parent)entry.window.setParentWindow(parent||null);
  if(logs)this.saveLogsPinned?.(pinned);else this.save(entry,{pinned});
  entry.parent=parent;entry.pinned=pinned;
  if(pinned)entry.window.pinController?.reloadCrashedRenderer();
  entry.window.pinController?.sync({force:true,raise:false});this.refresh(entry);return pinned;
 }
 control(entry,action,value){
  if(action==='pin')return this.setPinned(entry,value);
  if(action==='topmost'){if(typeof value!=='boolean')throw Error('置頂狀態無效');this.save(entry,{topmost:value});entry.window.pinController.sync({force:true});}
  else if(action==='minimize')entry.window.minimize?.();
  else if(action==='close'){if(this.blocked?.(entry.config.kind))throw Error('請先完成目前編輯');this.save(entry,{visible:false});entry.window.close();}
  else if(action==='collapse'){if(typeof value!=='boolean')throw Error('收合狀態無效');if(entry.config.kind==='logs'||this.blocked?.(entry.config.kind))return this.payload(entry);const current=entry.window.getNormalBounds(),bounds=value?{...current,height:80}:entry.state.bounds||{...current,height:540};if(value&&!entry.state.collapsed)this.save(entry,{bounds:current});this.save(entry,{collapsed:value});entry.window.setMinimumSize?.(320,value?80:280);entry.window.setBounds(fitBounds(bounds,this.screen.getAllDisplays(),{width:420,height:value?80:540,minWidth:320,minHeight:value?80:280}));}
  else throw Error('面板操作無效');this.refresh(entry);return this.payload(entry);
 }
 recover(entry){if(entry.window.isDestroyed())return;const current=entry.window.getNormalBounds(),height=entry.state.collapsed?80:280;entry.window.setBounds(fitBounds(current,this.screen.getAllDisplays(),{width:420,height:540,minWidth:320,minHeight:height}));entry.window.pinController?.sync({force:true});}
 refresh(entry){if(!entry.window.isDestroyed())entry.window.webContents.send('tool-overlay-refresh',this.payload(entry));}
 invalidate(kind){for(const entry of this.windows.values())if(!kind||entry.config.kind===kind)this.refresh(entry);}
 updateSettings(previous){const settings=this.settings();for(const entry of this.windows.values()){if(entry.window.isDestroyed())continue;const next=this.layout(entry.config.kind);if(next){entry.state={...entry.state,...next};if(entry.pinned!==next.pinned)this.setPinned(entry,next.pinned);if(next.opacity!==(previous?.floatingToolLayout?.[entry.config.kind]?.opacity??100))entry.window.setOpacity?.(next.opacity/100);if(next.panelSize&&JSON.stringify(next.panelSize)!==JSON.stringify(previous?.floatingToolLayout?.[entry.config.kind]?.panelSize)){const desired={...entry.window.getNormalBounds(),...next.panelSize};this.save(entry,{bounds:desired});entry.window.setBounds(fitBounds({...desired,...(entry.state.collapsed?{height:80}:{})},this.screen.getAllDisplays(),{...next.panelSize,minWidth:320,minHeight:entry.state.collapsed?80:280}));}if((next.placement==='main'||next.placement==='quick'&&previous?.floatingToolLayout?.[entry.config.kind]?.placement==='pinned')&&entry.window.isVisible?.()&&!this.blocked?.(entry.config.kind)){entry.window.close();this.save(entry,{visible:false});}}entry.window.pinController?.sync();this.refresh(entry);}if(previous)for(const [kind,next]of Object.entries(settings.floatingToolLayout||{})){const old=previous.floatingToolLayout?.[kind];if(next.placement==='pinned'&&next.visible&&JSON.stringify(next)!==JSON.stringify(old))this.open({kind});}}
 restore(){if(this.restored)return;this.restored=true;if(this.settings().floatingRestorePanels)for(const [kind,value]of Object.entries(this.settings().floatingToolLayout||{}))if(value.visible&&value.placement!=='main')this.open({kind});}
 closeForParent(parent){for(const entry of this.windows.values())if(entry.parent===parent&&!entry.pinned&&!entry.window.isDestroyed()){this.save(entry,{visible:false});entry.window.destroy();}}
 closeLogs(){
  const entry=this.windows.get('logs');
  if(entry&&!entry.window.isDestroyed())entry.window.destroy();
 }
 close(){this.quitting=true;for(const entry of this.windows.values())if(!entry.window.isDestroyed())entry.window.destroy();}
}
module.exports={ToolOverlay};
