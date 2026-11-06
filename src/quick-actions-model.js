'use strict';
(() => {
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,LIMIT=12;
 const TYPES=Object.freeze({'new-record':'新增指定表格紀錄','import-paths':'匯入路徑並套用標籤','open-sheet':'開啟指定表格','open-page':'開啟指定頁面','open-tool':'開啟工具箱功能','open-share':'開啟共享管理','share-check':'檢查共享更新','share-publish':'發佈共享快照（須確認）','open-tag-menu':'開啟標籤收藏清單（外部選單）','copy-tag-paths':'複製標籤收藏路徑','open-search':'開啟浮動全域搜尋','open-drafts':'開啟草稿筆記','open-reminders':'管理提醒排程','view-logs':'查看紀錄','open-planning':'日曆／看板','open-worksets':'情境工作集','paste-snippet':'立即貼上指定文字片段','open-snippets':'常用文字片段'});
 const MENU_ITEMS=Object.freeze({main:'在主視窗顯示此分類',copy:'複製此篩選結果全部路徑',batchOpen:'批次開啟檔案／資料夾',batchLocations:'批次開啟所在資料夾'});
 const PAGES=Object.freeze({home:'首頁',notes:'資料工作區',favorites:'我的收藏',search:'全域搜尋',rename:'檔案工具',settings:'設定',productivity:'工具箱',planning:'日曆／看板',logs:'查看紀錄',info:'資訊與更新紀錄'});
 const TOOLS=Object.freeze({repair:'批次修復路徑',backup:'備份／還原',rules:'檔案整理規則',preview:'文件預覽',worksets:'情境工作集',snippets:'常用文字片段'});
 const TYPE_GROUPS=[
  ['工作區與共享',['new-record','open-sheet','open-share','share-check','share-publish','open-reminders','view-logs','open-planning']],
  ['收藏與搜尋',['import-paths','open-tag-menu','copy-tag-paths','open-search']],
  ['頁面與工具',['open-page','open-tool','paste-snippet','open-worksets','open-snippets','open-drafts']]
 ];
 function displayOptions(type){
  if(type==='view-logs')return [['overlay','浮動視窗'],['main','主視窗']];
  if(type==='open-worksets')return [['menu','外部選單'],['main','主視窗']];
  if(['open-planning','open-snippets'].includes(type))return [
   ['overlay','浮動工具內'],['menu','外部選單'],['main','主視窗']
  ];
  return [];
 }
 function entry(input){
  if(!input||typeof input!=='object'||!ID.test(input.id)||!Object.hasOwn(TYPES,input.type)||typeof input.label!=='string'||!input.label.trim()||input.label.trim().length>30||/[\x00-\x1f\x7f]/.test(input.label))throw new Error('快捷動作名稱或類型無效');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean'||input.useClipboard!==undefined&&typeof input.useClipboard!=='boolean')throw new Error('快捷動作開關無效');
  const result={id:input.id,type:input.type,label:input.label.trim(),enabled:input.enabled!==false};
  if(input.type==='open-tag-menu'&&input.menuItems!==undefined){if(!input.menuItems||typeof input.menuItems!=='object'||Array.isArray(input.menuItems)||Object.entries(input.menuItems).some(([key,value])=>!Object.hasOwn(MENU_ITEMS,key)||typeof value!=='boolean'))throw new Error('外部選單項目設定無效');result.menuItems=Object.fromEntries(Object.keys(MENU_ITEMS).map(key=>[key,input.menuItems[key]!==false]));}
  if(input.shortcut){const shortcuts=typeof module!=='undefined'&&module.exports?require('./global-shortcuts'):globalThis.globalShortcutModel;const key=shortcuts.normalize(input.shortcut);if(!key)throw new Error('快捷鍵格式無效');result.shortcut=key;}
  if(input.icon!==undefined){if(!['＋','↥','▤','▦','⌕','▣','☷','✎','⌚','★','⚙','↗','⧉','☰'].includes(input.icon))throw new Error('請選擇內建圖示');result.icon=input.icon;}
  if(input.buttonDisplay!==undefined){if(!['text','icon','both'].includes(input.buttonDisplay))throw new Error('按鈕顯示方式無效');result.buttonDisplay=input.buttonDisplay;}
  if(input.type==='paste-snippet'){if(!ID.test(input.snippetId))throw new Error('請選擇文字片段');result.snippetId=input.snippetId;}else if(input.type==='import-paths'){
   if(!Array.isArray(input.tags)||input.tags.length>20||input.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.trim().length>32||/[\x00-\x1f\x7f]/.test(tag)))throw new Error('快捷標籤無效，每個最多 32 字元、每項最多 20 個');
   const tags=new Map();for(const tag of input.tags)tags.set(tag.trim().toLocaleLowerCase(),tag.trim());result.tags=[...tags.values()];result.useClipboard=input.useClipboard===true;
  }else if(['open-tag-menu','copy-tag-paths','open-search'].includes(input.type)){if(input.query!==undefined&&(typeof input.query!=='string'||input.query.length>256))throw new Error('快捷搜尋最多 256 字元');result.query=input.query||'';if(input.type!=='open-search'){const tag=input.tag??null;if(tag!==null&&(typeof tag!=='string'||tag.length>64||/[\x00-\x1f\x7f]/.test(tag)))throw new Error('快捷標籤無效');result.tag=tag;if(input.tagKeys!==undefined){if(!Array.isArray(input.tagKeys)||!input.tagKeys.length||input.tagKeys.length>100||input.tagKeys.some(key=>typeof key!=='string'||key.length>64||/[\x00-\x1f\x7f]/.test(key)))throw new Error('請勾選 1–100 個標籤');result.tagKeys=[...new Set(input.tagKeys.map(key=>key.toLocaleLowerCase()))];}}}else if(displayOptions(input.type).length){
   const mode=input.display??'overlay';
   if(!displayOptions(input.type).some(([value])=>value===mode))throw new Error('請選擇此浮動快捷動作支援的開啟方式');
   result.display=mode;
   if(input.type==='view-logs'){
    if(!ID.test(input.sheetId))throw new Error('請選擇紀錄表格');
    if(input.scope!==undefined&&!['all','master'].includes(input.scope))throw new Error('紀錄範圍無效');
    if(input.query!==undefined&&(typeof input.query!=='string'||input.query.length>256))throw new Error('快捷搜尋最多 256 字元');
    result.sheetId=input.sheetId;result.scope=input.scope||'all';result.query=input.query||'';
   }
  }else if(input.type==='open-page'){if(!Object.hasOwn(PAGES,input.page))throw new Error('請選擇有效頁面');result.page=input.page;}else if(input.type==='open-tool'){if(!Object.hasOwn(TOOLS,input.tool))throw new Error('請選擇有效工具箱功能');result.tool=input.tool;}else if(['share-check','share-publish','open-share','open-reminders','open-drafts'].includes(input.type)){}else{
   if(!ID.test(input.sheetId))throw new Error('請選擇快捷動作的表格');result.sheetId=input.sheetId;
   if(input.type==='new-record'&&input.form!==undefined)result.form=form(input.form);if(input.type==='new-record'&&input.tags!==undefined){if(!Array.isArray(input.tags)||input.tags.length>20||input.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>32))throw new Error('預設標籤無效');result.tags=[...new Set(input.tags.map(tag=>tag.trim()))];}if(input.type==='new-record'&&input.masterId){if(!ID.test(input.masterId))throw new Error('預設主紀錄無效');result.masterId=input.masterId;}
  }
  return result;
 }
 function form(input){if(!input||typeof input!=='object')throw new Error('表單設定無效');const out={columns:input.columns===1?1:2,width:Math.round(Math.max(360,Math.min(1000,Number(input.width)||480))),height:Math.round(Math.max(320,Math.min(1200,Number(input.height)||650))),hiddenFields:[],fieldOrder:[],defaults:{}};for(const key of ['hiddenFields','fieldOrder']){if(input[key]!==undefined&&(!Array.isArray(input[key])||input[key].length>50||input[key].some(id=>!ID.test(id))))throw new Error('表單欄位設定無效');out[key]=[...new Set(input[key]||[])];}if(input.defaults!==undefined){if(!input.defaults||typeof input.defaults!=='object'||Array.isArray(input.defaults)||Object.keys(input.defaults).length>50)throw new Error('欄位預設值無效');for(const [id,value] of Object.entries(input.defaults)){if(!ID.test(id)||!(typeof value==='string'&&value.length<=20000||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||Array.isArray(value)&&value.length<=100&&value.every(item=>typeof item==='string'&&item.length<=2000)))throw new Error('欄位預設值無效');out.defaults[id]=value;}}return out;}
 function normalize(input,strict=false){
  if(!Array.isArray(input)||input.length>LIMIT){if(strict)throw new Error('快捷動作最多 '+LIMIT+' 項');return [];}
  const actions=[],ids=new Set();for(const value of input)try{const action=entry(value);if(ids.has(action.id))throw new Error('快捷動作識別碼重複');ids.add(action.id);actions.push(action);}catch(error){if(strict)throw error;}
  return actions;
 }
 const api={ID,LIMIT,TYPES,MENU_ITEMS,PAGES,TOOLS,TYPE_GROUPS,normalize,form,displayOptions};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.quickActionsModel=Object.freeze(api);
})();
