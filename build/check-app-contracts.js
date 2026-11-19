'use strict';
// Development-only consistency checks. No profile data is read and no application is launched.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),SRC=path.join(ROOT,'src');
function inspect(){
 const errors=[],files=fs.readdirSync(SRC).filter(name=>/\.(?:js|html|css)$/.test(name)).sort(),sources=new Map(files.map(name=>[name,fs.readFileSync(path.join(SRC,name),'utf8')]));
 const {documentFromHTML}=require('../tests/helpers/dom'),documents=new Map();
 const fail=(ok,message)=>{if(!ok)errors.push(message);};
 for(const [name,text] of sources){
  if(name.endsWith('.html')){
   const document=documentFromHTML(text);documents.set(name,document);const ids=[...text.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);fail(new Set(ids).size===ids.length,name+': duplicate DOM IDs');
   for(const match of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)){const reference=match[1];fail(!/^(?:https?:|\/\/)/.test(reference)&&fs.existsSync(path.resolve(SRC,reference)),name+': missing/nonlocal asset '+reference);}
  }
  if(name.endsWith('.js'))for(const match of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){
   const target=path.resolve(SRC,match[1]);fail([target,target+'.js',target+'.json',path.join(target,'index.js')].some(file=>fs.existsSync(file)),name+': missing local dependency '+match[1]);
  }
 }
 const document=documents.get('index.html'),nav=require('../src/app-navigation').PAGES,quick=require('../src/quick-actions-model'),directory=require('../src/function-directory'),catalog=require('../src/settings-catalog'),settings=require('../src/settings-model'),desktop=require('../src/desktop-state');
 fail(JSON.stringify(Object.keys(nav).sort())===JSON.stringify(Object.keys(quick.PAGES).sort()),'navigation and quick-action page registries diverge');
 for(const [name,page] of Object.entries(nav))for(const id of [page.tab,...page.sections])fail(Boolean(document.getElementById(id)),name+': missing page element '+id);
 for(const tool of Object.keys(quick.TOOLS))fail(Boolean(document.getElementById('productivity-'+tool)),'missing toolbox destination '+tool);
 const toolbox=require('../src/toolbox-model'),toolNav=document.getElementById('productivity-nav'),primaryButtons=toolNav.children.filter(el=>el.tagName==='BUTTON');
 fail(JSON.stringify(primaryButtons.map(el=>el.getAttribute('data-productivity')))===JSON.stringify(toolbox.primary.map(item=>item.id)),'toolbox primary navigation differs from its route model');
 fail(!document.getElementById('workflow-open'),'obsolete standalone workflow entry');
 for(const entry of toolbox.extra)fail(Boolean(document.getElementById('toolbox-advanced').querySelector('[data-productivity='+entry.id+']')),'advanced tool outside collapsed navigation '+entry.id);
 for(const [alias,id]of Object.entries(toolbox.workflowRoutes))fail(Boolean(toolbox.get(id)),'unknown workflow compatibility route '+alias);
 for(const id of ['inbox','automations','formulas','duplicates','compare','operations']){fail(!toolbox.get(id),'removed tool route '+id);fail(!document.getElementById('productivity-'+id),'removed tool panel '+id);}
 const groups=new Set(catalog.groups.map(group=>group.id));
 for(const item of directory.entries){
  fail(['page','tool','settings','tracking','draft','reminders','workflow'].filter(key=>Boolean(item[key])).length===1,'ambiguous directory destination '+item.title);
  if(item.workflow)fail(Object.hasOwn(toolbox.workflowRoutes,item.workflow),'unknown workflow destination '+item.workflow);if(item.page)fail(Object.hasOwn(nav,item.page),'unknown directory page '+item.page);if(item.tool)fail(Object.hasOwn(quick.TOOLS,item.tool),'unknown directory tool '+item.tool);if(item.settings)fail(groups.has(item.settings),'unknown settings destination '+item.settings);
 }
 for(const [store,bindings,defaults] of [['renderer',catalog.controls,settings.DEFAULTS],['native',catalog.nativeControls,desktop.DEFAULTS]]){
  for(const [key,id] of Object.entries(bindings)){const element=document.getElementById(id);fail(Object.hasOwn(defaults,key),store+': binding has no default '+key);fail(Boolean(element),store+': missing control '+id);let panel=element;while(panel&&!panel.id.startsWith('settings-panel-'))panel=panel.parentElement;fail(panel?.id==='settings-panel-'+catalog.groupsByKey[key],store+': control outside its settings category '+key);}
  for(const key of Object.keys(defaults))if(key!=='settingsTab')fail(groups.has(catalog.groupsByKey[key]),store+': unclassified setting '+key);
 }
 const guide=require('../src/user-guide-model');fail(guide.version===require('../package.json').version,'guide version differs from app');for(const title of [...guide.chapters.map(chapter=>chapter.feature),...guide.checklist.map(item=>item[2])].filter(Boolean))fail(directory.entries.some(item=>item.title===title),'guide has unknown feature '+title);fail(fs.readFileSync(path.join(ROOT,'docs/user-guide-zh-Hant.html'),'utf8')===require('./generate-user-guide').generate(),'standalone guide is stale: run npm run guide');
 const columns=require('../src/everything-result-columns');for(const key of Object.keys(columns.COLUMNS))fail(Boolean(document.getElementById('everything-tracking-sort-'+key)),'missing Everything column '+key);
 for(const element of document.querySelectorAll('[aria-controls]'))for(const id of element.getAttribute('aria-controls').split(/\s+/))fail(Boolean(document.getElementById(id)),'missing aria-controls target '+id);
 return {errors,files,sources,pages:Object.keys(nav).length,tools:Object.keys(quick.TOOLS).length,features:directory.entries.length,settings:Object.keys(settings.DEFAULTS).length+Object.keys(desktop.DEFAULTS).length};
}
function category(name){
 for(const [group,pattern] of [['收藏與 Everything',/^(?:favorites|everything|workspace-favorite|workspace-bookmark)/],['工作區與共享',/^(?:notes|share-|structured-note)/],['搜尋與規劃',/^(?:app-search|floating-search|search-|calendar-|planning-|record-reminder|reminder-)/],['草稿與常用文字',/^(?:draft-|snippet-)/],['檔案與工具箱',/^(?:rename-|move-|moving|file-|path-|productivity|profile-|presets)/],['設定與桌面整合',/^(?:settings|desktop|floating|tool-|log-|global-|shortcut|startup|windows-|dialog-|layout-|sidebar-|resizable-)/],['主視窗與共用基礎',/.*/]])if(pattern.test(name))return group;
}
function functions(text){const names=new Set();for(const match of text.matchAll(/\bfunction\s+([\w$]+)\s*\(|\b(?:const|let)\s+([\w$]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>|^\s*(?:async\s+)?([\w$]+)\([^;{}]*\)\s*\{/gm)){const name=match[1]||match[2]||match[3];if(!['if','for','while','switch','catch'].includes(name))names.add(name);}return [...names].sort();}
function report(audit){
 const version=require('../package.json').version,lines=['# 應用程式功能與模組盤點','',`版本：v${version}。以 \`npm run audit:functions\` 重新產生。`,'',`讀取 src 全部 ${audit.files.length} 個 JS／HTML／CSS 檔案；核對 ${audit.pages} 個頁面、${audit.tools} 個工具入口、${audit.features} 項功能導覽與 ${audit.settings} 個介面／桌面偏好。`,'','## 盤點與整合結果','','- Everything 排序由共用驗證模型管理，按追蹤 ID 保存欄位、方向與各欄位上次方向；欄位隱藏時暫用名稱排序，不刪除原偏好。','- 追蹤定時更新、選取與批次操作共用可收合工具列，啟動立即還原狀態並保留更新摘要、已選數量、所選項目選單、右鍵與快捷鍵，收合狀態納入偏好還原／匯出。','- 一般收藏既有排序由 favoriteSort／favoriteDirection 保存；工作區由 notes-table-state 管理表格版面與篩選；查看紀錄由 log-view-settings-model 管理各範圍篩選／排序歷史，沒有另建平行資料來源。','- Everything 僅建立可見結果欄的 DOM 與格式文字；局部偏好更新避免重複重建結果，隱藏欄資料仍保留於同一快取。','- 查看紀錄主視窗／浮窗共用標題與空白處展開／收合行為，提醒與前往工作區置於詳情內，保留文字選取；追蹤暫停沿用 trackingSave，表格複製沿用結果版本與檔案身分核對，不新增平行資料來源。','- 新手指南共用 18 章內容來源，六項學習進度獨立保存；Ctrl+K 功能搜尋沿用首頁功能導覽與原有入口，F1 開啟指南，兩個按鈕位於資訊頁以精簡頂端；紀錄瀏覽將搜尋、篩選與檢視分開，條件標籤及快速日期共用原查詢與記憶。check:app 同時驗證指南版本、目標及離線產物。','- check:app 檢查頁面與快捷入口、功能目錄、工具目標、設定預設／分類／控制項、DOM ID、aria-controls 與本機依賴，錯誤會令命令失敗。','','## 界線與後續驗證','','本表是全部來源檔案的模組／具名函式靜態索引；匿名回呼、動態產生的函式不一定列出，並不等同逐行安全審查。既有檔案寫入預覽、版本／身分核對、來源授權及備份流程繼續使用原服務。Windows Everything 索引、Explorer、通知、全域快捷鍵、SMB、DPI 與安裝包仍需實機驗證。main.js、notes.js 與 renderer.js 的職責較多，日後應按本表邊界逐步抽離，避免一次改寫造成檔案或共享流程回歸。','','[使用者功能導覽與資料歸屬](function-map-zh-Hant.md) · [UI 與資料整理紀錄](ui-settings-and-data-audit.md)','','## 完整來源索引','','具名函式／箭頭函式／類別方法名稱由靜態掃描產生，供定位閱讀；以來源實際定義為準。',''];
 let group;for(const name of [...audit.files].sort((a,b)=>category(a).localeCompare(category(b),'zh-Hant')||a.localeCompare(b))){const next=category(name);if(next!==group){group=next;lines.push('### '+group,'','| 原始檔 | 函式索引／用途 |','| --- | --- |');}const list=name.endsWith('.js')?functions(audit.sources.get(name)).map(value=>'`'+value+'`').join('、')||'宣告、設定或共用模型':name.endsWith('.html')?'視窗／頁面結構及本機資源引用':'版面、主題與互動狀態樣式';lines.push(`| [${name}](../src/${name}) | ${list} |`);}return lines.join('\n')+'\n';
}
if(require.main===module){const result=inspect();if(result.errors.length){console.error(result.errors.join('\n'));process.exitCode=1;}else {console.log(`App contracts passed: ${result.files.length} source files, ${result.pages} pages, ${result.tools} tools, ${result.features} directory entries, ${result.settings} settings.`);if(process.argv.includes('--write'))fs.writeFileSync(path.join(ROOT,'docs/app-function-audit.md'),report(result));}}
module.exports={inspect,report};
