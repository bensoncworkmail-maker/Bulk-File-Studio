'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.workspaceAPI;
 const detail=()=>window.workspaceFavoriteDetailUI;
 const types={record:'紀錄',master:'主表',detail:'明細表',table:'一般表格'};
 const key=item=>item.kind+':'+item.id;
 let kind='files',defaultKind,items=[],visible=[],callbacks,request=0,loading=false,saving=false,editing=null,activeTag=null;
 const selected=new Set();let shownLimit=200;
 function node(tag,text,className){
  const item=document.createElement(tag);
  if(text!==undefined)item.textContent=text;
  if(className)item.className=className;
  return item;
 }
 function action(text,handler,className='btn btn-ghost'){
  const item=node('button',text,className);item.type='button';item.addEventListener('click',handler);return item;
 }
 function show(next){
  kind=next;
  $('favorite-files-layout').hidden=kind!=='files';
  $('workspace-favorites-panel').hidden=kind!=='workspace';
  for(const value of ['files','workspace']){
   const tab=$('favorite-kind-'+value),active=value===kind;
   tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
  }
  if(kind==='workspace'){void refresh();void detail()?.refresh();}
 }
 async function refresh(){
  if(kind!=='workspace')return;
  const id=++request;
  loading=true;render();
  try{
   const rows=await api.bookmarks({inheritTags:window.settingsUI.get().favoriteTableInheritTags});
   if(id!==request)return;
   items=rows;loading=false;render();
  }catch(error){
   if(id!==request)return;
   loading=false;render();
   $('workspace-favorite-count').textContent='無法讀取工作區收藏';
   callbacks.showFailure('無法讀取工作區收藏',error);
  }
 }
 async function open(item){
  if(saving)return;
  try{await window.notesUI.openSearchTarget(item.kind,item.id);}
  catch(error){callbacks.showFailure('無法開啟工作區收藏',error);}
 }
 async function remove(item){
  if(saving||editing)return;
  saving=true;render();
  try{
   await api.batchBookmarks([{kind:item.kind,id:item.id}],'remove',[]);
   selected.delete(key(item));detail()?.removed(item);
   await refresh();
   callbacks.showToast(item.logPinned?'已移除收藏；查看紀錄釘選仍保留':'已移除收藏');
  }catch(error){callbacks.showFailure('無法移除收藏',error);}
  finally{saving=false;render();}
 }
 function selectedItems(){return visible.filter(item=>selected.has(key(item)));}
 function setDialogBusy(busy){
  for(const control of $('workspace-favorite-tag-dialog').querySelectorAll('button,input'))control.disabled=busy;
 }
 function positionDialog(anchor){
  const dialog=$('workspace-favorite-tag-dialog');
  dialog.classList.toggle('bookmark-popover',Boolean(anchor));
  if(!anchor){dialog.style.left='';dialog.style.top='';return;}
  const rect=anchor.getBoundingClientRect(),box=dialog.getBoundingClientRect();
  dialog.style.left=Math.max(12,Math.min(rect.right-box.width,window.innerWidth-box.width-12))+'px';
  dialog.style.top=Math.max(12,Math.min(rect.bottom+6,window.innerHeight-box.height-12))+'px';
 }
 function edit(targets,operation='save',anchor=null){
  if(saving||editing)return Promise.resolve(null);
  const dialog=$('workspace-favorite-tag-dialog'),single=targets.length===1?targets[0]:null;
  const current=single?.ownTags||single?.tags||[],isSave=operation==='save',isTags=isSave||operation==='addTags';
  const labels={save:single?.saved?'編輯收藏與標籤':'加入收藏',addTags:'批次加入標籤',clearTags:'清除收藏標籤',remove:'移除收藏'};
  $('workspace-favorite-tag-title').textContent=labels[operation]+' · '+(isSave?single.title:targets.length+' 項');
  $('workspace-favorite-tag-help').textContent=operation==='addTags'?'加入選取的標籤，保留每項原有標籤；釘選項目會一併加入收藏。':operation==='remove'?'移除所選收藏。已釘選的紀錄會保留在「查看紀錄」。':operation==='clearTags'?'清除所選項目的單筆／表格收藏標籤。繼承標籤由表格管理。':single?.saved?'勾選此收藏的標籤，或輸入新標籤；取消全部勾選可清除標籤。':'選擇現有標籤，或輸入新標籤；也可直接收藏而不加標籤。';
  const table=isSave&&single.kind==='sheet';
  $('workspace-favorite-follow-wrap').hidden=!table;
  $('workspace-favorite-follow-records').checked=table&&(single.saved?single.followRecords===true:window.settingsUI.get().favoriteTableDefaultFollow===true);
  $('workspace-favorite-reset-wrap').hidden=!table||!single.excludedRecordIds?.length;
  $('workspace-favorite-reset-exclusions').checked=false;
  $('workspace-favorite-reset-label').textContent='重新納入已排除的 '+(single?.excludedRecordIds?.length||0)+' 筆紀錄';
  if(table)$('workspace-favorite-tag-help').textContent+=' 整表同步不受目前工作區的主紀錄或搜尋篩選影響。';
  if(single?.tracked)$('workspace-favorite-tag-help').textContent+=' 此紀錄亦由「'+single.trackedBy.title+'」同步；此處儲存為單筆收藏，繼承標籤由表格管理。';
  const choices=$('workspace-favorite-tag-choices');choices.replaceChildren();
  const names=new Map();
  for(const name of [...items.flatMap(item=>item.tags),...current])if(!names.has(name.toLocaleLowerCase()))names.set(name.toLocaleLowerCase(),name);
  for(const [tag,name] of [...names].sort((a,b)=>a[1].localeCompare(b[1],'zh-Hant'))){
   const label=node('label',undefined,'bookmark-tag-choice'),input=node('input');input.type='checkbox';input.value=name;
   input.checked=current.some(value=>value.toLocaleLowerCase()===tag);
   label.append(input,node('span',name));choices.append(label);
  }
  choices.hidden=!isTags;
  const input=$('workspace-favorite-tag-input');input.value='';input.parentElement.hidden=!isTags;
  $('workspace-favorite-tag-error').textContent='';
  $('workspace-favorite-tag-remove').hidden=!isSave||!single.saved;
  $('workspace-favorite-tag-without').hidden=!isSave||single.saved;
  $('workspace-favorite-tag-save').textContent=operation==='remove'?'移除收藏':operation==='clearTags'?'清除標籤':isSave?'儲存收藏':'加入標籤';
  setDialogBusy(false);
  return new Promise(resolve=>{
   editing={targets,operation,resolve,anchor,result:null};
   dialog.classList.toggle('bookmark-popover',Boolean(anchor));
   dialog.showModal();positionDialog(anchor);
  });
 }
 async function editBookmark(target){
  if(saving||editing)return null;
  // Fetch the latest tags even when opening the picker directly from the working area.
  items=await api.bookmarks({inheritTags:window.settingsUI.get().favoriteTableInheritTags});
  const item=items.find(item=>key(item)===key(target))||{...target,tags:[],saved:false};
  return edit([item],'save',target.anchor);
 }
 async function apply(operation,tags){
  if(!editing||saving)return;
  saving=true;setDialogBusy(true);render();
  const session=editing;
  try{
   const table=operation==='save'&&session.targets.length===1&&session.targets[0].kind==='sheet';
   const options=table?{followRecords:$('workspace-favorite-follow-records').checked,resetExclusions:$('workspace-favorite-reset-exclusions').checked}:undefined;
   session.result=await api.batchBookmarks(session.targets.map(({kind,id})=>({kind,id})),operation,tags,options);
   $('workspace-favorite-tag-dialog').close();
   callbacks.showToast(operation==='remove'?'已移除收藏':operation==='clearTags'?'已清除標籤':'已儲存收藏與標籤');
   await refresh();
  }catch(error){$('workspace-favorite-tag-error').textContent=error.message;}
  finally{saving=false;setDialogBusy(false);render();}
 }
 function bulk(operation){
  const targets=selectedItems().filter(item=>operation==='addTags'?item.available:operation==='clearTags'?item.manual!==false:item.saved);
  if(targets.length)void edit(targets,operation);
 }
 function renderTags(data){
  const tags=new Map();let untagged=0;
  for(const item of data){
   if(!item.tags.length)untagged++;
   for(const name of item.tags){const tag=name.toLocaleLowerCase(),existing=tags.get(tag);tags.set(tag,{key:tag,name:existing?.name||name,count:(existing?.count||0)+1});}
  }
  if(activeTag&&!tags.has(activeTag))activeTag=null;
  const ordered=[{key:null,name:'全部收藏',count:data.length},{key:'',name:'未加標籤',count:untagged},...Array.from(tags.values()).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'))];
  $('workspace-favorite-tag-list').replaceChildren(...ordered.map(({key,name,count})=>{
   const active=activeTag===key;
   const filter=action('',()=>{activeTag=key;render();$('workspace-favorite-tag-list').querySelector('[aria-pressed=true]')?.focus();},'favorite-tag-filter'+(active?' active':''));
   filter.append(node('span',name),node('span',String(count),'count-pill'));filter.setAttribute('aria-pressed',String(active));return filter;
  }));
 }
 function render(){
  if(!callbacks||kind!=='workspace')return;
  const settings=window.settingsUI.get(),tables=new Map(items.filter(item=>item.kind==='sheet').map(item=>[item.id,item]));
  const resolved=items.map(item=>item.tracked?{...item,tags:[...new Map([...(item.ownTags||[]),...(settings.favoriteTableInheritTags!==false?tables.get(item.trackedBy.id)?.tags||[]:[])].map(tag=>[tag.toLocaleLowerCase(),tag])).values()]}:item);
  detail()?.update(resolved);
  const data=resolved.filter(item=>(item.saved||settings.favoriteIncludeLogPins)&&(!item.tracked||item.manual!==false||settings.favoriteShowTableRecords!==false||item.logPinned&&settings.favoriteIncludeLogPins));
  renderTags(data);
  $('workspace-favorite-tag-resizer').setAttribute('aria-valuenow',String(settings.tagPanelWidth));
  const state=$('workspace-favorite-state').value,type=$('workspace-favorite-type').value,query=$('workspace-favorite-search').value.trim().toLocaleLowerCase();
  visible=data.filter(item=>(state==='all'||(state==='saved'?item.saved:state==='tracked'?(item.tracked||item.followRecords):!item.saved&&item.logPinned))&&(type==='all'||item.type===type)&&
   (activeTag===null||(activeTag===''?!item.tags.length:item.tags.some(tag=>tag.toLocaleLowerCase()===activeTag)))&&
   (!query||[item.title,item.context||'',...(item.masters||[]).flatMap(master=>[master.title,...master.values]),...item.tags].some(value=>value.toLocaleLowerCase().includes(query))));
  const shown=new Set(visible.map(key));for(const id of selected)if(!shown.has(id))selected.delete(id);
  const chosen=selectedItems(),all=$('workspace-favorite-select-all');
  all.checked=visible.length>0&&chosen.length===visible.length;all.indeterminate=chosen.length>0&&!all.checked;all.disabled=saving||loading||!visible.length;
  $('workspace-favorite-selected').textContent='已選 '+chosen.length+' 項';
  const tags=$('workspace-favorite-bulk-tags'),overLimit=items.filter(item=>item.manual).length+chosen.filter(item=>item.available&&item.manual===false).length>500;
  tags.disabled=saving||loading||overLimit||!chosen.some(item=>item.available);
  tags.title=overLimit?'超過單筆收藏上限；請編輯表格收藏標籤，套用到整表紀錄。':'加入標籤並保留原有標籤';
  for(const id of ['clear','remove'])$('workspace-favorite-bulk-'+id).disabled=saving||loading||!chosen.some(item=>id==='clear'?item.manual!==false:item.saved);
  $('workspace-favorite-clear-selection').disabled=saving||!chosen.length;
  $('workspace-favorite-count').textContent=loading?'讀取收藏…':visible.length+' 項／共 '+data.length+' 項'+(visible.length>shownLimit?' · 已顯示 '+shownLimit+' 項':'');
  const list=$('workspace-favorite-list'),scroll=list.scrollTop||0;list.replaceChildren();
  if(!visible.length&&!loading)list.append(node('p',data.length?'沒有符合條件的收藏。':'尚未收藏工作區項目。可在紀錄總覽或「搜尋與操作」列加入收藏。','list-empty'));
  for(const item of visible.slice(0,shownLimit)){
   const row=node('article',undefined,'workspace-favorite-row');row.dataset.selected=String(selected.has(key(item)));row.dataset.current=String(detail()?.isCurrent(item)===true);
   row.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button>0||event.target.closest?.('button,input,select,textarea,a,label')||window.getSelection?.()?.toString())return;
    if(item.available&&!saving&&!loading)void detail()?.show(item);
   });
   const check=node('input');check.type='checkbox';check.checked=selected.has(key(item));check.disabled=saving||loading;check.setAttribute('aria-label','選取 '+item.title);
   check.addEventListener('change',()=>{check.checked?selected.add(key(item)):selected.delete(key(item));render();list.querySelectorAll('input')[visible.indexOf(item)]?.focus();});
   const body=node('div',undefined,'workspace-favorite-description'),heading=node('div',undefined,'workspace-favorite-heading');
   const title=action(item.title,()=>void detail()?.show(item),'workspace-favorite-link');title.disabled=!item.available||saving;title.dataset.target=key(item);title.title='查看詳情：'+item.title;title.setAttribute('aria-controls','workspace-favorite-detail');title.setAttribute('aria-expanded',String(detail()?.isCurrent(item)===true));
   heading.append(node('span',types[item.type],'workspace-favorite-type'),title);
   body.append(heading,node('small',item.context||'未分組'));
   for(const master of (item.masters||[]).slice(0,5)){
    const parent=node('div',undefined,'workspace-favorite-master');
    parent.append(node('span','所屬主紀錄'),action(master.title,()=>open({kind:'record',id:master.id}),'workspace-favorite-parent-link'));
    if(master.values.length){const summary=node('span',master.values.slice(0,3).map(value=>value.length>200?value.slice(0,199)+'…':value).join(' · '),'workspace-favorite-master-values');summary.title=master.values.join(' · ');parent.append(summary);}
    body.append(parent);
   }
   const chips=node('div',undefined,'workspace-favorite-tags');
   if(item.followRecords)chips.append(node('span','整表同步 · '+(item.followedCount||0)+' 筆','workspace-favorite-pin'));
   if(item.tracked)chips.append(node('span','由「'+item.trackedBy.title+'」整表同步'+(item.manual?' · 亦有單筆收藏':''),'workspace-favorite-pin'));
   if(item.logPinned)chips.append(node('span',item.saved?'查看紀錄已釘選':'僅釘選・尚未加入收藏','workspace-favorite-pin'));
   if(!item.available)chips.append(node('span','項目已移除或在回收筒','workspace-favorite-pin'));
   for(const tag of item.tags)chips.append(action(tag,()=>{activeTag=tag.toLocaleLowerCase();render();},'favorite-badge'));
   if(chips.children.length)body.append(chips);
   const tools=node('div',undefined,'workspace-favorite-actions');
   const editButton=action(item.saved?'編輯標籤':'加入收藏',()=>void edit([item],'save',editButton));editButton.disabled=saving||!item.available&& !item.saved;
   tools.append(editButton);
   if(item.saved){const removeButton=action('移除收藏',()=>void remove(item));removeButton.title=item.tracked?'移除並排除此紀錄的整表同步收藏':'移除「'+item.title+'」的收藏';removeButton.disabled=saving||loading;tools.append(removeButton);}
   row.append(check,body,tools);list.append(row);
  }
  if(visible.length>shownLimit)list.append(action('顯示更多（尚有 '+(visible.length-shownLimit)+' 項）',()=>{shownLimit+=200;render();},'btn btn-ghost workspace-favorite-more'));
  list.scrollTop=scroll;
 }
 function init(options){
  callbacks=options;
  detail()?.init({
   open,edit:item=>edit([item]),remove,isBusy:()=>saving||loading||Boolean(editing),
   onSelect:render,onTag:tag=>{activeTag=tag.toLocaleLowerCase();render();},
   showFailure:callbacks.showFailure,showToast:callbacks.showToast
  });
  for(const value of ['files','workspace']){
   const tab=$('favorite-kind-'+value);tab.addEventListener('click',()=>show(value));
   tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?'files':event.key==='End'?'workspace':value==='files'?'workspace':'files';show(next);$('favorite-kind-'+next).focus();
   });
  }
  window.sidebarResize.initFavoritesWorkspace({getWidth:()=>window.settingsUI.get().tagPanelWidth,save:value=>window.settingsUI.update({tagPanelWidth:value}),isBusy:()=>saving||callbacks.isBusy()});
  const refilter=()=>{shownLimit=200;$('workspace-favorite-list').scrollTop=0;render();};
  $('workspace-favorite-state').addEventListener('change',refilter);
  $('workspace-favorite-type').addEventListener('change',refilter);$('workspace-favorite-search').addEventListener('input',refilter);
  $('workspace-favorite-select-all').addEventListener('change',event=>{for(const item of visible)event.target.checked?selected.add(key(item)):selected.delete(key(item));render();});
  $('workspace-favorite-clear-selection').addEventListener('click',()=>{selected.clear();render();});
  for(const [id,operation] of [['tags','addTags'],['clear','clearTags'],['remove','remove']])$('workspace-favorite-bulk-'+id).addEventListener('click',()=>bulk(operation));
  const dialog=$('workspace-favorite-tag-dialog');
  $('workspace-favorite-tag-close').addEventListener('click',()=>{if(!saving)dialog.close();});
  $('workspace-favorite-tag-remove').addEventListener('click',()=>void apply('remove',[]));
  $('workspace-favorite-tag-without').addEventListener('click',()=>void apply('save',[]));
  $('workspace-favorite-tag-form').addEventListener('submit',event=>{
   event.preventDefault();if(!editing||saving)return;
   const tags=[...$('workspace-favorite-tag-choices').querySelectorAll('input:checked')].map(input=>input.value);
   tags.push(...$('workspace-favorite-tag-input').value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean));
   const unique=[...new Map(tags.map(tag=>[tag.toLocaleLowerCase(),tag])).values()];
   if(editing.operation==='addTags'&&!unique.length){$('workspace-favorite-tag-error').textContent='請選擇或輸入至少一個標籤。';return;}
   void apply(editing.operation,unique);
  });
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('click',event=>{
   if(event.target!==dialog||saving)return;
   const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();
  });
  dialog.addEventListener('close',()=>{const session=editing;editing=null;session?.resolve(session.result);session?.anchor?.focus();});
  window.addEventListener('resize',()=>{if(editing?.anchor)positionDialog(editing.anchor);});
  api.onChanged(()=>{if(!$('favorites-page').classList.contains('hidden')){void refresh();void detail()?.refresh();}});
  api.onToolsChanged(()=>{if(!$('favorites-page').classList.contains('hidden'))void refresh();});
 }
 function activate(){
  const preferred=window.settingsUI.get().favoriteStartKind||'files';
  if(defaultKind!==preferred){defaultKind=preferred;show(preferred);}else if(kind==='workspace'){void refresh();void detail()?.refresh();}
 }
 window.workspaceFavoritesUI={init,activate,render,editBookmark,showFiles:()=>show('files'),isWorkspace:()=>kind==='workspace'};
})();
