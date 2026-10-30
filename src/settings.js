'use strict';
(() => {
  const {KEY,DEFAULTS,normalize,applyRoot}=window.studioSettingsModel;
  let settings={...window.studioInitialSettings},callbacks;
  const $=id=>document.getElementById(id);
  const controls={theme:'theme-select',fontSize:'font-size-select',density:'settings-density',pageSize:'settings-page-size',
    sourcePanelWidth:'settings-source-panel-width',favoriteIconSize:'settings-favorite-icon-size',tagPanelWidth:'settings-tag-panel-width',showTips:'settings-tips',favoriteView:'settings-favorite-view',favoriteOpenMode:'settings-favorite-open',showFileIcons:'settings-file-icons',favoriteSort:'settings-favorite-sort',favoriteDirection:'settings-favorite-direction',rulesWidth:'settings-rules-width',showSource:'settings-show-source',showRules:'settings-show-rules',showPaths:'settings-show-paths',recursiveDefault:'settings-recursive',
    startPage:'settings-start-page',rememberRules:'settings-remember-rules',resetRulesAfterRename:'settings-reset-rules',
    defaultSortBy:'settings-sort-by',defaultSortDirection:'settings-sort-direction'};
  const tabs=['appearance','workspace','favorites','floating','system','data'];
  function syncControls() {
    for(const tab of tabs){const current=settings.settingsTab===tab;const button=$('settings-tab-'+tab);button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;$('settings-panel-'+tab).hidden=!current;}
    applyRoot(document.documentElement,settings);
    $('settings-source-width-value').textContent=settings.sourcePanelWidth+' px';
    $('settings-rules-width-value').textContent=settings.rulesWidth+' px';
    $('settings-tag-width-value').textContent=settings.tagPanelWidth+' px';
    for(const [key,id] of Object.entries(controls)){
      const el=$(id);if(typeof settings[key]==='boolean')el.checked=settings[key];else el.value=settings[key];
    }
  }
  function update(patch) {
    if(callbacks?.isBusy())return;
    const next=normalize({...settings,...patch}),changed=Object.keys(next).filter(key=>next[key]!==settings[key]);
    settings=next;syncControls();
    let saved=true;
    try {
      localStorage.setItem(KEY,JSON.stringify(settings));
      if(!settings.rememberRules)localStorage.removeItem('brs-rules-v1');
    } catch {saved=false;}
    $('settings-save-status').textContent=saved?'設定已自動儲存':'設定僅於本次生效，無法寫入儲存空間';
    callbacks?.onChange({...settings},changed);
    window.desktopAPI.configure({theme:settings.theme,fontSize:settings.fontSize,favoriteOpenMode:settings.favoriteOpenMode,tagSort:settings.tagSort,tagDirection:settings.tagDirection}).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
  }
  async function refreshInfo() {
    try {$('settings-data-path').textContent=await window.renameAPI.dataLocation();}
    catch(e){$('settings-data-path').textContent=String(e.message||e);}
  }
  function init(options) {
    callbacks=options;syncControls();window.studioShortcuts.init();
    const nativeControls={collapseShortcut:'settings-collapse-shortcut',floatingKeepPinnedOnTray:'settings-floating-keep-tray',floatingOpacity:'settings-floating-opacity',floatingOpaqueOnFocus:'settings-floating-opaque-focus',floatingCollapsed:'settings-floating-collapsed',floatingListActions:'settings-floating-list-actions',floatingShowPaths:'settings-floating-paths',floatingPager:'settings-floating-pager',closeToTray:'settings-close-to-tray',startHidden:'settings-start-hidden',mainShortcut:'settings-main-shortcut',floatingIconSize:'settings-floating-icon-size',floatingCompact:'settings-floating-compact',floatingShowSearch:'settings-floating-search',floatingShowTools:'settings-floating-tools',floatingShowTags:'settings-floating-tags',floatingShowStatus:'settings-floating-status',rememberWindow:'settings-remember-window',explorerTagPrompt:'settings-explorer-tag',floatingView:'settings-floating-view',floatingOnTop:'settings-floating-top',floatingStartup:'settings-floating-startup',floatingShortcut:'settings-floating-shortcut'};
    const syncNative=values=>{$('settings-floating-opacity-value').textContent=values.floatingOpacity+'%';for(const [key,id] of Object.entries(nativeControls)){if(typeof values[key]==='boolean')$(id).checked=values[key];else $(id).value=['mainShortcut','floatingShortcut','collapseShortcut'].includes(key)?window.globalShortcutModel.display(values[key]):values[key];}if(values.shortcutWarning){$('desktop-settings-status').textContent=values.shortcutWarning;$('desktop-shell-status').textContent=values.shortcutWarning;}};
    window.desktopAPI.get().then(syncNative).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
    window.desktopAPI.onChanged(result=>{if(result.settings)syncNative(result.settings);$('desktop-settings-status').textContent=result.error||result.warning||'視窗與浮動工具設定已儲存';$('desktop-shell-status').textContent=result.error||result.warning||'設定已儲存';});
    window.desktopAPI.configure({theme:settings.theme,fontSize:settings.fontSize,favoriteOpenMode:settings.favoriteOpenMode,tagSort:settings.tagSort,tagDirection:settings.tagDirection}).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
    for(const [key,id] of Object.entries(nativeControls).filter(([key])=>!['mainShortcut','floatingShortcut','collapseShortcut'].includes(key)))$(id).addEventListener('change',async event=>{try{const el=event.target;const result=await window.desktopAPI.configure({[key]:el.type==='checkbox'?el.checked:key==='floatingOpacity'?Number(el.value):el.value});syncNative(result.settings);$('desktop-settings-status').textContent=result.warning||'設定已儲存';$('desktop-shell-status').textContent=result.warning||'設定已儲存';}catch(e){$('desktop-settings-status').textContent=String(e.message||e);$('desktop-shell-status').textContent=String(e.message||e);window.desktopAPI.get().then(syncNative).catch(()=>{});}});
    for(const id of ['btn-floating','btn-settings-floating'])$(id).addEventListener('click',()=>window.desktopAPI.showFloating().catch(e=>callbacks.showFailure('無法開啟浮動收藏',e)));
    for(const kind of ['main','floating','collapse']){
      const key=kind+'Shortcut',input=$('settings-'+kind+'-shortcut');let saving=false;
      const status=message=>{$('desktop-settings-status').textContent=message;$('desktop-shell-status').textContent=message;};
      const save=async value=>{if(saving)return;saving=true;input.disabled=true;try{const result=await window.desktopAPI.configure({[key]:value});syncNative(result.settings);status(result.warning||'全域快捷鍵已儲存');}catch(e){status(String(e.message||e));try{syncNative(await window.desktopAPI.get());}catch{}}finally{saving=false;input.disabled=false;}};
      input.addEventListener('keydown',event=>{if(event.key==='Tab')return;event.preventDefault();event.stopPropagation();if(event.key==='Escape'){input.blur();return;}if(event.key==='Backspace'&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){save('');return;}const value=window.globalShortcutModel.fromEvent(event);if(value===null){if(!['Control','Alt','Shift','Meta'].includes(event.key))status('請用 Ctrl／Alt 組合或 F1–F24；不接受 Alt+F4、Ctrl+Alt+Delete');return;}save(value);});
      $('btn-'+kind+'-shortcut-clear').addEventListener('click',()=>save(''));
      $('btn-'+kind+'-shortcut-default').addEventListener('click',()=>save(kind==='main'?'CommandOrControl+Alt+S':kind==='floating'?'CommandOrControl+Alt+B':''));
    }
    $('settings-floating-opacity').addEventListener('input',event=>{$('settings-floating-opacity-value').textContent=event.target.value+'%';});
    $('btn-floating-small').addEventListener('click',()=>window.desktopAPI.compactFloatingSize().catch(e=>callbacks.showFailure('無法調整浮動大小',e)));
    const syncLogin=result=>{$('settings-login-startup').disabled=!result.supported;$('settings-login-startup').checked=result.enabled;$('settings-login-status').textContent=result.reason||(result.disabledBySystem?'Windows 系統已停用這個啟動項，請至系統的啟動應用程式設定檢查。':result.enabled?'已設定登入 Windows 後啟動':'開機啟動已關閉');};
    window.desktopAPI.startup().then(syncLogin).catch(e=>{$('settings-login-status').textContent=String(e.message||e);});
    $('settings-login-startup').addEventListener('change',async()=>{const el=$('settings-login-startup');el.disabled=true;try{syncLogin(await window.desktopAPI.setStartup(el.checked));}catch(e){$('settings-login-status').textContent=String(e.message||e);try{const status=await window.desktopAPI.startup();el.checked=status.enabled;el.disabled=!status.supported;}catch{}}});
    $('btn-settings-hide').addEventListener('click',()=>window.desktopAPI.hideToTray().catch(e=>callbacks.showFailure('無法隱藏至系統匣',e)));
    for(const [index,tab] of tabs.entries()){const button=$('settings-tab-'+tab);button.addEventListener('click',()=>update({settingsTab:tab}));button.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();update({settingsTab:tabs[next]});$('settings-tab-'+tabs[next]).focus();});}
    $('settings-source-panel-width').addEventListener('input',event=>{$('settings-source-width-value').textContent=event.target.value+' px';});
    $('btn-window-reset').addEventListener('click',()=>window.desktopAPI.resetWindow().catch(e=>callbacks.showFailure('無法還原視窗',e)));
    $('btn-settings-columns').addEventListener('click',()=>window.favoritesUI.openColumns());
    $('settings-rules-width').addEventListener('input',event=>{$('settings-rules-width-value').textContent=event.target.value+' px';});
    $('settings-tag-panel-width').addEventListener('input',event=>{$('settings-tag-width-value').textContent=event.target.value+' px';});
    $('btn-shortcuts-reset').addEventListener('click',()=>window.studioShortcuts.reset());
    window.renameAPI.appInfo().then(info=>{$('info-version').textContent='v'+info.version;}).catch(()=>{});
    for(const [key,id] of Object.entries(controls))$(id).addEventListener('change',event=>{
      const el=event.target;update({[key]:typeof DEFAULTS[key]==='boolean'?el.checked:['pageSize','tagPanelWidth','sourcePanelWidth'].includes(key)?Number(el.value):el.value});
    });
    $('btn-settings-reset').addEventListener('click',()=>$('settings-reset-dialog').showModal());
    $('btn-settings-reset-cancel').addEventListener('click',()=>$('settings-reset-dialog').close());
    $('btn-settings-reset-confirm').addEventListener('click',()=>{$('settings-reset-dialog').close();update({...DEFAULTS});window.desktopAPI.configure({collapseShortcut:'',floatingKeepPinnedOnTray:true,favoriteOpenMode:'double',floatingOpacity:100,floatingOpaqueOnFocus:true,floatingCollapsed:false,floatingListActions:'menu',floatingShowPaths:false,floatingPager:'auto',closeToTray:false,startHidden:false,mainShortcut:'CommandOrControl+Alt+S',floatingIconSize:'small',floatingCompact:false,floatingShowSearch:true,floatingShowTools:true,floatingShowTags:true,floatingShowStatus:false,rememberWindow:true,explorerTagPrompt:true,floatingView:'list',floatingOnTop:true,floatingStartup:false,floatingShortcut:'CommandOrControl+Alt+B'}).catch(e=>callbacks.showFailure('無法還原視窗設定',e));});
    $('btn-settings-export').addEventListener('click',async()=>{
      if(callbacks.isBusy())return;const button=$('btn-settings-export');button.disabled=true;
      try{const configuration=callbacks.getConfiguration();const result=await window.renameAPI.exportSettings({settings:{...settings},shortcuts:window.studioShortcuts.getBindings(),rules:configuration.rules,presets:configuration.presets});
        $('settings-export-status').textContent=result.canceled?'已取消匯出':'已匯出：'+result.path;
      }catch(e){callbacks.showFailure('無法匯出設定',e);}finally{button.disabled=false;}
    });
    $('btn-settings-open-data').addEventListener('click',async()=>{
      try {await window.renameAPI.openDataLocation();}catch(e){callbacks.showFailure('無法開啟資料位置',e);}
    });
    refreshInfo();
  }
  window.settingsUI=Object.freeze({get:()=>({...settings}),init,update,refreshInfo,hasOpenDialog:()=>$('settings-reset-dialog').open});
})();
