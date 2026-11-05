'use strict';
(() => {
 const GLOBALS={mainShortcut:'叫回主視窗',floatingShortcut:'顯示／隱藏浮動工具',collapseShortcut:'收合／展開浮動工具',searchShortcut:'浮動搜尋面板',draftShortcut:'草稿筆記',snippetsShortcut:'分類文字面板',calendarShortcut:'小月曆'};
 const FIXED=[
  ['app-search','全域搜尋頁','Ctrl+Shift+F','main'],
  ['record-save','儲存紀錄表單','Ctrl+Enter','record'],
  ['draft-new','新草稿','Ctrl+N','draft'],['draft-save','儲存草稿','Ctrl+S','draft'],
  ['draft-export','草稿另存','Ctrl+Shift+S','draft'],['draft-reminder','草稿提醒','Alt+R','draft'],
  ['draft-delete','刪除目前草稿（清單焦點）','Delete','draft'],['draft-close','儲存並關閉草稿','Escape','draft'],
  ['rename-files','選擇改名檔案','Ctrl+O','rename'],['rename-folder','選擇改名資料夾','Ctrl+Shift+O','rename'],['rename-confirm','確認執行改名','Ctrl+Enter','rename'],['rename-undo','復原上一批改名／搬移','Ctrl+Z','rename'],
  ['grid-f2','編輯儲存格','F2','grid'],['grid-copy','複製儲存格','Ctrl+C','grid'],['grid-paste','貼上儲存格','Ctrl+V','grid'],['grid-backspace','以空白開始編輯','Backspace','grid'],
  ['grid-left','向左移動儲存格','Left','grid'],['grid-right','向右移動儲存格','Right','grid'],['grid-up','向上移動儲存格','Up','grid'],['grid-down','向下移動儲存格','Down','grid'],
  ['context-native','工作區右鍵選單','ContextMenu','workspace'],['context-menu','工作區右鍵選單','Shift+F10','workspace'],['card-open','開啟紀錄卡片','Enter','cards'],['card-check','選取紀錄卡片','Space','cards'],['split-left','縮小清單寬度（分隔線焦點）','Left','split'],['split-right','放大清單寬度（分隔線焦點）','Right','split'],['split-min','最小清單寬度（分隔線焦點）','Home','split'],['split-max','最大清單寬度（分隔線焦點）','End','split'],
  ['overlay-close','關閉浮動搜尋／日曆／片段視窗','Escape','auxiliary'],
  ['grid-edit','編輯／移至下一格','Enter','grid'],['grid-next','移至下一格','Tab','grid'],
  ['grid-delete','清除儲存格（依設定）','Delete','grid'],['grid-cancel','取消編輯','Escape','grid']
 ];
 const SCOPES={global:'全域（程式執行期間）',favorites:'收藏頁',main:'主視窗',draft:'草稿面板',record:'紀錄表單',grid:'工作區儲存格',rename:'檔案工具',workspace:'工作區導覽',cards:'工作區卡片',split:'版面分隔線',auxiliary:'獨立浮動視窗'};
 function canonical(value){
  if(!value)return '';const parts=value.replace(/CommandOrControl|CmdOrCtrl|Control/g,'Ctrl').split('+'),key=parts.pop();
  return ['Ctrl','Alt','Shift'].filter(mod=>parts.includes(mod)).concat(key==='Esc'?'Escape':key).join('+');
 }
 function rows(settings={},snippets=[],favorites={},labels={}){
  const list=Object.entries(GLOBALS).map(([key,label])=>({id:key,key,label,shortcut:settings[key]||'',scope:'global',source:'全域功能',kind:'global',enabled:true}));
  for(const item of settings.floatingQuickActions||[])list.push({id:'action:'+item.id,target:item.id,label:item.label,shortcut:item.shortcut||'',scope:'global',source:'浮動快捷動作',kind:'action',enabled:item.enabled!==false});
  for(const item of snippets)list.push({id:'snippet:'+item.id,target:item.id,label:item.name,shortcut:item.shortcut||'',scope:'global',source:'常用文字'+(item.category?'／'+item.category:''),kind:'snippet',enabled:true});
  for(const [key,value] of Object.entries(favorites))list.push({id:'favorite:'+key,key,label:labels[key]||key,shortcut:value||'',scope:'favorites',source:'收藏頁操作',kind:'favorite',enabled:true});
  for(const [id,label,shortcut,scope] of FIXED)list.push({id,label,shortcut,scope,source:'內建情境快捷鍵',kind:'fixed',enabled:scope!=='draft'||settings.draftLocalShortcuts!==false||['draft-save','draft-close'].includes(id)});
  return list;
 }
 function overlap(a,b){return a.scope==='global'||b.scope==='global'||a.scope===b.scope||a.scope==='main'&&['favorites','grid','record','rename','workspace','cards'].includes(b.scope)||b.scope==='main'&&['favorites','grid','record','rename','workspace','cards'].includes(a.scope);}
 function conflicts(list){const out=[];for(let i=0;i<list.length;i++){const a=list[i];if(!a.enabled||!a.shortcut)continue;for(const b of list.slice(i+1))if(b.enabled&&canonical(a.shortcut)===canonical(b.shortcut)&&overlap(a,b))out.push([a,b]);}return out;}
 function assertGlobal(settings,snippets,favorites,labels){const conflict=conflicts(rows(settings,snippets,favorites,labels))[0];if(conflict)throw new Error('相同快捷鍵衝突：'+conflict.map(item=>item.label+'（'+SCOPES[item.scope]+'）').join('／'));}
 const api={GLOBALS,FIXED,SCOPES,canonical,rows,conflicts,assertGlobal};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.shortcutInventoryModel=Object.freeze(api);
})();
