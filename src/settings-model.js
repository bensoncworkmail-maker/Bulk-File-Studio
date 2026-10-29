'use strict';
(() => {
  const KEY='brs-settings-v1';
  const DEFAULTS=Object.freeze({theme:'dark',fontSize:'13',density:'compact',pageSize:100,
    sourcePanelWidth:220,settingsTab:'appearance',favoriteIconSize:'medium',tagPanelWidth:220,tagSort:'name',tagDirection:'asc',favoriteView:'list',favoriteSort:'recent',favoriteDirection:'desc',favoriteOpenMode:'double',showFileIcons:true,showTips:true,favoriteColumns:['name','location','tags','status'],rulesWidth:'420',showSource:false,showRules:true,showPaths:false,recursiveDefault:false,startPage:'rename',
    rememberRules:true,resetRulesAfterRename:true,defaultSortBy:'path',defaultSortDirection:'asc'});
  function normalize(input={}) {
    if(!input||typeof input!=='object')input={};
    const out={...DEFAULTS};
    const choices={settingsTab:['appearance','workspace','favorites','floating','system','data'],favoriteIconSize:['small','medium','large'],theme:['light','dark'],fontSize:['12','13','15','17','19'],density:['compact','comfortable'],
      tagSort:['name','count','recent'],tagDirection:['asc','desc'],favoriteView:['list','icons'],favoriteSort:['recent','name','path','type','size','modified'],favoriteDirection:['asc','desc'],favoriteOpenMode:['double','single'],pageSize:[100,250,500],startPage:['rename','favorites'],defaultSortBy:['path','name','modified'],defaultSortDirection:['asc','desc']};
    for(const [key,value] of Object.entries(DEFAULTS)) {
      if(key==='sourcePanelWidth'){if(typeof input[key]==='number'&&Number.isFinite(input[key]))out[key]=Math.round(Math.max(160,Math.min(480,input[key])));}
      else if(key==='rulesWidth'){const width=typeof input[key]==='number'?input[key]:typeof input[key]==='string'&&/^\d+$/.test(input[key])?Number(input[key]):NaN;if(Number.isFinite(width))out[key]=String(Math.round(Math.max(280,Math.min(720,width))));}
      else if(key==='tagPanelWidth'){if(typeof input[key]==='number'&&Number.isFinite(input[key]))out[key]=Math.round(Math.max(140,Math.min(480,input[key])));}
      else if(key==='favoriteColumns'){out[key]=globalThis.favoritesModel?globalThis.favoritesModel.columns(input[key]):require('./favorites-model').columns(input[key]);}
      else if(typeof value==='boolean'){if(typeof input[key]==='boolean')out[key]=input[key];}
      else if(choices[key].includes(input[key]))out[key]=input[key];
    }
    return out;
  }
  function load(storage) {
    try {
      const text=storage.getItem(KEY);
      if(text!==null)return normalize(JSON.parse(text));
      return normalize({theme:storage.getItem('brs-theme'),fontSize:storage.getItem('brs-font-size')});
    } catch {return {...DEFAULTS};}
  }
  function applyRoot(root,settings) {
    root.style.setProperty('--source-panel-width',settings.sourcePanelWidth+'px');
    root.dataset.favoriteIconSize=settings.favoriteIconSize;
    root.style.setProperty('--rules-width',settings.rulesWidth+'px');
    root.style.setProperty('--tag-panel-width',settings.tagPanelWidth+'px');
    root.dataset.showTips=String(settings.showTips);
    root.dataset.rulesWidth=settings.rulesWidth;
    root.dataset.theme=settings.theme;root.dataset.fontSize=settings.fontSize;root.dataset.density=settings.density;
    root.dataset.sourceOpen=String(settings.showSource);root.dataset.rulesOpen=String(settings.showRules);root.dataset.showPaths=String(settings.showPaths);
  }
  const exports={KEY,DEFAULTS,normalize,load,applyRoot};
  if(typeof module!=='undefined'&&module.exports)module.exports=exports;
  else globalThis.studioSettingsModel=Object.freeze(exports);
})();
