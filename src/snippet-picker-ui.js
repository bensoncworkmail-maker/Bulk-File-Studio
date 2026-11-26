'use strict';
(async()=>{
 const api=window.snippetPicker,M=window.snippetPickerModel,$=id=>document.getElementById(id),groups=[];
 let selecting=false,active;
 const activate=node=>{
  if(!node)return;
  active?.removeAttribute('data-active');
  active=node;active.setAttribute('data-active','');
  active.scrollIntoView?.({block:'nearest'});
 };
 function navigate(key){
  if(selecting||!groups.length)return;
  const group=groups.find(group=>group.node===active?.parentElement);
  if(key==='Enter'){active?.click();return;}
  if(group&&key==='Right'&&active===group.title){
   if(group.node.open)activate(group.buttons[0]);else group.node.open=true;
   return;
  }
  if(group&&key==='Left'){
   if(active!==group.title)activate(group.title);else group.node.open=false;
   return;
  }
  if(key==='Down'||key==='Up'){
   const visible=groups.flatMap(group=>group.node.open?[group.title,...group.buttons]:[group.title]);
   const index=visible.indexOf(active);
   activate(visible[Math.max(0,Math.min(visible.length-1,index+(key==='Down'?1:-1)))]);
  }
 }
 api.onKey?.(navigate);
 function failure(error){$('status').hidden=false;$('status').textContent=error.message||String(error);}
 function persist(changes){return api.groups(changes).catch(failure);}
 $('close').addEventListener('click',()=>api.close().catch(failure));
 try{
  const data=await api.get(),prefs=M.normalize(data.prefs);
  document.documentElement.dataset.theme=data.theme;document.body.dataset.density=prefs.density;document.body.dataset.groupTone=prefs.groupTone;
  document.body.style.setProperty('--picker-font-size',prefs.fontSize+'px');document.body.style.setProperty('--picker-preview-lines',String(prefs.previewLines));
  $('hint').hidden=!prefs.showHint;
  $('hint').textContent=(data.keyboard?'↑ ↓ 移動 · ← → 收合／展開 · Enter 選取':'點選片段即貼上')+(data.escape?' · Esc 關閉':' · 點擊 × 關閉');
  const grouped=M.grouped(data.rows,prefs,data.groupStates);
  $('count').textContent=data.rows.length+' 個片段';$('count').hidden=!prefs.showCounts;
  $('empty').hidden=Boolean(grouped.length);
  $('expand-all').disabled=$('collapse-all').disabled=!grouped.length;
  for(const entry of grouped){
   const group=document.createElement('details'),title=document.createElement('summary'),name=document.createElement('span'),count=document.createElement('span');
   group.className='picker-group';group.open=entry.open;
   name.className='picker-group-name';name.textContent=entry.label;name.title=entry.label;
   count.className='picker-group-count';count.textContent=String(entry.rows.length);count.hidden=!prefs.showCounts;
   title.append(name,count);group.append(title);
   const state={key:entry.key,node:group,title,buttons:[],open:entry.open};groups.push(state);
   title.addEventListener('click',()=>activate(title));
   group.addEventListener('toggle',()=>{if(!group.open&&state.buttons.includes(active))activate(title);if(state.open===group.open)return;state.open=group.open;if(prefs.rememberGroups)persist([[state.key,state.open]]);});
   for(const row of entry.rows){
    const button=document.createElement('button'),label=document.createElement('span');
    button.type='button';button.className='picker-row';label.className='picker-row-title';label.textContent=row.title;
    button.title=row.title+'\n'+row.summary;button.append(label);
    if(prefs.previewLines){const preview=document.createElement('span');preview.className='picker-row-preview';preview.textContent=row.summary;button.append(preview);}
    button.addEventListener('click',async()=>{
     if(selecting)return;selecting=true;
     for(const control of document.querySelectorAll('button'))control.disabled=true;
     try{await api.select(row.id);}catch(error){failure(error);$('close').disabled=false;}
    });
    state.buttons.push(button);group.append(button);
   }
   $('items').append(group);
  }
  activate(groups[0]?.title);
  for(const [id,open] of [['expand-all',true],['collapse-all',false]])$(id).addEventListener('click',()=>{
   const changes=[];for(const group of groups)if(group.open!==open){group.open=open;group.node.open=open;changes.push([group.key,open]);}
   if(prefs.rememberGroups&&changes.length)persist(changes);
  });
 }catch(error){failure(error);}
})();
