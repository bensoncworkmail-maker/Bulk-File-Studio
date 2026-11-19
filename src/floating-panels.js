'use strict';
(() => {
 const {PANELS,FILES_LABEL,normalize,enabledPanels}=window.floatingPanelsModel;
 // Each factory owns its view and per-session filters. The host owns placement and lifecycle.
 const builtins={
  contexts:{mount:(root,api)=>window.floatingToolViews.mount(root,api,'contexts')},drafts:{mount:(root,api)=>window.floatingToolViews.mount(root,api,'drafts')},
  clipboard:{mount:(root,api)=>window.floatingClipboardUI.mount(root,api)},
  planning:{preferences:['planningMode'],mount:(root,api,prefs)=>mountTool(root,api,'planning',{mode:prefs.planningMode})},
  snippets:{preferences:['snippetQuery','snippetLayout'],mount:(root,api,prefs)=>mountTool(root,api,'snippets',{query:prefs.snippetQuery,layout:prefs.snippetLayout})}
 };
 function mountTool(root,api,kind,initial){
  return window.toolViewsUI.mount(root,{
   data:filters=>api.floatingPanelData(kind,filters),
   action:(action,value,customer)=>api.floatingPanelAction(kind,action,value,customer)
  },{kind,embedded:true},{query:'',page:0,...initial});
 }
 function create({tabs,root,api,components=builtins,onSelect}){
  const views=new Map();
  let latestSettings,prefs,signature,active='files',collapsed=false,queued;
  function remove(id){
   const entry=views.get(id);
   if(!entry)return;
   if(id==='contexts'){entry.root.hidden=true;return;}entry.view.dispose();if(id==='contexts'){const template=document.getElementById('floating-context-template');if(template){template.hidden=true;document.body.append(template);}}entry.root.remove();views.delete(id);
  }
  function display(){
   tabs.hidden=collapsed||!prefs?.enabled.length;
   const external=latestSettings?.floatingToolLayout?.[active]?.placement&&latestSettings.floatingToolLayout[active].placement!=='quick';root.hidden=collapsed||external||active==='files';
   for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.panel===active));
   for(const [id,entry] of views)entry.root.hidden=id!==active;
   onSelect(external?'empty':root.hidden?'files':active);
  }
  function select(id,focus=false,approved=false){
   const current=views.get(active)?.view;if(active!==id&&!approved&&current?.requestClose)return current.requestClose().then(allow=>allow?select(id,focus,true):undefined).catch(error=>window.studioDiagnostics?.report('floating-context-close',error));
   const placement=latestSettings?.floatingToolLayout?.[id]?.placement;if(focus&&placement&&placement!=='quick'){void api.workspace(placement==='pinned'?'tool':'main-tool',id);return;}
   if(!prefs){queued=id;return;}
   if(id!=='files'&&(!prefs.enabled.includes(id)||!Object.hasOwn(components,id)))return;
   const changed=active!==id;if(changed&&focus)api?.workspace?.('panel',id).catch(()=>{});
   active=id;
   if(!collapsed&&id!=='files'&&!views.has(id)){
    const area=document.createElement('section');
    root.append(area);
    const component=components[id];
    views.set(id,{root:area,view:component.mount(area,api,prefs)});
   }else if(changed&&!collapsed)views.get(id)?.view.refresh();
   display();
   if(focus){
    const tab=[...tabs.children].find(tab=>tab.dataset.panel===id);
    tab?.focus();
   }
  }
  function sync(settings){
   latestSettings=settings;
   const next=normalize(settings.floatingPanels),key=JSON.stringify([next,settings.floatingLauncher,settings.floatingToolLayout]);
   const wasCollapsed=collapsed;
   collapsed=settings.floatingCollapsed===true;
   if(key!==signature){
    const previous=prefs;
    prefs=next;signature=key;
    for(const id of views.keys()){
     const {preferences=[]}=components[id];
     if(!prefs.enabled.includes(id)||preferences.some(key=>previous[key]!==prefs[key]))remove(id);
    }
    if(!previous||previous.defaultPanel!==prefs.defaultPanel)active=settings.floatingRememberPanel!==false&&['files',...prefs.enabled].includes(settings.floatingLastPanel)?settings.floatingLastPanel:prefs.defaultPanel;
    if(!prefs.enabled.includes(active))active='files';if(settings.floatingToolLayout?.[active]?.placement!=='quick'&&settings.floatingToolLayout)active=['snippets','clipboard','contexts','files','planning','drafts'].find(id=>(id==='files'||prefs.enabled.includes(id))&&settings.floatingToolLayout[id]?.placement==='quick')||'files';
    tabs.replaceChildren();
    for(const id of (settings.floatingLauncher==='classic'?['files',...enabledPanels(prefs)]:['snippets','clipboard','contexts','files','planning','drafts'].filter(id=>id==='files'||prefs.enabled.includes(id)))){
     const button=document.createElement('button');button.type='button';button.dataset.panel=id;
     button.textContent=settings.floatingLauncher==='classic'?(id==='files'?FILES_LABEL:PANELS[id]):({snippets:'常用文字',clipboard:'剪貼簿',contexts:'工作情境',files:'📁 檔案',planning:'日曆',drafts:'草稿'})[id];
     button.addEventListener('click',()=>select(id,true));
     tabs.append(button);
    }
    select(queued&&prefs.enabled.includes(queued)?queued:active);
    queued=undefined;
   }else if(wasCollapsed!==collapsed){
    if(!collapsed)views.get(active)?.view.refresh();
    select(active);
   }
  }
  function refresh(kind){
   if(!collapsed&&(!kind||kind===active))views.get(active)?.view.refresh();
  }
  return {sync,select,refresh,current:()=>active};
 }
 window.floatingPanels={create};
})();
