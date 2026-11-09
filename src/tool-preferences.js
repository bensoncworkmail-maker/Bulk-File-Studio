'use strict';
(() => {
 const DEFAULTS=Object.freeze({snippetsShortcut:'',calendarShortcut:'',draftReminders:true,draftLocalShortcuts:true,draftBodyLimit:100000,draftListWidth:170,draftBodyHeight:280,draftPreviewMode:'inline',draftAfterTransfer:'ask',draftImageHeight:96,focusMode:false,focusShortcutIds:[],floatingSearchCloseOnVisit:true,workspacePreviewMode:'inline',toolSplitWidths:{rules:250,worksets:250,snippets:250},calendarShowCount:true,calendarWeekStart:0,calendarDayHeight:88,calendarEventLimit:2,calendarFontSize:13,calendarShowAgenda:true,backupIntervalHours:0});
 const ranges={draftImageHeight:[48,360],draftBodyLimit:[0,10000000],draftListWidth:[110,600],draftBodyHeight:[140,2000],calendarDayHeight:[56,240],calendarEventLimit:[0,10],calendarFontSize:[11,22]};
 function value(key,input){
  if(key==='focusShortcutIds'){
   const builtins=(typeof module!=='undefined'&&module.exports?require('./global-shortcuts'):window.globalShortcutModel).KEYS;
   const idPattern=/^(?:action|snippet):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   return Array.isArray(input)?[...new Set(input.filter(id=>typeof id==='string'&&
    (builtins.includes(id)||idPattern.test(id))))].slice(0,600):[];
  }
  if(key==='toolSplitWidths')return Object.fromEntries(['rules','worksets','snippets'].map(kind=>[kind,Number.isFinite(input?.[kind])?Math.round(Math.max(160,Math.min(600,input[kind]))):250]));
  if(ranges[key])return Number.isSafeInteger(input)&&input>=ranges[key][0]&&input<=ranges[key][1]?input:DEFAULTS[key];
  if(['draftPreviewMode','workspacePreviewMode'].includes(key))return ['inline','window','system'].includes(input)?input:DEFAULTS[key];
  if(key==='draftAfterTransfer')return ['ask','keep','delete'].includes(input)?input:DEFAULTS[key];
  if(key==='calendarWeekStart')return [0,1].includes(input)?input:0;
  if(key==='backupIntervalHours')return [0,1,6,12,24,168].includes(input)?input:0;
  return typeof input==='boolean'?input:DEFAULTS[key];
 }
 const api={DEFAULTS,value};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.toolPreferences=Object.freeze(api);
})();
