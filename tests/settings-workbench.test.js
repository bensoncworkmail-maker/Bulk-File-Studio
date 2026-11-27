'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom'),Catalog=require('../src/settings-catalog'),Settings=require('../src/settings-model'),Desktop=require('../src/desktop-state');
const html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8'),flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);},plain=value=>JSON.parse(JSON.stringify(value));
function setup(prefs={},native={},history=[]){
 const document=documentFromHTML(html),saved={},patches=[],changes=[],errors=[],opened=[],defaultNative=Desktop.normalize(native);let values=defaultNative,busy=false,rejectConfigure=false;
 const desktopAPI={get:async()=>plain(values),defaults:async()=>plain(Desktop.DEFAULTS),configure:async patch=>{if(rejectConfigure)throw new Error('Shortcut unavailable');patches.push(plain(patch));values=Desktop.normalize({...values,...patch});return {settings:plain(values)};},floatingTagOptions:async()=>[],onChanged(){},startup:async()=>({supported:false,enabled:false}),resetWindow:async()=>{},showFloating:async()=>{},compactFloatingSize:async()=>{},hideToTray:async()=>{}};
 const window={studioSettingsModel:Settings,studioSettingsCatalog:Catalog,studioInitialSettings:Settings.normalize(prefs),desktopAPI,studioShortcuts:{init(){},reset(){},getBindings:()=>({})},globalShortcutModel:require('../src/global-shortcuts'),favoritesAPI:{onChanged(){}},renameAPI:{dataLocation:async()=>'/local',appInfo:async()=>({version:history[0]?.version||'1.31.0',history})},notesUI:{canLeave:()=>true,openCardSettings(){}},favoritesUI:{show:view=>{opened.push(view);return true;}}};
 const context=vm.createContext({window,document,localStorage:{setItem:(key,value)=>saved[key]=value,removeItem:key=>delete saved[key]},setTimeout:()=>0});for(const file of ['settings-workbench.js','settings.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/'+file),'utf8'),context,{filename:file});window.settingsUI.init({isBusy:()=>busy,onChange:(settings,keys)=>changes.push({settings:plain(settings),keys:plain(keys)}),showFailure:(title,error)=>errors.push(String(error.message||error)),getConfiguration:()=>({rules:{},presets:[]})});return {document,window,ui:window.settingsUI,patches,changes,errors,saved,opened,values:()=>values,setBusy:v=>busy=v,reject:v=>rejectConfigure=v,$:id=>document.getElementById(id)};
}
test('catalog bindings belong to their actual category and every native default is included in full reset',()=>{const d=documentFromHTML(html);for(const [key,id] of Object.entries({...Catalog.controls,...Catalog.nativeControls})){const el=d.getElementById(id);assert.ok(el,id);let panel=el;while(panel&&!panel.id.startsWith('settings-panel-'))panel=panel.parentElement;assert.equal(panel?.id,'settings-panel-'+Catalog.groupsByKey[key],key);}assert.deepEqual(Catalog.resetPatch('native','all',Desktop.DEFAULTS),plain(Desktop.DEFAULTS));const defaults=Catalog.resetPatch('renderer','notes',Settings.DEFAULTS);assert.ok(Object.hasOwn(defaults,'notesCardFields'));assert.equal(defaults.favoriteColumns,undefined);defaults.notesCardFields.x=[];assert.equal(Settings.DEFAULTS.notesCardFields.x,undefined);});
test('changing a settings category neither writes native preferences nor reports card fields changed',async()=>{const h=setup();await flush();const initial=h.patches.length;await h.$('settings-tab-floating').dispatch('click');await flush();assert.equal(h.ui.get().settingsTab,'floating');assert.equal(h.patches.length,initial);assert.deepEqual(h.changes.at(-1).keys,['settingsTab']);assert.equal(h.$('settings-panel-floating').hidden,false);assert.equal(h.$('settings-panel-appearance').hidden,true);await h.$('settings-tab-floating').dispatch('keydown',{key:'ArrowDown'});assert.equal(h.ui.get().settingsTab,'stickers');await h.$('settings-tab-stickers').dispatch('keydown',{key:'ArrowDown'});assert.equal(h.ui.get().settingsTab,'shortcuts');assert.equal(h.document.activeElement.id,'settings-tab-shortcuts');assert.deepEqual(h.errors,[]);});
test('settings search locates and focuses the original control without changing its value or saving the query',async()=>{const h=setup({notesCardHeight:180});await flush();h.$('settings-query').value='卡片 高度';await h.$('settings-query').dispatch('input');const buttons=h.$('settings-query-results').querySelectorAll('button');assert.ok(buttons.length>0);assert.equal(h.$('settings-panels').hidden,true);await buttons[0].dispatch('click');assert.equal(h.ui.get().settingsTab,'notes');assert.equal(h.$('settings-panels').hidden,false);assert.equal(h.document.activeElement.id,'settings-notes-card-height');assert.equal(h.$('settings-notes-card-height').value,'180');assert.ok(h.$('settings-notes-card-height').closest('label').classList.contains('settings-target'));assert.equal(h.ui.get().notesCardHeight,180);assert.doesNotMatch(JSON.stringify(h.saved),/卡片 高度/);h.$('settings-query').value='<script>literal</script>';await h.$('settings-query').dispatch('input');assert.match(h.$('settings-query-results').textContent,/找不到設定/);assert.deepEqual(h.errors,[]);});
test('floating category reset restores toolbar defaults, preserves other categories and does not change OS integrations',async()=>{const h=setup({settingsTab:'floating',notesCardHeight:220},{floatingCollapsedWidth:700,floatingShowQuickActions:false,floatingDropTag:"work",closeToTray:true});await flush();await h.$('settings-reset-category').dispatch('click');assert.equal(h.$('settings-reset-dialog').open,true);await h.$('btn-settings-reset-confirm').dispatch('click');await flush();assert.equal(h.values().floatingCollapsedWidth,560);assert.equal(h.values().closeToTray,true);assert.equal(h.ui.get().notesCardHeight,220);assert.equal(h.ui.get().settingsTab,'floating');assert.equal(h.$('settings-reset-dialog').open,false);assert.deepEqual(h.errors,[]);});
test('failed native reset preserves renderer preferences and the confirmation for retry',async()=>{const h=setup({settingsTab:'favorites',favoriteView:'icons'},{favoriteOpenMode:'single'});await flush();h.reject(true);await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.ui.get().favoriteView,'icons');assert.equal(h.values().favoriteOpenMode,'double'); // initial renderer/native shared preference sync uses renderer defaults
 assert.equal(h.$('settings-reset-dialog').open,true);assert.equal(h.$('btn-settings-reset-confirm').disabled,false);assert.match(h.errors[0],/Shortcut unavailable/);});
test('full reset uses current native defaults and contextual navigation is guarded when a workspace form is open',async()=>{const h=setup({notesCompact:false},{floatingOnTop:false});await flush();h.window.notesUI.canLeave=()=>false;assert.equal(h.ui.openCategory('notes'),false);assert.equal(h.opened.length,0);h.window.notesUI.canLeave=()=>true;assert.equal(h.ui.openCategory('notes'),true);assert.deepEqual(h.opened,['settings']);await h.$('btn-settings-reset').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.deepEqual(h.values(),plain(Desktop.DEFAULTS));assert.equal(h.ui.get().notesCompact,true);assert.equal(h.ui.get().settingsTab,'appearance');assert.deepEqual(h.errors,[]);});

test('settings visual order matches keyboard order and includes a separate homepage category',()=>{const d=documentFromHTML(html),ids=d.querySelector('.settings-tabs').querySelectorAll('button').map(n=>n.id);assert.deepEqual(ids,Catalog.groups.map(group=>'settings-tab-'+group.id));assert.equal(ids[0],'settings-tab-home');assert.ok(d.getElementById('settings-tab-notes').querySelector('strong'));assert.ok(d.getElementById('settings-tab-notes').querySelector('small'));});

test('rename verification can select full mode, exports native preferences and resets with file-tool settings',async()=>{
 const h=setup({settingsTab:'workspace'});await flush();const control=h.$('settings-rename-verification');assert.equal(control.value,'fast');control.value='full';await control.dispatch('change');assert.equal(h.values().renameVerification,'full');const exported=require('../src/settings-export').createSettingsExport({settings:{},rules:{}},h.values(),'1.40.0');assert.equal(exported.desktop.renameVerification,'full');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');await flush();assert.equal(h.values().renameVerification,'fast');assert.equal(control.value,'fast');assert.deepEqual(h.errors,[]);
});

test('startup checkbox reflects named registration, reports system disablement and recovers after failed verification',async()=>{
 const h=setup();await flush();let registered=true,disabled=true,finish;h.window.desktopAPI.startup=async()=>({supported:true,enabled:registered,disabledBySystem:disabled});await h.$('btn-startup-refresh').dispatch('click');assert.equal(h.$('settings-login-startup').checked,true);assert.equal(h.$('settings-login-startup').disabled,false);assert.match(h.$('settings-login-status').textContent,/Windows 已停用/);
 h.window.desktopAPI.setStartup=()=>new Promise((resolve,reject)=>finish={resolve,reject});h.$('settings-login-startup').checked=false;const pending=h.$('settings-login-startup').dispatch('change');assert.equal(h.$('settings-login-startup').disabled,true);finish.reject(new Error("Error invoking remote method 'startup-set': Error: cannot verify"));await pending;assert.equal(h.$('settings-login-startup').checked,true);assert.equal(h.$('settings-login-startup').disabled,false);assert.equal(h.$('settings-login-status').textContent,'cannot verify');
 h.window.desktopAPI.setStartup=async enabled=>{registered=enabled;disabled=false;return {supported:true,enabled,disabledBySystem:false};};h.$('settings-login-startup').checked=false;await h.$('settings-login-startup').dispatch('change');assert.equal(h.$('settings-login-startup').checked,false);assert.match(h.$('settings-login-status').textContent,/已關閉/);
});
test('diagnostic preferences save native values and belong to the data category',async()=>{const h=setup();await flush();h.$('settings-diagnostics-enabled').checked=false;await h.$('settings-diagnostics-enabled').dispatch('change');h.$('settings-diagnostics-days').value='14';await h.$('settings-diagnostics-days').dispatch('change');assert.equal(h.values().diagnosticsEnabled,false);assert.equal(h.values().diagnosticsRetentionDays,14);assert.equal(Desktop.normalize({diagnosticsRetentionDays:999}).diagnosticsRetentionDays,7);});

test('general and shared import defaults are separate, searchable and restored with workspace preferences',async()=>{const h=setup();await flush();assert.equal(h.$('settings-notes-import-mode').value,'copy');assert.equal(h.$('settings-notes-shared-import-mode').value,'merge');h.$('settings-notes-import-mode').value='skip';await h.$('settings-notes-import-mode').dispatch('change');assert.equal(h.ui.get().notesImportMode,'skip');assert.equal(h.ui.get().notesSharedImportMode,'merge');h.$('settings-query').value='共享 匯入';await h.$('settings-query').dispatch('input');assert.ok(h.$('settings-query-results').textContent.includes('共享資料包預設匯入方式'));assert.equal(Settings.normalize({notesImportMode:'bad'}).notesImportMode,'copy');});

test('retired workspace grouping controls are hidden from settings search and source clone can be configured',async()=>{const h=setup();await flush();for(const id of ['settings-notes-sidebar-mode','settings-notes-sidebar-compact','settings-notes-sidebar-details','settings-notes-sidebar-sections'])assert.equal(h.$(id).closest('label').hidden,true);h.$('settings-query').value='群組';await h.$('settings-query').dispatch('input');assert.ok(!h.$('settings-query-results').textContent.includes('側欄顯示方式'));h.$('settings-notes-shared-import-mode').value='clone';await h.$('settings-notes-shared-import-mode').dispatch('change');assert.equal(h.ui.get().notesSharedImportMode,'clone');});

test('share quick actions and changed-only import previews are searchable, exported and reset independently of share authorization',async()=>{const h=setup();await flush();for(const [id,key] of [['settings-notes-share-quick','notesShareQuickActions'],['settings-notes-import-changes-only','notesImportChangesOnly']]){assert.equal(h.$(id).checked,true);h.$(id).checked=false;await h.$(id).dispatch('change');assert.equal(h.ui.get()[key],false);}h.$('settings-query').value='有差異';await h.$('settings-query').dispatch('input');assert.match(h.$('settings-query-results').textContent,/匯入預覽/);const data=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},{},'1.45.0');assert.equal(data.settings.notesImportChangesOnly,false);assert.equal(data.settings.notesShareQuickActions,false);assert.equal(data.settings.followSource,undefined);h.ui.openCategory('sharing');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.ui.get().notesImportChangesOnly,true);assert.equal(h.ui.get().notesShareQuickActions,true);});

test('layout presets change main-window settings independently of the toolbar',async()=>{
 const h=setup();await flush();await h.$('layout-main-compact').dispatch('click');
 assert.equal(h.ui.get().notesPanelWidth,190);
 assert.equal(h.ui.get().notesRowHeight,30);
 assert.equal(h.values().floatingCollapsedWidth,560);
});

test('searching for a quick form control opens every containing disclosure before focusing it',async()=>{const h=setup();await flush();h.$('settings-query').value='quick-form-width';await h.$('settings-query').dispatch('input');const result=h.$('settings-query-results').querySelectorAll('button')[0];assert.ok(result);await result.dispatch('click');assert.equal(h.$('quick-action-editor').open,true);assert.equal(h.$('quick-action-form-config').open,true);assert.equal(h.document.activeElement.id,'quick-form-width');});

test('strong reminder sound and repeat are searchable native preferences, export and reset with the reminder category',async()=>{const h=setup();await flush();h.ui.openCategory('reminders');h.$('settings-reminder-delivery').value='attention';await h.$('settings-reminder-delivery').dispatch('change');h.$('settings-reminder-attention-sound').checked=false;await h.$('settings-reminder-attention-sound').dispatch('change');h.$('settings-reminder-attention-repeat').value='10';await h.$('settings-reminder-attention-repeat').dispatch('change');assert.equal(h.values().reminderDelivery,'attention');assert.equal(h.values().reminderAttentionSound,false);assert.equal(h.values().reminderAttentionRepeatMinutes,10);h.$('settings-query').value='強提醒 重播';await h.$('settings-query').dispatch('input');assert.match(h.$('settings-query-results').textContent,/重播間隔/);const data=require('../src/settings-export').createSettingsExport({settings:{},rules:{}},h.values(),'1.48.0');assert.equal(data.desktop.reminderAttentionRepeatMinutes,10);assert.equal(Desktop.normalize({reminderAttentionRepeatMinutes:-1}).reminderAttentionRepeatMinutes,5);h.ui.openCategory('reminders');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.values().reminderDelivery,'notification');assert.equal(h.values().reminderAttentionSound,true);assert.equal(h.values().reminderAttentionRepeatMinutes,5);assert.deepEqual(h.errors,[]);});

test('floating global search visibility and panel size are searchable, exported and reset with search preferences',async()=>{const h=setup();await flush();h.ui.openCategory('search');h.$('settings-floating-search-width').value='720';await h.$('settings-floating-search-width').dispatch('change');h.$('settings-floating-search-height').value='600';await h.$('settings-floating-search-height').dispatch('change');h.$('settings-floating-global-search').checked=false;await h.$('settings-floating-global-search').dispatch('change');assert.equal(h.values().floatingSearchWidth,720);assert.equal(h.values().floatingSearchHeight,600);assert.equal(h.values().floatingGlobalSearch,false);h.$('settings-query').value='全域搜尋 面板寬度';await h.$('settings-query').dispatch('input');assert.match(h.$('settings-query-results').textContent,/面板寬度/);const data=require('../src/settings-export').createSettingsExport({settings:{},rules:{}},h.values(),'1.49.0');assert.equal(data.desktop.floatingSearchWidth,720);assert.equal(Desktop.normalize({floatingSearchHeight:10000}).floatingSearchHeight,1200);h.ui.openCategory('search');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.values().floatingGlobalSearch,true);assert.equal(h.values().floatingSearchWidth,640);assert.equal(h.values().floatingSearchHeight,560);assert.deepEqual(h.errors,[]);});

test('layout, grid and graphite choices save, export and reset in their categories',async()=>{
 const h=setup();await flush();for(const [id,value] of [['theme-select','graphite'],['settings-file-panel-side','rules-left'],['settings-notes-grid-enter','down']]){h.$(id).value=value;await h.$(id).dispatch('change');}h.$('settings-layout-editing').checked=true;await h.$('settings-layout-editing').dispatch('change');h.$('settings-notes-delete-key').checked=false;await h.$('settings-notes-delete-key').dispatch('change');assert.equal(h.ui.get().theme,'graphite');assert.equal(h.values().theme,'graphite');assert.equal(h.ui.get().notesGridEnter,'down');assert.equal(h.ui.get().notesDeleteKey,false);h.ui.update({homeWidgetHeights:{pinned:250,unknown:900},homeWidgetSpans:{pinned:2}});const data=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},h.values(),'1.51.0');assert.deepEqual(data.settings.homeWidgetHeights,{pinned:250});await h.$('settings-layout-reset').dispatch('click');assert.equal(h.ui.get().filePanelSide,'source-left');assert.equal(h.ui.get().layoutEditing,false);assert.deepEqual(plain(h.ui.get().homeWidgetHeights),{});assert.equal(h.ui.get().notesGridEnter,'down');assert.deepEqual(h.errors,[]);
});

test('custom floating search accelerator persists through the settings UI',async()=>{
 const h=setup();await flush();await h.$('settings-search-shortcut').dispatch('keydown',{key:'F9',code:'F9'});await flush();assert.equal(h.values().searchShortcut,'F9');await h.$('btn-search-shortcut-clear').dispatch('click');await flush();assert.equal(h.values().searchShortcut,'');assert.deepEqual(h.errors,[]);
});

test('detail toolbar expansion is saved, exported and reset with workspace settings',async()=>{
 const h=setup();await flush();assert.equal(h.$('settings-notes-detail-tools-expanded').checked,false);h.$('settings-notes-detail-tools-expanded').checked=true;await h.$('settings-notes-detail-tools-expanded').dispatch('change');assert.equal(h.ui.get().notesDetailToolsExpanded,true);const exported=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},{},'1.56.0');assert.equal(exported.settings.notesDetailToolsExpanded,true);h.ui.openCategory('notes');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.ui.get().notesDetailToolsExpanded,false);assert.deepEqual(h.errors,[]);
});

test('master/detail modes and toolbar expansion export and reset independently',async()=>{
 const table='12345678-1234-1234-1234-123456789abc';
 const h=setup({notesView:'cards',notesTableViews:{[table]:'grid'}});await flush();assert.equal(h.ui.get().notesMasterView,'cards');assert.equal(h.ui.get().notesDetailView,'cards');h.$('settings-notes-master-view').value='list';await h.$('settings-notes-master-view').dispatch('change');h.$('settings-notes-detail-view').value='grid';await h.$('settings-notes-detail-view').dispatch('change');h.$('settings-notes-master-tools-expanded').checked=false;await h.$('settings-notes-master-tools-expanded').dispatch('change');assert.equal(h.ui.get().notesMasterView,'list');assert.equal(h.ui.get().notesDetailView,'grid');assert.equal(h.ui.get().notesView,'cards');const saved=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},{},'1.57.0');assert.equal(saved.settings.notesMasterView,'list');assert.equal(saved.settings.notesDetailView,'grid');assert.equal(saved.settings.notesMasterToolsExpanded,false);assert.equal(saved.settings.notesTableViews[table],'grid');h.ui.openCategory('notes');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.ui.get().notesMasterView,'list');assert.equal(h.ui.get().notesDetailView,'list');assert.equal(h.ui.get().notesMasterToolsExpanded,true);assert.equal(Object.keys(h.ui.get().notesTableViews).length,0);assert.deepEqual(h.errors,[]);
});

test('the info page displays recent history and searches across earlier releases',async()=>{
 const history=require('../src/release-history'),h=setup({}, {},history);
 await flush();
 const list=h.$('info-history'),search=h.$('info-history-search'),results=h.$('info-history-results');
 assert.equal(h.$('info-version').textContent,'v'+history[0].version);
 assert.equal(list.children.filter(node=>node.tagName==='ARTICLE').length,5);
 assert.equal(list.children[0].querySelectorAll('li').length,history[0].text.split('\n').length);
 search.value='v1.85.0 置頂';
 await search.dispatch('input');
 assert.equal(results.querySelectorAll('article').length,1);
 assert.equal(results.querySelectorAll('li').length,5);
 const older=list.querySelector('details');
 assert.equal(older.open,false);
 assert.equal(older.querySelectorAll('article').length,history.length-5);
 assert.equal(search.disabled,false);
 search.value='V1.0.0 改名';
 await search.dispatch('input');
 assert.equal(list.hidden,true);
 assert.equal(results.hidden,false);
 assert.equal(results.querySelectorAll('article').length,1);
 assert.match(results.textContent,/v1\.0\.0/);
 search.value='<script>不存在</script>';
 await search.dispatch('input');
 assert.equal(results.children.length,0);
 assert.match(h.$('info-history-count').textContent,/找不到/);
 search.value='';
 await search.dispatch('input');
 assert.equal(list.hidden,false);
 assert.equal(results.hidden,true);
});

test('calendar master label setting applies to the view and persists with workspace preferences',async()=>{
 const h=setup();
 await flush();
 const control=h.$('settings-planning-day-show-master');
 assert.equal(control.checked,false);
 assert.equal(h.document.documentElement.dataset.planningDayShowMaster,'false');
 control.checked=true;
 await control.dispatch('change');
 assert.equal(h.document.documentElement.dataset.planningDayShowMaster,'true');
 assert.equal(JSON.parse(h.saved[Settings.KEY]).planningDayShowMaster,true);
 assert.equal(Catalog.resetPatch('renderer','planning',Settings.DEFAULTS).planningDayShowMaster,false);
});

test('settings search scopes the same query to each selected tab and can return to all settings',async()=>{
 const h=setup({settingsTab:'notes'});
 await flush();
 const query=h.$('settings-query'),scope=h.$('settings-query-scope'),results=h.$('settings-query-results');
 scope.value='current';
 await scope.dispatch('change');
 query.value='查看紀錄';
 await query.dispatch('input');
 assert.match(results.textContent,/此分類找不到/);
 await h.$('settings-tab-planning').dispatch('click');
 assert.equal(query.value,'查看紀錄');
 assert.match(results.textContent,/查看紀錄預設排序/);
 assert.match(h.$('settings-group-title').textContent,/日曆與紀錄/);
 await h.$('settings-tab-search').dispatch('click');
 assert.match(results.textContent,/此分類找不到/);
 scope.value='all';
 await scope.dispatch('change');
 const result=results.querySelectorAll('button').find(item=>item.textContent.includes('查看紀錄預設排序'));
 assert.ok(result);
 await result.dispatch('click');
 assert.equal(h.ui.get().settingsTab,'planning');
 assert.equal(h.document.activeElement.id,'log-settings-sort');
 assert.equal(query.value,'');
 assert.equal(Object.hasOwn(JSON.parse(h.saved[Settings.KEY]),'settingsQueryScope'),false);
});

test('draft thumbnail height and floating search close behavior can be configured independently',async()=>{
 const h=setup();await flush();
 const height=h.$('settings-draftImageHeight'),close=h.$('settings-floating-search-close-on-visit');
 assert.equal(height.value,'96');
 assert.equal(close.checked,true);
 height.value='160';await height.dispatch('change');
 close.checked=false;await close.dispatch('change');
 assert.equal(h.values().draftImageHeight,160);
 assert.equal(h.values().floatingSearchCloseOnVisit,false);
 assert.equal(Desktop.normalize({draftImageHeight:500}).draftImageHeight,96);
});

test('remember-last-tab is on for existing settings and exposes the fixed startup choice only after opt-out',async()=>{
 const h=setup({favoriteStartKind:'workspace',favoriteLastKind:'everything'});await flush();assert.equal(h.$('settings-favorite-remember-last-tab').checked,true);assert.equal(h.$('settings-favorite-start-kind').disabled,true);
 h.$('settings-favorite-remember-last-tab').checked=false;await h.$('settings-favorite-remember-last-tab').dispatch('change');assert.equal(h.$('settings-favorite-start-kind').disabled,false);assert.equal(h.ui.get().favoriteStartKind,'workspace');assert.equal(h.ui.get().favoriteLastKind,'files');
 const data=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},{},'1.107.0');assert.equal(data.settings.favoriteRememberLastTab,false);
 h.ui.openCategory('favorites');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.ui.get().favoriteRememberLastTab,true);assert.equal(h.$('settings-favorite-start-kind').disabled,true);
});

test('Everything display controls are searchable, remember units and icons and reset within favorites',async()=>{
 const h=setup({settingsTab:'favorites',everythingSizeUnit:'KB',everythingFileIcons:true,everythingShowCopy:true});await flush();assert.equal(h.$('settings-everything-size-unit').value,'KB');h.$('settings-query').value='大小 單位';await h.$('settings-query').dispatch('input');assert.match(h.$('settings-query-results').textContent,/檔案大小顯示單位/);
 h.$('settings-everything-size-unit').value='GB';await h.$('settings-everything-size-unit').dispatch('change');for(const id of ['settings-everything-file-icons','settings-everything-show-copy']){h.$(id).checked=false;await h.$(id).dispatch('change');}assert.equal(h.ui.get().everythingSizeUnit,'GB');assert.equal(h.ui.get().everythingFileIcons,false);assert.equal(h.ui.get().everythingShowCopy,false);
 const exported=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},{},'1.116.0');assert.equal(Settings.normalize(exported.settings).everythingSizeUnit,'GB');await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');await flush();assert.equal(h.ui.get().everythingSizeUnit,'auto');assert.equal(h.ui.get().everythingFileIcons,true);assert.equal(h.ui.get().everythingShowCopy,true);
});

test('tracking rename mode is searchable, persists, exports and resets with the remembered tag',async()=>{
 const h=setup({settingsTab:'favorites',everythingRenameMode:'inline',everythingSelectedTag:'elearning'});await flush();assert.equal(h.$('settings-everything-rename-mode').value,'inline');h.$('settings-query').value='單項 重新命名';await h.$('settings-query').dispatch('input');assert.match(h.$('settings-query-results').textContent,/單項重新命名方式/);
 h.$('settings-everything-rename-mode').value='dialog';await h.$('settings-everything-rename-mode').dispatch('change');assert.equal(h.ui.get().everythingRenameMode,'dialog');assert.equal(JSON.parse(h.saved[Settings.KEY]).everythingSelectedTag,'elearning');
 const exported=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},{},'1.120.0');assert.equal(exported.settings.everythingRenameMode,'dialog');assert.equal(exported.settings.everythingSelectedTag,'elearning');
 await h.$('settings-reset-category').dispatch('click');await h.$('btn-settings-reset-confirm').dispatch('click');assert.equal(h.ui.get().everythingRenameMode,'inline');assert.equal(h.ui.get().everythingSelectedTag,null);
});

test('floating focus button visibility saves and resets independently of focus mode',async()=>{
 const h=setup({settingsTab:'floating'},{focusMode:true});
 await flush();
 const control=h.$('settings-floating-show-focus-button');
 assert.equal(control.checked,true);
 control.checked=false;
 await control.dispatch('change');
 assert.equal(h.values().floatingShowFocusButton,false);
 assert.equal(h.values().focusMode,true);
 const packet=require('../src/settings-export').createSettingsExport({settings:h.ui.get(),rules:{}},h.values(),'1.146.0');
 assert.equal(packet.desktop.floatingShowFocusButton,false);
 await h.$('settings-reset-category').dispatch('click');
 await h.$('btn-settings-reset-confirm').dispatch('click');
 assert.equal(control.checked,true);
 assert.equal(h.values().focusMode,true);
});
