'use strict';
(() => {
  const KEY='brs-settings-v1';
  const DEFAULTS=Object.freeze({theme:'dark',fontSize:'13',density:'compact',pageSize:100,
    rulesWidth:'420',showSource:false,showRules:true,showPaths:false,recursiveDefault:false,startPage:'rename',
    rememberRules:true,resetRulesAfterRename:true,defaultSortBy:'path',defaultSortDirection:'asc'});
  function normalize(input={}) {
    if(!input||typeof input!=='object')input={};
    const out={...DEFAULTS};
    const choices={theme:['light','dark'],fontSize:['12','13','15','17','19'],density:['compact','comfortable'],
      rulesWidth:['360','420','500'],pageSize:[100,250,500],startPage:['rename','favorites'],defaultSortBy:['path','name','modified'],defaultSortDirection:['asc','desc']};
    for(const [key,value] of Object.entries(DEFAULTS)) {
      if(typeof value==='boolean'){if(typeof input[key]==='boolean')out[key]=input[key];}
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
    root.dataset.rulesWidth=settings.rulesWidth;
    root.dataset.theme=settings.theme;root.dataset.fontSize=settings.fontSize;root.dataset.density=settings.density;
    root.dataset.sourceOpen=String(settings.showSource);root.dataset.rulesOpen=String(settings.showRules);root.dataset.showPaths=String(settings.showPaths);
  }
  const exports={KEY,DEFAULTS,normalize,load,applyRoot};
  if(typeof module!=='undefined'&&module.exports)module.exports=exports;
  else globalThis.studioSettingsModel=Object.freeze(exports);
})();
