'use strict';
(() => {
 const {PANELS,FILES_LABEL,normalize,enabledPanels}=window.floatingPanelsModel;
 // Each factory owns its view and per-session filters. The host owns placement and lifecycle.
 const builtins={
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
  let prefs,signature,active='files',collapsed=false,queued;
  function remove(id){
   const entry=views.get(id);
   if(!entry)return;
   entry.view.dispose();entry.root.remove();views.delete(id);
  }
  function display(){
   tabs.hidden=collapsed||!prefs?.enabled.length;
   root.hidden=collapsed||active==='files';
   for(const tab of tabs.children)tab.setAttribute('aria-pressed',String(tab.dataset.panel===active));
   for(const [id,entry] of views)entry.root.hidden=id!==active;
   onSelect(root.hidden?'files':active);
  }
  function select(id,focus=false){
   if(!prefs){queued=id;return;}
   if(id!=='files'&&(!prefs.enabled.includes(id)||!Object.hasOwn(components,id)))return;
   const changed=active!==id;
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
   const next=normalize(settings.floatingPanels),key=JSON.stringify(next);
   const wasCollapsed=collapsed;
   collapsed=settings.floatingCollapsed===true;
   if(key!==signature){
    const previous=prefs;
    prefs=next;signature=key;
    for(const id of views.keys()){
     const {preferences=[]}=components[id];
     if(!prefs.enabled.includes(id)||preferences.some(key=>previous[key]!==prefs[key]))remove(id);
    }
    if(!previous||previous.defaultPanel!==prefs.defaultPanel)active=prefs.defaultPanel;
    if(!prefs.enabled.includes(active))active='files';
    tabs.replaceChildren();
    for(const id of ['files',...enabledPanels(prefs)]){
     const button=document.createElement('button');button.type='button';button.dataset.panel=id;
     button.textContent=id==='files'?FILES_LABEL:PANELS[id];
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
  return {sync,select,refresh};
 }
 window.floatingPanels={create};
})();
