'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.workspaceAPI;
 const types={record:'紀錄',master:'主表',detail:'明細表',table:'一般表格'};
 let kind='files',defaultKind,items=[],callbacks,request=0,loading=false,saving=false,editing=null;
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
  for(const value of ['files','workspace'])$('favorite-kind-'+value).setAttribute('aria-pressed',String(value===kind));
  if(kind==='workspace')void refresh();
 }
 async function refresh(){
  if(kind!=='workspace')return;
  const id=++request;
  loading=true;render();
  try{
   const rows=await api.bookmarks();
   if(id!==request)return;
   items=rows;loading=false;render();
  }catch(error){
   if(id!==request)return;
   loading=false;
   $('workspace-favorite-count').textContent='無法讀取工作區收藏';
   callbacks.showFailure('無法讀取工作區收藏',error);
  }
 }
 async function change(item,enabled){
  if(saving)return;
  saving=true;
  try{await api.setBookmark(item.kind,item.id,enabled);await refresh();}
  catch(error){callbacks.showFailure('無法更新工作區收藏',error);}
  finally{saving=false;}
 }
 async function open(item){
  if(saving)return;
  try{await window.notesUI.openSearchTarget(item.kind,item.id);}
  catch(error){callbacks.showFailure('無法開啟工作區收藏',error);}
 }
 function edit(item){
  if(saving)return;
  editing=item;
  $('workspace-favorite-tag-title').textContent='編輯收藏標籤 · '+item.title;
  $('workspace-favorite-tag-input').value=item.tags.join(', ');
  $('workspace-favorite-tag-error').textContent='';
  $('workspace-favorite-tag-dialog').showModal();
 }
 function render(){
  if(!callbacks||kind!=='workspace')return;
  const settings=window.settingsUI.get();
  const data=items.filter(item=>item.saved||settings.favoriteIncludeLogPins);
  const tagControl=$('workspace-favorite-tag'),prior=tagControl.value;
  const tags=new Map(data.flatMap(item=>item.tags.map(tag=>[tag.toLocaleLowerCase(),tag])));
  const options=[['','全部標籤'],...Array.from(tags).sort((a,b)=>a[1].localeCompare(b[1],'zh-Hant'))];
  tagControl.replaceChildren(...options.map(([key,label])=>{
   const option=node('option',label);option.value=key;return option;
  }));
  tagControl.value=tags.has(prior)?prior:'';
  const type=$('workspace-favorite-type').value,query=$('workspace-favorite-search').value.trim().toLocaleLowerCase();
  const found=data.filter(item=>(type==='all'||item.type===type)&&
   (!tagControl.value||item.tags.some(tag=>tag.toLocaleLowerCase()===tagControl.value))&&
   (!query||[item.title,item.context||'',...item.tags].some(value=>value.toLocaleLowerCase().includes(query))));
  $('workspace-favorite-count').textContent=loading?'讀取收藏…':found.length+' 項／共 '+data.length+' 項';
  const list=$('workspace-favorite-list');
  list.replaceChildren();
  if(!found.length&&!loading)list.append(node('p',data.length?'沒有符合條件的收藏。':'尚未收藏工作區項目。','list-empty'));
  for(const item of found){
   const row=node('article',undefined,'workspace-favorite-row'),body=node('div',undefined,'workspace-favorite-description');
   const title=action(item.title,()=>open(item),'workspace-favorite-link');
   title.disabled=!item.available;title.title=item.title;
   body.append(title,node('small',[types[item.type],item.context,item.logPinned?'查看紀錄已釘選':'',item.available?'':'項目已移除或在回收筒'].filter(Boolean).join(' · ')));
   if(item.tags.length){
    const chips=node('div',undefined,'workspace-favorite-tags');
    for(const tag of item.tags)chips.append(action(tag,()=>{tagControl.value=tag.toLocaleLowerCase();render();},'favorite-badge'));
    body.append(chips);
   }
   const tools=node('div',undefined,'workspace-favorite-actions');
   if(item.saved)tools.append(action('編輯標籤',()=>edit(item)),action('移除收藏',()=>change(item,false)));
   else tools.append(action('加入收藏',()=>change(item,true)));
   row.append(body,tools);list.append(row);
  }
 }
 function init(options){
  callbacks=options;
  for(const value of ['files','workspace'])$('favorite-kind-'+value).addEventListener('click',()=>show(value));
  for(const id of ['workspace-favorite-type','workspace-favorite-tag'])$(id).addEventListener('change',render);
  $('workspace-favorite-search').addEventListener('input',render);
  $('workspace-favorite-tag-close').addEventListener('click',()=>{if(!saving)$('workspace-favorite-tag-dialog').close();});
  $('workspace-favorite-tag-form').addEventListener('submit',async event=>{
   event.preventDefault();
   if(!editing||saving)return;
   const tags=$('workspace-favorite-tag-input').value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean);
   saving=true;
   try{await api.setBookmarkTags(editing.kind,editing.id,tags);$('workspace-favorite-tag-dialog').close();await refresh();}
   catch(error){$('workspace-favorite-tag-error').textContent=error.message;}
   finally{saving=false;}
  });
  $('workspace-favorite-tag-dialog').addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  api.onChanged(()=>{if(!$('favorites-page').classList.contains('hidden'))void refresh();});
  api.onToolsChanged(()=>{if(!$('favorites-page').classList.contains('hidden'))void refresh();});
 }
 function activate(){
  const preferred=window.settingsUI.get().favoriteStartKind||'files';
  if(defaultKind!==preferred){defaultKind=preferred;show(preferred);}
  else if(kind==='workspace')void refresh();
 }
 window.workspaceFavoritesUI={init,activate,render,showFiles:()=>show('files'),isWorkspace:()=>kind==='workspace'};
})();
