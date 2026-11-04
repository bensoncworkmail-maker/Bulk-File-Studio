'use strict';
(() => {
  const {KEY,DEFAULTS,normalize,applyRoot}=window.studioSettingsModel;
  const catalog=window.studioSettingsCatalog,{controls,nativeControls,buttonLabels,numericKeys,sharedNativeKeys}=catalog;
  let settings={...window.studioInitialSettings},callbacks;
  const $=id=>document.getElementById(id);
  const tabs=catalog.groups.map(group=>group.id);let workbench,resetScope='all';
  function syncControls() {
    for(const tab of tabs){const current=settings.settingsTab===tab;const button=$('settings-tab-'+tab);button.setAttribute('aria-selected',String(current));button.tabIndex=current?0:-1;$('settings-panel-'+tab).hidden=!current;}
    workbench?.sync();applyRoot(document.documentElement,settings);for(const [key,id] of [['notesPanelWidth','settings-notes-panel-width-value'],['notesDetailWidth','settings-notes-detail-width-value'],['notesRowHeight','settings-notes-row-height-value']])$(id).textContent=settings[key]+' px';
    $('settings-source-width-value').textContent=settings.sourcePanelWidth+' px';
    $('settings-rules-width-value').textContent=settings.rulesWidth+' px';
    $('settings-tag-width-value').textContent=settings.tagPanelWidth+' px';
    for(const [key,id] of Object.entries(controls)){
      const el=$(id);if(typeof settings[key]==='boolean')el.checked=settings[key];else el.value=settings[key];
    }
    $('settings-notes-sidebar-details').disabled=settings.notesSidebarMode!=='masters';
  }
  function update(patch,{skipNative=false}={}) {
    if(callbacks?.isBusy())return;
    const next=normalize({...settings,...patch}),changed=Object.keys(next).filter(key=>typeof next[key]==='object'?JSON.stringify(next[key])!==JSON.stringify(settings[key]):next[key]!==settings[key]);if(!changed.length)return;
    settings=next;syncControls();
    let saved=true;
    try {
      localStorage.setItem(KEY,JSON.stringify(settings));
      if(!settings.rememberRules)localStorage.removeItem('brs-rules-v1');
    } catch {saved=false;}
    $('settings-save-status').textContent=saved?'設定已自動儲存':'設定僅於本次生效，無法寫入儲存空間';
    callbacks?.onChange({...settings},changed);
    if(!skipNative&&changed.some(key=>sharedNativeKeys.includes(key)))window.desktopAPI.configure(Object.fromEntries(sharedNativeKeys.map(key=>[key,settings[key]]))).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
  }
  async function refreshInfo() {
    try {$('settings-data-path').textContent=await window.renameAPI.dataLocation();}
    catch(e){$('settings-data-path').textContent=String(e.message||e);}
  }
  function init(options) {
    callbacks=options;window.studioLayoutEditor?.main();window.desktopAPI.onOpenPage?.(page=>{if(['home','notes','favorites','search','rename','settings','productivity','planning','logs'].includes(page)){if(window.notesUI?.canLeave?.()===false){callbacks.showFailure('請先完成目前表單','原有輸入已保留');return;}window.favoritesUI.show(page);}});syncControls();$('settings-home-customize').addEventListener('click',()=>window.homeUI.openCustomize());$('settings-notes-card-config').addEventListener('click',()=>window.notesUI.openCardSettings());window.studioShortcuts.init();
    let nativeValues={},availableTags=[];
    const makeCheck=(parent,text,checked,onChange)=>{const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');label.className='check-row';input.type='checkbox';input.checked=checked;input.addEventListener('change',()=>onChange(input.checked));span.textContent=text;label.append(input,span);parent.appendChild(label);return input;};
    const buttonChecks=new Map();
    const saveNative=async patch=>{nativeValues={...nativeValues,...patch};try{const result=await window.desktopAPI.configure(patch);syncNative(result.settings);$('desktop-settings-status').textContent=result.warning||'設定已儲存';}catch(e){$('desktop-settings-status').textContent=String(e.message||e);window.desktopAPI.get().then(syncNative).catch(()=>{});}};
    for(const [id,patch] of [['layout-main-compact',{density:'compact',notesCompact:true,notesPanelWidth:190,notesDetailWidth:320,notesRowHeight:30,notesCardHeight:140,homeColumns:3}],['layout-main-standard',{density:'comfortable',notesCompact:false,notesPanelWidth:240,notesDetailWidth:400,notesRowHeight:38,notesCardHeight:0,homeColumns:2}],['layout-main-readable',{fontSize:'17',density:'comfortable',notesCompact:false,notesPanelWidth:280,notesDetailWidth:440,notesRowHeight:44,homeColumns:1}]])$(id).addEventListener('click',()=>update(patch));
    $('settings-layout-reset').addEventListener('click',()=>update({layoutEditing:false,filePanelSide:'source-left',homeWidgetHeights:{},homeWidgetSpans:{},homeWidgets:[...window.studioSettingsModel.HOME_WIDGETS]}));$('settings-floating-layout-reset').addEventListener('click',()=>saveNative({floatingControlOrder:['search','tools','tags'],floatingLayoutEditing:false}));
    $('layout-floating-minimal').addEventListener('click',()=>saveNative({floatingDefaultWidth:260,floatingDefaultHeight:320,floatingShowSearch:false,floatingShowTools:false,floatingShowStatus:false,floatingQuickPlacement:'top',floatingQuickColumns:0}));$('layout-floating-balanced').addEventListener('click',()=>saveNative({floatingDefaultWidth:420,floatingDefaultHeight:520,floatingShowSearch:true,floatingShowTools:true,floatingQuickPlacement:'top',floatingQuickColumns:2}));
    $('settings-main-size-apply').addEventListener('click',async()=>{try{const value=await window.desktopAPI.resizeMain(Number($('settings-main-width').value),Number($('settings-main-height').value));$('settings-main-size-status').textContent='已調整為 '+value.width+' × '+value.height+'；是否記住依視窗記憶設定。';}catch(error){callbacks.showFailure('無法調整視窗',error);}});
    const renderTags=()=>{const parent=$('settings-floating-tag-options');parent.replaceChildren();$('settings-floating-tag-choices').disabled=nativeValues.floatingTagScope!=='selected';const selected=nativeValues.floatingSelectedTags||[],tags=[...availableTags];for(const key of selected)if(!tags.some(tag=>tag.key===key))tags.push({key,name:key+'（目前不存在）'});for(const tag of tags)makeCheck(parent,tag.name,selected.includes(tag.key),checked=>saveNative({floatingSelectedTags:checked?[...new Set([...(nativeValues.floatingSelectedTags||[]),tag.key])]:(nativeValues.floatingSelectedTags||[]).filter(key=>key!==tag.key)}));if(!tags.length)parent.textContent='尚未建立自訂標籤';};
    for(const [key,label] of Object.entries(buttonLabels)){const input=makeCheck($('settings-floating-buttons'),label,true,visible=>saveNative({floatingHiddenButtons:visible?(nativeValues.floatingHiddenButtons||[]).filter(value=>value!==key):[...new Set([...(nativeValues.floatingHiddenButtons||[]),key])]}));input.id='settings-floating-button-'+key;buttonChecks.set(key,input);}
    function renderCollapsedSettings(){const items=$('settings-collapsed-items');items.replaceChildren();for(const [key,label] of Object.entries({pin:'置頂按鈕',close:'隱藏按鈕',search:'搜尋按鈕',main:'主視窗按鈕',caption:'工具標題',"quick-actions":'指定快捷動作'}))makeCheck(items,label,(nativeValues.floatingCollapsedItems||['pin','close']).includes(key),checked=>saveNative({floatingCollapsedItems:checked?[...new Set([...(nativeValues.floatingCollapsedItems||[]),key])]:(nativeValues.floatingCollapsedItems||[]).filter(value=>value!==key)}));const root=$('settings-collapsed-actions');root.replaceChildren();for(const item of (nativeValues.floatingQuickActions||[]).filter(item=>item.enabled))makeCheck(root,item.label,(nativeValues.floatingCollapsedQuickActionIds||[]).includes(item.id),checked=>saveNative({floatingCollapsedQuickActionIds:checked?[...new Set([...(nativeValues.floatingCollapsedQuickActionIds||[]),item.id])]:(nativeValues.floatingCollapsedQuickActionIds||[]).filter(id=>id!==item.id)}));if(!root.children.length)root.textContent='先在浮動快捷動作新增並啟用動作。';}
    $('settings-floating-search-forget').addEventListener('click',()=>saveNative({floatingSearchLastState:null}));
    const syncNative=values=>{nativeValues=values;renderCollapsedSettings();$('settings-floating-default-size').textContent=values.floatingDefaultWidth+' × '+values.floatingDefaultHeight+' px';for(const [key,input] of buttonChecks)input.checked=!(values.floatingHiddenButtons||[]).includes(key);renderTags();$('settings-floating-header-action').disabled=!values.floatingHeaderDoubleClick;$('settings-floating-tag-height').disabled=values.floatingTagFollowListHeight!==false;$('settings-floating-opacity-value').textContent=values.floatingOpacity+'%';for(const [key,id] of Object.entries(nativeControls)){if(typeof values[key]==='boolean')$(id).checked=values[key];else $(id).value=['mainShortcut','floatingShortcut','collapseShortcut','searchShortcut'].includes(key)?window.globalShortcutModel.display(values[key]):values[key];}if(values.shortcutWarning){$('desktop-settings-status').textContent=values.shortcutWarning;$('desktop-shell-status').textContent=values.shortcutWarning;}};
    window.desktopAPI.get().then(syncNative).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
    const refreshTagOptions=()=>window.desktopAPI.floatingTagOptions().then(tags=>{availableTags=tags;renderTags();}).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});refreshTagOptions();window.favoritesAPI.onChanged(refreshTagOptions);
    window.desktopAPI.onChanged(result=>{if(result.settings)syncNative(result.settings);$('desktop-settings-status').textContent=result.error||result.warning||'視窗與浮動工具設定已儲存';$('desktop-shell-status').textContent=result.error||result.warning||'設定已儲存';});
    window.desktopAPI.configure({theme:settings.theme,fontSize:settings.fontSize,favoriteOpenMode:settings.favoriteOpenMode,tagSort:settings.tagSort,tagDirection:settings.tagDirection}).catch(e=>{$('desktop-settings-status').textContent=String(e.message||e);});
    for(const [key,id] of Object.entries(nativeControls).filter(([key])=>!['mainShortcut','floatingShortcut','collapseShortcut','searchShortcut'].includes(key)))$(id).addEventListener('change',async event=>{try{const el=event.target;const result=await window.desktopAPI.configure({[key]:el.type==='checkbox'?el.checked:numericKeys.includes(key)?Number(el.value):el.value});syncNative(result.settings);$('desktop-settings-status').textContent=result.warning||'設定已儲存';$('desktop-shell-status').textContent=result.warning||'設定已儲存';}catch(e){$('desktop-settings-status').textContent=String(e.message||e);$('desktop-shell-status').textContent=String(e.message||e);window.desktopAPI.get().then(syncNative).catch(()=>{});}});
    for(const id of ['btn-floating','btn-settings-floating'])$(id).addEventListener('click',()=>window.desktopAPI.showFloating().catch(e=>callbacks.showFailure('無法開啟浮動工具',e)));
    for(const kind of ['main','floating','collapse','search']){
      const key=kind+'Shortcut',input=$('settings-'+kind+'-shortcut');let saving=false;
      const status=message=>{$('desktop-settings-status').textContent=message;$('desktop-shell-status').textContent=message;};
      const save=async value=>{if(saving)return;saving=true;input.disabled=true;try{const result=await window.desktopAPI.configure({[key]:value});syncNative(result.settings);status(result.warning||'全域快捷鍵已儲存');}catch(e){status(String(e.message||e));try{syncNative(await window.desktopAPI.get());}catch{}}finally{saving=false;input.disabled=false;}};
      input.addEventListener('keydown',event=>{if(event.key==='Tab')return;event.preventDefault();event.stopPropagation();if(event.key==='Escape'){input.blur();return;}if(event.key==='Backspace'&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){save('');return;}const value=window.globalShortcutModel.fromEvent(event);if(value===null){if(!['Control','Alt','Shift','Meta'].includes(event.key))status('請用 Ctrl／Alt 組合或 F1–F24；不接受 Alt+F4、Ctrl+Alt+Delete');return;}save(value);});
      $('btn-'+kind+'-shortcut-clear').addEventListener('click',()=>save(''));
      $('btn-'+kind+'-shortcut-default').addEventListener('click',()=>save(kind==='main'?'CommandOrControl+Alt+S':kind==='floating'?'CommandOrControl+Alt+B':''));
    }
    $('settings-floating-opacity').addEventListener('input',event=>{$('settings-floating-opacity-value').textContent=event.target.value+'%';});
    $('btn-floating-small').addEventListener('click',()=>window.desktopAPI.compactFloatingSize().catch(e=>callbacks.showFailure('無法調整浮動大小',e)));
    let loginBusy=false,loginState=null;
    const loginMessage=error=>String(error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/i,'');
    const syncLogin=result=>{loginState=result;$('settings-login-startup').disabled=loginBusy||!result.supported;$('settings-login-startup').checked=result.enabled;$('btn-startup-windows').disabled=!result.supported;$('settings-login-status').textContent=result.reason||(result.disabledBySystem?'啟動項已登記，但 Windows 已停用它；請在 Windows 啟動設定檢查，或重新勾選啟用。':result.enabled?'已設定登入 Windows 後啟動':'開機啟動已關閉');};
    const readLogin=()=>window.desktopAPI.startup().then(syncLogin).catch(error=>{$('settings-login-status').textContent=loginMessage(error);});readLogin();
    $('btn-startup-refresh').addEventListener('click',readLogin);$('btn-startup-windows').addEventListener('click',()=>window.desktopAPI.openStartupSettings().catch(error=>{$('settings-login-status').textContent=loginMessage(error);}));
    $('settings-login-startup').addEventListener('change',async()=>{const el=$('settings-login-startup');if(loginBusy)return;loginBusy=true;el.disabled=true;try{syncLogin(await window.desktopAPI.setStartup(el.checked));}catch(error){await readLogin();$('settings-login-status').textContent=loginMessage(error);}finally{loginBusy=false;el.disabled=!loginState?.supported;}});
    $('btn-settings-hide').addEventListener('click',()=>window.desktopAPI.hideToTray().catch(e=>callbacks.showFailure('無法隱藏至系統匣',e)));
    workbench=window.studioSettingsWorkbench.create({get:()=>settings,select:group=>update({settingsTab:group}),isBusy:()=>callbacks.isBusy()});
    for(const [index,tab] of tabs.entries()){const button=$('settings-tab-'+tab);button.addEventListener('click',()=>{workbench.clear();update({settingsTab:tab});});button.addEventListener('keydown',event=>{let next;if((event.key==='ArrowRight'||event.key==='ArrowDown'))next=(index+1)%tabs.length;else if((event.key==='ArrowLeft'||event.key==='ArrowUp'))next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();workbench.clear();update({settingsTab:tabs[next]});$('settings-tab-'+tabs[next]).focus();});}
    for(const id of ['notes-panel-width','notes-detail-width','notes-row-height'])$('settings-'+id).addEventListener('input',event=>{$('settings-'+id+'-value').textContent=event.target.value+' px';});
    $('settings-source-panel-width').addEventListener('input',event=>{$('settings-source-width-value').textContent=event.target.value+' px';});
    $('btn-window-reset').addEventListener('click',()=>window.desktopAPI.resetWindow().catch(e=>callbacks.showFailure('無法還原視窗',e)));
    $('settings-notes-compat-check').addEventListener('click',async()=>{try{const value=await window.workspaceAPI.checkPackage();if(!value.canceled)$('settings-notes-compat-status').textContent='可讀取：資料包 '+value.packageVersion+'／資料格式 '+value.schemaVersion+'，'+value.sheets+' 張表、'+value.records+' 筆；未匯入或修改資料。';}catch(error){$('settings-notes-compat-status').textContent=String(error.message||error);}});
    $('settings-notes-share-manage').addEventListener('click',()=>{window.favoritesUI.show('notes');window.notesUI.openShare();});
    $('btn-settings-columns').addEventListener('click',()=>window.favoritesUI.openColumns());
    $('settings-rules-width').addEventListener('input',event=>{$('settings-rules-width-value').textContent=event.target.value+' px';});
    $('settings-tag-panel-width').addEventListener('input',event=>{$('settings-tag-width-value').textContent=event.target.value+' px';});
    $('btn-shortcuts-reset').addEventListener('click',()=>window.studioShortcuts.reset());
    window.renameAPI.appInfo().then(info=>{$('info-version').textContent='v'+info.version;$('app-version').textContent='v'+info.version;const history=$('info-history');history.replaceChildren();for(const item of info.history||[]){const title=document.createElement('h3'),body=document.createElement('p');title.textContent=item.version+(item.date?' · '+item.date:'');body.textContent=item.text;history.append(title,body);}}).catch(()=>{});
    for(const [key,id] of Object.entries(controls))$(id).addEventListener('change',event=>{
      const el=event.target;update({[key]:typeof DEFAULTS[key]==='boolean'?el.checked:numericKeys.includes(key)?Number(el.value):el.value});
    });
    const requestReset=scope=>{if(callbacks.isBusy())return;resetScope=scope;const group=catalog.groups.find(item=>item.id===scope);$('settings-reset-title').textContent=group?'還原「'+group.label+'」偏好？':'還原全部偏好？';$('settings-reset-description').textContent=(group?'只還原此分類的介面與原生工具偏好。':'還原應用程式與浮動工具偏好。')+'保留收藏、資料工作區、範本、復原紀錄、視窗位置與 Windows 啟動／右鍵／Everything 整合；收藏快捷鍵請使用獨立還原按鈕。';$('settings-reset-dialog').showModal();};
    $('btn-settings-reset').addEventListener('click',()=>requestReset('all'));
    $('settings-reset-category').addEventListener('click',()=>requestReset(settings.settingsTab));
    $('settings-about').addEventListener('click',()=>window.favoritesUI.show('info'));
    $('btn-settings-reset-cancel').addEventListener('click',()=>$('settings-reset-dialog').close());
    $('btn-settings-reset-confirm').addEventListener('click',async()=>{if(callbacks.isBusy())return;const button=$('btn-settings-reset-confirm');button.disabled=true;try{const defaults=await window.desktopAPI.defaults(),nativePatch=catalog.resetPatch('native',resetScope,defaults),rendererPatch=resetScope==='all'?{...DEFAULTS}:catalog.resetPatch('renderer',resetScope,DEFAULTS);if(Object.keys(nativePatch).length){const result=await window.desktopAPI.configure(nativePatch);syncNative(result.settings);$('desktop-settings-status').textContent=result.warning||'此分類原生偏好已還原';}update(rendererPatch,{skipNative:true});$('settings-reset-dialog').close();workbench.clear();}catch(error){callbacks.showFailure('無法還原偏好',error);}finally{button.disabled=false;}});
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
  window.settingsUI=Object.freeze({openCategory:group=>{if(!tabs.includes(group)||callbacks?.isBusy()||window.notesUI&&!window.notesUI.canLeave())return false;workbench?.clear();update({settingsTab:group});return window.favoritesUI.show('settings');},get:()=>({...settings}),init,update,refreshInfo,hasOpenDialog:()=>$('settings-reset-dialog').open});
})();
