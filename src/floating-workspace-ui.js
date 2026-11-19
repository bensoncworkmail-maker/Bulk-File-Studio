'use strict';
(()=>{
 function mount({api,panels,action,getSettings}){
  const rail=document.createElement('nav');rail.id='workspace-launcher';rail.setAttribute('aria-label','浮動工作台快捷入口');document.body.append(rail);rail.tabIndex=0;rail.title='拖曳空白邊緣移動；右鍵開啟選單';window.floatingHeader?.init({header:rail,api,getSettings,onError:error=>run(()=>Promise.reject(error))});let signature='',leaveTimer,hoverTimer;
  const run=(task,message)=>action(task,message),button=(text,label,task)=>{const el=document.createElement('button');el.type='button';el.textContent=text;el.title=label;el.setAttribute('aria-label',label);el.addEventListener('click',()=>run(task,label));rail.append(el);return el;};
  button('B','展開／收合工作台',()=>api.setFloatingCollapsed(!getSettings().floatingCollapsed));
  for(const [id,icon,label] of [['snippets','▤','常用文字'],['clipboard','▣','剪貼簿'],['files','☆','收藏與工作區'],['planning','▦','日曆／看板']]){const el=button(icon,label,async()=>{await api.setFloatingCollapsed(false);panels.select(id,true);});el.dataset.panel=id;}
  button('⌕','Everything 追蹤',()=>api.workspace('page','tracking'));
  button('▧','工作情境（依設定開啟）',()=>api.openDesktopContext());
  button('✎','草稿筆記',()=>api.openDrafts());
  button('⚙','浮動工具設定',()=>api.workspace('page','settings'));
  const pop=document.createElement('div');pop.id='workspace-heading';const title=document.createElement('strong');title.textContent='快捷工作台';pop.append(title);const detach=document.createElement('button');detach.type='button';detach.textContent='↗ 獨立面板';detach.title='將目前日曆或常用文字另開為獨立視窗';detach.addEventListener('click',()=>run(()=>api.workspace('tool',panels.current()),'已開啟獨立面板'));pop.append(detach);document.getElementById('mini-panel-content').before(pop);
  function cancel(){clearTimeout(leaveTimer);clearTimeout(hoverTimer);}
  document.body.addEventListener('pointerenter',()=>{cancel();if(getSettings().floatingLauncher==='bubble'&&getSettings().floatingCollapsed)hoverTimer=setTimeout(()=>run(()=>api.setFloatingCollapsed(false),'已展開工作台'),280);});
  document.body.addEventListener('pointerleave',()=>{cancel();if(getSettings().floatingAutoCollapse)leaveTimer=setTimeout(()=>{if(document.hasFocus()||document.querySelector('dialog[open],input:focus,textarea:focus,select:focus,[contenteditable=true]:focus'))return;run(()=>api.workspace('idle-collapse'),'已收合工作台');},650);});
  function sync(){const s=getSettings();document.documentElement.dataset.launcher=s.floatingLauncher||'classic';const current=panels.current();detach.hidden=!['planning','snippets'].includes(current);pop.hidden=current==='files'||s.floatingCollapsed;title.textContent=({snippets:'常用文字',planning:'日曆／看板',clipboard:'剪貼簿'})[current]||'快捷工作台';for(const el of rail.querySelectorAll('[data-panel]')){el.setAttribute('aria-pressed',String(el.dataset.panel===current));el.disabled=el.dataset.panel!=='files'&&!s.floatingPanels?.enabled?.includes(el.dataset.panel);}const next=String(s.floatingCollapsed);if(next!==signature){cancel();signature=next;}}
  return {sync};
 }
 window.floatingWorkspaceUI={mount};
})();
