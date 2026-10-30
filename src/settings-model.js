'use strict';
(() => {
  const KEY='brs-settings-v1';
  const DEFAULTS=Object.freeze({theme:'dark',fontSize:'13',density:'compact',pageSize:100,
    notesCardHeight:0,notesCardShowType:true,notesCardShowRelations:true,notesCardShowEmptyLinks:false,notesPanelView:'list',notesCardFields:{},notesCardShowContext:true,notesCardShowParent:true,notesCardShowNotes:true,notesCardShowTags:true,notesCardShowDate:true,notesCardShowLinks:true,notesSearchScope:'sheet',notesSearchMatch:'all',notesSearchCase:false,notesSearchFields:true,notesSearchNotes:true,notesSearchTags:true,notesSearchPaths:true,notesSearchParent:true,notesView:'list',notesCompact:true,notesCardSize:'medium',notesPanelWidth:220,notesDetailWidth:400,notesPageSize:100,notesRowHeight:36,notesOpenAfterSave:false,notesOpenMode:'single',notesShowQuickBar:true,notesShowContextHelp:true,notesShowCounts:true,notesCascadeDetails:false,notesLinkMode:'paths',sourcePanelWidth:220,settingsTab:'appearance',favoriteIconSize:'medium',tagPanelWidth:220,tagSort:'name',tagDirection:'asc',favoriteView:'list',favoriteSort:'recent',favoriteDirection:'desc',favoriteOpenMode:'double',showFileIcons:true,showTips:true,favoriteColumns:['name','location','tags','status'],rulesWidth:'420',showSource:false,showRules:true,showPaths:false,recursiveDefault:false,startPage:'rename',
    rememberRules:true,resetRulesAfterRename:true,defaultSortBy:'path',defaultSortDirection:'asc'});
  function normalize(input={}) {
    if(!input||typeof input!=='object')input={};
    const out={...DEFAULTS};
    const choices={notesPanelView:['list','cards'],notesSearchScope:['sheet','master','area','all','masters'],notesSearchMatch:['all','any'],notesView:['list','cards','grid'],notesCardSize:['small','medium','large'],notesPageSize:[25,50,100,250],notesOpenMode:['single','double'],notesLinkMode:['paths','tags'],settingsTab:['appearance','workspace','notes','favorites','floating','system','data'],favoriteIconSize:['small','medium','large'],theme:['light','dark'],fontSize:['12','13','15','17','19'],density:['compact','comfortable'],
      tagSort:['name','count','recent'],tagDirection:['asc','desc'],favoriteView:['list','icons'],favoriteSort:['recent','name','path','type','size','modified'],favoriteDirection:['asc','desc'],favoriteOpenMode:['double','single'],pageSize:[100,250,500],startPage:['rename','favorites','notes'],defaultSortBy:['path','name','modified'],defaultSortDirection:['asc','desc']};
    for(const [key,value] of Object.entries(DEFAULTS)) {
      if(key==='notesCardFields'){out[key]={};if(input[key]&&typeof input[key]==='object'&&!Array.isArray(input[key]))for(const [id,fields] of Object.entries(input[key]).slice(0,100))if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)&&Array.isArray(fields)&&fields.length<=50)out[key][id]=[...new Set(fields.filter(field=>typeof field==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(field)))];}
      else if(key==='notesCardHeight'){if(typeof input[key]==='number'&&Number.isFinite(input[key]))out[key]=input[key]===0?0:Math.round(Math.max(120,Math.min(600,input[key])));}
      else if(['notesPanelWidth','notesDetailWidth','notesRowHeight'].includes(key)){const bounds={notesPanelWidth:[160,480],notesDetailWidth:[280,680],notesRowHeight:[28,64]}[key];if(typeof input[key]==='number'&&Number.isFinite(input[key]))out[key]=Math.round(Math.max(bounds[0],Math.min(bounds[1],input[key])));}
      else if(key==='sourcePanelWidth'){if(typeof input[key]==='number'&&Number.isFinite(input[key]))out[key]=Math.round(Math.max(160,Math.min(480,input[key])));}
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
    root.style.setProperty('--notes-card-height',settings.notesCardHeight?settings.notesCardHeight+'px':'auto');root.dataset.notesCardFixed=String(settings.notesCardHeight>0);root.dataset.notesPanelView=settings.notesPanelView;root.dataset.notesCompact=String(settings.notesCompact);root.dataset.notesCardSize=settings.notesCardSize;
    root.style.setProperty('--notes-panel-width',settings.notesPanelWidth+'px');root.style.setProperty('--notes-detail-width',settings.notesDetailWidth+'px');root.style.setProperty('--notes-row-height',settings.notesRowHeight+'px');
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
