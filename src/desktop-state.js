'use strict';
const fs=require('node:fs');
const path=require('node:path');
const shortcuts=require('./global-shortcuts');
const DEFAULTS=Object.freeze({rememberWindow:true,floatingOpacity:100,floatingOpaqueOnFocus:true,floatingCollapsed:false,floatingListActions:'menu',floatingShowPaths:false,floatingPager:'auto',closeToTray:false,startHidden:false,mainShortcut:'CommandOrControl+Alt+S',floatingIconSize:'small',floatingCompact:false,floatingShowSearch:true,floatingShowTools:true,floatingShowTags:true,floatingShowStatus:false,floatingView:'list',floatingOnTop:true,floatingStartup:false,floatingShortcut:'CommandOrControl+Alt+B',explorerTagPrompt:true,theme:'dark',fontSize:'13',tagSort:'name',tagDirection:'asc'});
const choices={floatingListActions:['normal','compact','menu','hidden'],floatingPager:['auto','always','hidden'],mainShortcut:['','CommandOrControl+Alt+S','CommandOrControl+Alt+M'],floatingIconSize:['small','medium','large'],floatingView:['list','icons'],floatingShortcut:['','CommandOrControl+Alt+B','CommandOrControl+Alt+F'],theme:['light','dark'],fontSize:['12','13','15','17','19'],tagSort:['name','count','recent'],tagDirection:['asc','desc']};
function normalize(input={}){const result={...DEFAULTS};if(!input||typeof input!=='object')return result;for(const key of Object.keys(DEFAULTS)){if(key==='floatingOpacity'){if(typeof input[key]==='number'&&Number.isFinite(input[key]))result[key]=Math.round(Math.max(40,Math.min(100,input[key])));}
else if(key==='mainShortcut'||key==='floatingShortcut'){const value=shortcuts.normalize(input[key]);if(value!==null)result[key]=value;}else if(typeof DEFAULTS[key]==='boolean'){if(typeof input[key]==='boolean')result[key]=input[key];}else if(choices[key].includes(input[key]))result[key]=input[key];}return result;}
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
class DesktopState {
 constructor(filename){this.filename=filename;this.data={version:1,settings:{...DEFAULTS},windows:{}};try{const data=JSON.parse(fs.readFileSync(filename,'utf8'));if(data.version===1){this.data.settings=normalize(data.settings);for(const key of ['main','floating'])if(validBounds(data.windows?.[key]?.bounds))this.data.windows[key]={bounds:data.windows[key].bounds,maximized:data.windows[key].maximized===true};}}catch(e){if(e.code!=='ENOENT')this.readError=e;}}
 get settings(){return {...this.data.settings};}
 write(){fs.mkdirSync(path.dirname(this.filename),{recursive:true});if(this.readError&&fs.existsSync(this.filename)){fs.copyFileSync(this.filename,this.filename+'.invalid-backup');this.readError=null;}const temp=this.filename+'.new';fs.writeFileSync(temp,JSON.stringify(this.data,null,2),{mode:0o600});fs.renameSync(temp,this.filename);}
 update(patch){const next=normalize({...this.data.settings,...patch});if(JSON.stringify(next)!==JSON.stringify(this.data.settings)){const previous=this.data.settings;this.data.settings=next;try{this.write();}catch(e){this.data.settings=previous;throw e;}}return this.settings;}
 record(key,window){if(!this.settings.rememberWindow||window.isDestroyed()||window.isMinimized())return;const bounds=window.getNormalBounds();if(validBounds(bounds)){this.data.windows[key]={bounds,maximized:window.isMaximized()};this.write();}}
 bounds(key,displays,defaults){return fitBounds(this.settings.rememberWindow?this.data.windows[key]?.bounds:null,displays,defaults);}
 attach(key,window,onError=()=>{}){let timer;const save=()=>{clearTimeout(timer);try{this.record(key,window);}catch(e){onError(e);}};for(const event of ['resize','move','maximize','unmaximize'])window.on(event,()=>{clearTimeout(timer);timer=setTimeout(save,300);});window.on('close',save);window.on('closed',()=>clearTimeout(timer));}
}
module.exports={DesktopState,DEFAULTS,normalize,fitBounds,validBounds};
