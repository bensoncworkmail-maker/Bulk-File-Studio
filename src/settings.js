'use strict';
(() => {
  const {KEY,DEFAULTS,normalize,applyRoot}=window.studioSettingsModel;
  let settings={...window.studioInitialSettings},callbacks;
  const $=id=>document.getElementById(id);
  const controls={theme:'theme-select',fontSize:'font-size-select',density:'settings-density',pageSize:'settings-page-size',
    tagPanelWidth:'settings-tag-panel-width',showTips:'settings-tips',favoriteOpenMode:'settings-favorite-open',showFileIcons:'settings-file-icons',favoriteSort:'settings-favorite-sort',favoriteDirection:'settings-favorite-direction',rulesWidth:'settings-rules-width',showSource:'settings-show-source',showRules:'settings-show-rules',showPaths:'settings-show-paths',recursiveDefault:'settings-recursive',
    startPage:'settings-start-page',rememberRules:'settings-remember-rules',resetRulesAfterRename:'settings-reset-rules',
    defaultSortBy:'settings-sort-by',defaultSortDirection:'settings-sort-direction'};
  function syncControls() {
    applyRoot(document.documentElement,settings);
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
    window.desktopAPI.configure({theme:settings.theme,fontSize:settings.fontSize,tagSort:settings.tagSort,tagDirection:settings.tagDirection}).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
  }
  async function refreshInfo() {
    try {$('settings-data-path').textContent=await window.renameAPI.dataLocation();}
    catch(e){$('settings-data-path').textContent=String(e.message||e);}
  }
  function init(options) {
    callbacks=options;syncControls();window.studioShortcuts.init();
    const nativeControls={rememberWindow:'settings-remember-window',explorerTagPrompt:'settings-explorer-tag',floatingOnTop:'settings-floating-top',floatingStartup:'settings-floating-startup',floatingShortcut:'settings-floating-shortcut'};
    const syncNative=values=>{for(const [key,id] of Object.entries(nativeControls)){if(typeof values[key]==='boolean')$(id).checked=values[key];else $(id).value=values[key];}if(values.shortcutWarning)$('desktop-settings-status').textContent=values.shortcutWarning;};
    window.desktopAPI.get().then(syncNative).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
    window.desktopAPI.onChanged(result=>{if(result.settings)syncNative(result.settings);$('desktop-settings-status').textContent=result.error||result.warning||'視窗與浮動工具設定已儲存';});
    window.desktopAPI.configure({theme:settings.theme,fontSize:settings.fontSize,tagSort:settings.tagSort,tagDirection:settings.tagDirection}).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
    for(const [key,id] of Object.entries(nativeControls))$(id).addEventListener('change',async event=>{try{const el=event.target;const result=await window.desktopAPI.configure({[key]:el.type==='checkbox'?el.checked:el.value});syncNative(result.settings);$('desktop-settings-status').textContent=result.warning||'設定已儲存';}catch(e){$('desktop-settings-status').textContent=String(e.message||e);window.desktopAPI.get().then(syncNative).catch(()=>{});}});
    for(const id of ['btn-floating','btn-settings-floating'])$(id).addEventListener('click',()=>window.desktopAPI.showFloating().catch(e=>callbacks.showFailure('無法開啟浮動收藏',e)));
    $('btn-window-reset').addEventListener('click',()=>window.desktopAPI.resetWindow().catch(e=>callbacks.showFailure('無法還原視窗',e)));
    $('btn-settings-columns').addEventListener('click',()=>window.favoritesUI.openColumns());
    $('settings-tag-panel-width').addEventListener('input',event=>{$('settings-tag-width-value').textContent=event.target.value+' px';});
    $('btn-shortcuts-reset').addEventListener('click',()=>window.studioShortcuts.reset());
    window.renameAPI.appInfo().then(info=>{$('info-version').textContent='v'+info.version;}).catch(()=>{});
    for(const [key,id] of Object.entries(controls))$(id).addEventListener('change',event=>{
      const el=event.target;update({[key]:typeof DEFAULTS[key]==='boolean'?el.checked:['pageSize','tagPanelWidth'].includes(key)?Number(el.value):el.value});
    });
    $('btn-settings-reset').addEventListener('click',()=>$('settings-reset-dialog').showModal());
    $('btn-settings-reset-cancel').addEventListener('click',()=>$('settings-reset-dialog').close());
    $('btn-settings-reset-confirm').addEventListener('click',()=>{$('settings-reset-dialog').close();update({...DEFAULTS});window.desktopAPI.configure({rememberWindow:true,explorerTagPrompt:true,floatingOnTop:true,floatingStartup:false,floatingShortcut:'CommandOrControl+Alt+B'}).catch(e=>callbacks.showFailure('無法還原視窗設定',e));});
    $('btn-settings-open-data').addEventListener('click',async()=>{
      try {await window.renameAPI.openDataLocation();}catch(e){callbacks.showFailure('無法開啟資料位置',e);}
    });
    refreshInfo();
  }
  window.settingsUI=Object.freeze({get:()=>({...settings}),init,update,refreshInfo,hasOpenDialog:()=>$('settings-reset-dialog').open});
})();
