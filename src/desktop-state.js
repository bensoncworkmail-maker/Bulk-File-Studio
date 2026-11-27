'use strict';
const fs=require('node:fs');
const path=require('node:path');
const shortcuts=require('./global-shortcuts');
const quickActions=require('./quick-actions-model');
const DEFAULTS=Object.freeze({desktopStickers:require('./desktop-sticker-model').settings(),floatingToolLayout:require('./floating-tool-layout').normalize(),floatingRestorePanels:false,floatingLogsPinned:false,favoriteShortcuts:null,...require('./tool-preferences').DEFAULTS,toolWindowSizes:{},snippetPicker:require('./snippet-picker-model').normalize(),logView:require('./log-view-settings-model').normalize(),calendarScope:require('./calendar-scope').normalize(),...require('./diagnostic-log').DEFAULTS,globalSearchCriteria:require('./search-criteria').normalize(),floatingSearchDatePresets:require('./search-date-presets').normalize(),floatingSearchFiltersExpanded:false,floatingSearchRememberConditions:true,floatingSearchLastState:null,floatingSearchTablePresets:require('./floating-search-state').tablePresets(),searchShortcut:'',focusShortcut:'CommandOrControl+Alt+Shift+F',draftShortcut:'CommandOrControl+Alt+D',draftRememberWindow:true,draftWindowWidth:700,draftWindowHeight:720,floatingCollapsedItems:['pin','close'],floatingGlobalSearch:true,floatingSearchWidth:640,floatingSearchHeight:560,remindersEnabled:true,reminderDelivery:'notification',reminderBringToFront:false,reminderSnoozeMinutes:10,reminderAttentionSound:true,reminderAttentionRepeatMinutes:5,renameVerification:'fast',floatingCaptureKeepValues:true,floatingQuickMode:'popup',floatingKeepAfterQuick:true,floatingDropMode:'favorites',floatingDropActionId:'',floatingDropTag:'',floatingShowQuickActions:true,floatingShowNewMaster:true,floatingQuickActions:Object.freeze([]),floatingHeaderAction:'none',rememberWindow:true,favoriteOpenMode:'double',floatingKeepPinnedOnTray:true,collapseShortcut:'',floatingOpacity:100,floatingOpaqueOnFocus:true,floatingCollapsedWidth:560,trayAlwaysVisible:true,closeToTray:false,startHidden:false,mainShortcut:'CommandOrControl+Alt+S',floatingTitle:'浮動工具',floatingOnTop:true,floatingStartup:false,floatingShortcut:'CommandOrControl+Alt+B',explorerTagPrompt:true,theme:'dark',fontSize:'13',tagSort:'name',tagDirection:'asc'});
const choices={reminderDelivery:['notification','overlay','both','attention'],reminderAttentionRepeatMinutes:[0,1,5,10,15],reminderSnoozeMinutes:[5,10,15,30,60],renameVerification:['fast','full'],floatingQuickMode:['popup','main'],floatingDropMode:['favorites','import','records','ask'],floatingHeaderAction:['none','pin','main'],favoriteOpenMode:['double','single'],mainShortcut:['','CommandOrControl+Alt+S','CommandOrControl+Alt+M'],floatingShortcut:['','CommandOrControl+Alt+B','CommandOrControl+Alt+F'],theme:['light','dark','graphite'],fontSize:['12','13','15','17','19'],tagSort:['name','count','recent'],tagDirection:['asc','desc']};
function normalizeFloatingTitle(value){if(typeof value!=='string'||value.trim().length>40||/[\x00-\x1f\x7f]/.test(value))return null;return value.trim();}
function normalize(input={}){const result={...DEFAULTS};if(!input||typeof input!=='object')return result;for(const key of Object.keys(result)){if(key==='desktopStickers')result[key]=require('./desktop-sticker-model').settings(input[key]);else if(key==='favoriteShortcuts')result[key]=input[key]&&typeof input[key]==='object'?require('./shortcuts').normalize(input[key]):null;else if(key==='toolWindowSizes'){
 const sizes={};
 for(const name of ['logs','planning','snippets','capture','reminder','pdf']){
  const value=input[key]?.[name];
  if(Number.isFinite(value?.width)&&Number.isFinite(value?.height)){
   sizes[name]={width:Math.round(Math.max(340,Math.min(4000,value.width))),height:Math.round(Math.max(280,Math.min(3000,value.height)))};
  }
 }
 result[key]=sizes;
}else if(key==='floatingToolLayout')result[key]=require('./floating-tool-layout').normalize(input[key],false,input.floatingOnTop!==false);else if(key==='snippetPicker')result[key]=require('./snippet-picker-model').normalize(input[key]);else if(key==='calendarScope')result[key]=require('./calendar-scope').normalize(input[key]);else if(key==='logView')result[key]=require('./log-view-settings-model').normalize(input[key]);else if(key==='floatingSearchLastState')result[key]=require('./floating-search-state').normalize(input[key]);else if(key==='floatingSearchTablePresets')result[key]=require('./floating-search-state').tablePresets(input[key]);else if(key==='floatingCollapsedItems'){
 const items=Array.isArray(input[key])?input[key]:DEFAULTS.floatingCollapsedItems;result[key]=[...new Set(items.filter(value=>['pin','close','main','caption','focus'].includes(value)))];
}else if(key==='floatingHeaderAction'){result[key]=input.floatingHeaderDoubleClick===false?'none':choices[key].includes(input[key])?input[key]:'none';}
else if(key==='floatingDropTag'){const value=input[key];if(typeof value==='string'&&value.length<=64&&!/[\x00-\x1f\x7f]/.test(value))result[key]=value.toLocaleLowerCase();}
else if(key==='floatingSearchDatePresets')result[key]=require('./search-date-presets').normalize(input[key]);else if(key==='globalSearchCriteria')result[key]=require('./search-criteria').normalize(input[key]);else if(key==='diagnosticsRetentionDays'){if([3,7,14,30].includes(input[key]))result[key]=input[key];}else if(key==='floatingTitle'){const value=normalizeFloatingTitle(input[key]);if(value!==null)result[key]=value;}else if(key==='floatingDropActionId'){if(input[key]===''||typeof input[key]==='string'&&quickActions.ID.test(input[key]))result[key]=input[key];}else if(key==='floatingQuickActions'){result[key]=quickActions.normalize(input[key]||[]);}
else if(['draftWindowWidth','draftWindowHeight'].includes(key)){if(Number.isFinite(input[key]))result[key]=Math.round(Math.max(460,Math.min(3000,input[key])));}
else if(key==='floatingCollapsedWidth'){if(typeof input[key]==='number'&&Number.isFinite(input[key]))result[key]=Math.round(Math.max(220,Math.min(800,input[key]===92?DEFAULTS.floatingCollapsedWidth:input[key])));}
else if(['floatingSearchWidth','floatingSearchHeight'].includes(key)){if(typeof input[key]==='number'&&Number.isFinite(input[key]))result[key]=Math.round(Math.max(key==='floatingSearchWidth'?360:320,Math.min(1200,input[key])));}
else if(key==='floatingOpacity'){if(typeof input[key]==='number'&&Number.isFinite(input[key]))result[key]=Math.round(Math.max(40,Math.min(100,input[key])));}
else if(Object.hasOwn(require('./tool-preferences').DEFAULTS,key)&&!shortcuts.KEYS.includes(key))result[key]=require('./tool-preferences').value(key,input[key]);else if(shortcuts.KEYS.includes(key)){const value=shortcuts.normalize(input[key]);if(value!==null)result[key]=value;}else if(typeof result[key]==='boolean'){if(typeof input[key]==='boolean')result[key]=input[key];}else if(choices[key].includes(input[key]))result[key]=input[key];}return result;}
function validBounds(bounds){return bounds&&['x','y','width','height'].every(key=>Number.isFinite(bounds[key]))&&bounds.width>0&&bounds.height>0;}
function fitBounds(saved,displays,defaults){
 const areas=displays.map(d=>d.workArea).filter(validBounds);if(!areas.length)return {...defaults};
 const requested=validBounds(saved)?saved:null;
 const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
 const area=requested?areas.reduce((best,a)=>overlap(requested,a)>overlap(requested,best)?a:best,areas[0]):areas[0];
 const visible=requested&&overlap(requested,area)>0;
 const width=Math.round(Math.min(area.width,Math.max(defaults.minWidth,requested?.width||defaults.width))),height=Math.round(Math.min(area.height,Math.max(defaults.minHeight,requested?.height||defaults.height)));
 return {width,height,minWidth:Math.min(defaults.minWidth,area.width),minHeight:Math.min(defaults.minHeight,area.height),x:Math.round(visible?Math.max(area.x,Math.min(requested.x,area.x+area.width-width)):area.x+(area.width-width)/2),y:Math.round(visible?Math.max(area.y,Math.min(requested.y,area.y+area.height-height)):area.y+(area.height-height)/2)};
}
const logMemory=require('./log-view-settings-model');
const stickerLayout=require('./desktop-sticker-model').desktopLayout;
class DesktopState {
 constructor(filename){this.filename=filename;this.data={version:1,settings:normalize(),windows:{},logFilters:{},snippetPickerGroups:[],stickerLayout:stickerLayout()};try{const data=JSON.parse(fs.readFileSync(filename,'utf8'));if(data.version===1){this.data.settings=normalize(data.settings);this.data.stickerLayout=stickerLayout(data.stickerLayout);this.data.snippetPickerGroups=require('./snippet-picker-model').history(data.snippetPickerGroups);this.data.logFilters=logMemory.normalizeHistory(data.logFilters);for(const key of ['main','floating','draft'])if(validBounds(data.windows?.[key]?.bounds))this.data.windows[key]={bounds:data.windows[key].bounds,maximized:data.windows[key].maximized===true,...(key==='floating'&&validBounds(data.windows[key].launcherBounds)?{launcherBounds:data.windows[key].launcherBounds}:{})};}}catch(e){if(e.code!=='ENOENT')this.readError=e;}}
 get settings(){return {...this.data.settings};}
 write(){fs.mkdirSync(path.dirname(this.filename),{recursive:true});if(this.readError&&fs.existsSync(this.filename)){fs.copyFileSync(this.filename,this.filename+'.invalid-backup');this.readError=null;}const temp=this.filename+'.new';fs.writeFileSync(temp,JSON.stringify(this.data,null,2),{mode:0o600});fs.renameSync(temp,this.filename);}
 update(patch){const next=normalize({...this.data.settings,...patch});if(JSON.stringify(next)!==JSON.stringify(this.data.settings)){const previous=this.data.settings;this.data.settings=next;try{this.write();}catch(e){this.data.settings=previous;throw e;}}return this.settings;}
 stickerLayout(){return this.data.stickerLayout;}
 saveStickerLayout(value){
  const next=stickerLayout(value),previous=this.data.stickerLayout;
  if(JSON.stringify(next)===JSON.stringify(previous))return;
  this.data.stickerLayout=next;
  try{this.write();}catch(error){this.data.stickerLayout=previous;throw error;}
 }
 logFilters(config){return this.data.logFilters[logMemory.logFilterKey(config)]||null;}
 saveLogFilters(config,filters){
  const key=logMemory.logFilterKey(config),previous=this.data.logFilters,next=logMemory.normalizeFilters(filters);
  if(JSON.stringify(previous[key])===JSON.stringify(next))return;
  const history={...previous};
  delete history[key];
  this.data.logFilters=logMemory.normalizeHistory({...history,[key]:next});
  try{this.write();}catch(error){this.data.logFilters=previous;throw error;}
 }
 snippetPickerGroups(){return this.data.snippetPickerGroups.map(pair=>[...pair]);}
 saveSnippetPickerGroups(changes,categories){
  const next=require('./snippet-picker-model').updateGroups(this.data.snippetPickerGroups,changes,categories);
  return this.replaceSnippetPickerGroups(next);
 }
 replaceSnippetPickerGroups(next){
  const previous=this.data.snippetPickerGroups;
  if(JSON.stringify(previous)===JSON.stringify(next))return {saved:true};
  this.data.snippetPickerGroups=next;
  try{this.write();}catch(error){this.data.snippetPickerGroups=previous;throw error;}
  return {saved:true};
 }
 remembers(key){return key==='draft'?this.settings.draftRememberWindow:this.settings.rememberWindow;}
 record(key,window){if(!this.remembers(key)||window.isDestroyed()||window.isMinimized())return;const bounds=window.getNormalBounds();if(validBounds(bounds)){const launcherBounds=key==='floating'?window.getLauncherBounds?.():null;this.data.windows[key]={bounds,maximized:window.isMaximized(),...(validBounds(launcherBounds)?{launcherBounds}:{})};this.write();}}
 bounds(key,displays,defaults){return fitBounds(this.remembers(key)?this.data.windows[key]?.bounds:null,displays,defaults);}
 attach(key,window,onError=()=>{}){let timer;const save=()=>{clearTimeout(timer);try{this.record(key,window);}catch(e){onError(e);}};for(const event of ['resize','move','maximize','unmaximize'])window.on(event,()=>{clearTimeout(timer);timer=setTimeout(save,300);});window.on('close',save);window.on('closed',()=>clearTimeout(timer));}
}
module.exports={normalizeFloatingTitle,DesktopState,DEFAULTS,normalize,fitBounds,validBounds};
