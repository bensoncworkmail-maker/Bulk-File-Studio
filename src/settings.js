'use strict';
(() => {
  const {KEY,DEFAULTS,normalize,applyRoot}=window.studioSettingsModel;
  let settings={...window.studioInitialSettings},callbacks;
  const $=id=>document.getElementById(id);
  const controls={theme:'theme-select',fontSize:'font-size-select',density:'settings-density',pageSize:'settings-page-size',
    showSource:'settings-show-source',showRules:'settings-show-rules',showPaths:'settings-show-paths',recursiveDefault:'settings-recursive',
    startPage:'settings-start-page',rememberRules:'settings-remember-rules',resetRulesAfterRename:'settings-reset-rules',
    defaultSortBy:'settings-sort-by',defaultSortDirection:'settings-sort-direction'};
  function syncControls() {
    applyRoot(document.documentElement,settings);
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
  }
  async function refreshInfo() {
    try {$('settings-data-path').textContent=await window.renameAPI.dataLocation();}
    catch(e){$('settings-data-path').textContent=String(e.message||e);}
  }
  function init(options) {
    callbacks=options;syncControls();
    for(const [key,id] of Object.entries(controls))$(id).addEventListener('change',event=>{
      const el=event.target;update({[key]:typeof DEFAULTS[key]==='boolean'?el.checked:key==='pageSize'?Number(el.value):el.value});
    });
    $('btn-settings-reset').addEventListener('click',()=>$('settings-reset-dialog').showModal());
    $('btn-settings-reset-cancel').addEventListener('click',()=>$('settings-reset-dialog').close());
    $('btn-settings-reset-confirm').addEventListener('click',()=>{$('settings-reset-dialog').close();update({...DEFAULTS});});
    $('btn-settings-open-data').addEventListener('click',async()=>{
      try {await window.renameAPI.openDataLocation();}catch(e){callbacks.showFailure('無法開啟資料位置',e);}
    });
    refreshInfo();
  }
  window.settingsUI=Object.freeze({get:()=>({...settings}),init,update,refreshInfo,hasOpenDialog:()=>$('settings-reset-dialog').open});
})();
