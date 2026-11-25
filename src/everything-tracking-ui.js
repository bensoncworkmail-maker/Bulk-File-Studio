'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.everythingAPI,view=window.everythingTrackingView,columns=window.everythingResultColumns,views=window.everythingViewSettings;
 const tableSelection=window.tableSelection;
 let updatingView=false,iconState,pendingLoad=false,tagEditing=null;
 const resultFilters=new Map();
 const resultFilter=()=>resultFilters.get(currentId)||'';
 let callbacks,active=false,data={queries:[],refreshSeconds:60,engine:{}},currentId=null,tag=null,selected=new Set(),anchor=null,renaming=null,busy=false,loading=false,editing=null,timer,request=0,refreshRequest=0;
 const node=(name,text,className)=>{const el=document.createElement(name);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 const button=(text,run,className='btn btn-ghost')=>{const el=node('button',text,className);el.type='button';el.disabled=busy;el.addEventListener('click',run);return el;};
 const current=()=>data.queries.find(item=>item.id===currentId);
 const ready=()=>data.engine.supported&&data.engine.enabled&&data.engine.configured;
 const filtered=()=>data.queries.filter(item=>tag===null||(tag===''?!item.tags.length:item.tags.some(name=>name.toLocaleLowerCase()===tag)));
 const blocked=()=>busy||loading||renaming?.mode==='inline'||callbacks?.isBusy?.()||Boolean(document.querySelector('dialog[open]'));
 const renameMode=()=>window.settingsUI?.get().everythingRenameMode==='dialog'?'dialog':'inline';
 function rememberTag(value){tag=value;updateView({everythingSelectedTag:value},true);}
 function rememberQuery(value){currentId=value;if(window.settingsUI?.get().everythingLastQuery!==(value||''))updateView({everythingLastQuery:value||''},true);}
 function selectTag(value){if(blocked())return;rememberTag(value);rememberQuery(filtered().some(query=>query.id===currentId)?currentId:filtered()[0]?.id||null);restoreSelection();render();void refresh();}
 function tagMenu(event,item){
  event.preventDefault();event.stopPropagation();if(blocked())return;
  window.favoritesUI?.showMenu(event,[
   {label:'查看'+(item.key===null?'全部追蹤':item.key===''?'未加標籤的追蹤':'此標籤的追蹤搜尋'),run:()=>selectTag(item.key)},
   {label:'新增追蹤搜尋…',run:()=>{if(blocked())return;editor();if(item.key!==null)$('everything-rule-tags').value=item.key===''?'':item.name;}},
   ...(item.key===null||item.key===''?[]:[{label:'重新命名標籤…',run:()=>editTag(item,false)},{label:'刪除標籤…',run:()=>editTag(item,true)}])
  ]);
 }
 function tagNote(){
  if(!tagEditing)return;const value=$('everything-tag-name').value.trim(),key=value.toLocaleLowerCase(),merge=!tagEditing.remove&&key!==tagEditing.key&&data.queries.some(query=>query.tags.some(tag=>tag.toLocaleLowerCase()===key));
  $('everything-tag-note').textContent=tagEditing.remove?'保留追蹤搜尋、搜尋命令、實際檔案及一般收藏的標籤。':merge?'此標籤已存在；儲存後會合併標籤，並保留所有追蹤搜尋。':'最多 32 個字元，不可包含半形或全形逗號；同步更新使用此標籤的所有追蹤搜尋。';
  $('everything-tag-save').textContent=tagEditing.remove?'刪除標籤':merge?'合併標籤':'儲存';
 }
 function editTag(item,remove){
  if(blocked()||item.key===null||item.key==='')return;
  const queries=data.queries.filter(query=>query.tags.some(tag=>tag.toLocaleLowerCase()===item.key));
  if(!queries.length)return;
  tagEditing={name:item.name,key:item.key,remove,expected:queries.map(({id,revision})=>({id,revision}))};
  $('everything-tag-title').textContent=remove?'刪除追蹤標籤':'重新命名追蹤標籤';
  $('everything-tag-description').textContent=(remove?'將從 ':'將更新 ')+queries.length+' 個追蹤搜尋'+(remove?'移除':'中的')+'「'+item.name+'」標籤。';
  $('everything-tag-name-field').classList.toggle('hidden',remove);const input=$('everything-tag-name');input.value=item.name;input.required=!remove;input.disabled=remove;$('everything-tag-error').textContent='';tagNote();$('everything-tag-dialog').showModal();
  (remove?$('everything-tag-cancel'):input).focus();if(!remove)input.select?.();
 }
 async function saveTag(){
  if(!tagEditing||busy)return;const target=tagEditing;busy=true;
  for(const id of ['name','save','cancel'])$('everything-tag-'+id).disabled=true;renderControls();
  try{
   const result=await api.trackingManageTag({name:target.name,replacement:target.remove?null:$('everything-tag-name').value,expected:target.expected});
   if(tag===target.key)rememberTag(result.replacement===null?null:result.replacement.toLocaleLowerCase());
   $('everything-tag-dialog').close();pendingLoad=false;busy=false;await load(false);callbacks.showToast((target.remove?'已刪除標籤；更新 ':'已儲存標籤；更新 ')+result.updated+' 個追蹤搜尋');
  }catch(error){$('everything-tag-error').textContent=String(error.message||error);}
  finally{busy=false;for(const id of ['name','save','cancel'])$('everything-tag-'+id).disabled=id==='name'&&Boolean(tagEditing?.remove);renderControls();if(pendingLoad)void load(false);}
 }
 const sizeUnit=()=>columns.normalizeSizeUnit(window.settingsUI?.get().everythingSizeUnit);
 const showCopy=()=>window.settingsUI?.get().everythingShowCopy!==false;
 const shownColumns=()=>columns.normalizeColumns(window.settingsUI?.get().everythingColumns);
 const rememberedSort=()=>views.sort(window.settingsUI?.get().everythingSortStates?.[currentId]);
 const sorting=()=>views.effective(rememberedSort(),shownColumns());
 const ordered=()=>{const sort=sorting();return view.filterRows(view.sortedRows(current()?.snapshot?.rows||[],sort.key,sort.direction),resultFilter());};
 function updateView(patch,controlsOnly=false){updatingView=true;try{window.settingsUI?.update?.(patch);}finally{updatingView=false;}controlsOnly?renderControls():render();}
 function changeSort(key,direction){if(!currentId||blocked())return;const states=window.settingsUI?.get().everythingSortStates||{},remembered=rememberedSort(),active=sorting();if(direction===undefined&&active.key===key&&remembered.key!==key)direction=active.direction==='asc'?'desc':'asc';updateView({everythingSortStates:{...states,[currentId]:views.select(remembered,key,direction)}});}
 function restoreSelection(){
  const paths=new Set((window.settingsUI?.get().everythingSelections?.[currentId]||[]).map(views.pathKey));
  selected=new Set(ordered().filter(({item})=>paths.has(views.pathKey(item.path))).map(({index})=>index));
  anchor=null;
 }
 function rememberSelection(){
  const snapshot=current()?.snapshot;
  if(!snapshot){renderControls();return;}
  const saved={...window.settingsUI?.get().everythingSelections};
  delete saved[currentId];
  if(selected.size)saved[currentId]=[...selected].map(index=>snapshot.rows[index]?.path).filter(Boolean);
  updateView({everythingSelections:saved},true);
 }
 function changeSelection(index,event,checked){
  const multiple=event.ctrlKey||event.metaKey;
  const ids=event.shiftKey?ordered().map(entry=>entry.index):[];
  const from=ids.indexOf(anchor),to=ids.indexOf(index);
  if(from>=0&&to>=0){
   if(!multiple&&checked===undefined)selected.clear();
   for(const id of ids.slice(Math.min(from,to),Math.max(from,to)+1))selected.add(id);
  }else{
   if(checked===undefined&&!multiple)selected.clear();
   if(checked??(!multiple||!selected.has(index)))selected.add(index);else selected.delete(index);
   anchor=index;
  }
  paintSelection();
 }
 function paintSelection(){
  for(const row of $('everything-tracking-body').querySelectorAll('tr[data-index]')){
   const checked=selected.has(Number(row.getAttribute('data-index')));row.classList.toggle('selected',checked);row.setAttribute('aria-selected',String(checked));row.querySelector('input').checked=checked;
  }
  rememberSelection();
 }
 function visible(){return active&&!$('tracking-page').classList.contains('hidden')&&!document.hidden;}
 function schedule(){clearInterval(timer);if(active&&data.refreshSeconds)timer=setInterval(()=>{if(visible()&&!busy&&!loading&&!renaming&&!selected.size&&!document.querySelector('dialog[open]')&&current()?.enabled&&ready())void refresh();},data.refreshSeconds*1000);}
 async function load(update=false){
  if(renaming?.mode==='inline'||tagEditing&&busy){pendingLoad=true;return;}
  pendingLoad=false;
  const id=++request;loading=true;
  try{const value=await api.trackingList();if(id!==request)return;data=value;window.everythingWorkbench?.syncProfiles(data.fileTypes);selected.clear();anchor=null;
   if(tag&&!data.queries.some(item=>item.tags.some(name=>name.toLocaleLowerCase()===tag)))rememberTag(null);
   if(!currentId){const prefs=window.settingsUI?.get(),preferred=prefs?.everythingStartQuery||prefs?.everythingLastQuery;if(filtered().some(item=>item.id===preferred))currentId=preferred;}
   if(!filtered().some(item=>item.id===currentId))currentId=filtered()[0]?.id||null;
   restoreSelection();rememberQuery(currentId);syncStartQuery();
   for(const key of resultFilters.keys())if(!data.queries.some(query=>query.id===key))resultFilters.delete(key);
   loading=false;render();schedule();if(update&&visible()&&current()?.enabled&&ready())await refresh();
  }catch(error){if(id===request)$('everything-tracking-status').textContent=String(error.message||error);}
  finally{if(id===request){loading=false;renderControls();}}
 }
 async function refresh(){
  const query=current();if(!query||busy||renaming?.mode==='inline'||!ready()||!query.enabled)return;
  const id=++refreshRequest;let failure='';busy=true;render();$('everything-tracking-status').textContent='正在查詢 Everything…';
  try{const value=await api.trackingRefresh(query.id);if(id===refreshRequest&&currentId===query.id){request++;loading=false;data=value;restoreSelection();render();}}
  catch(error){failure=String(error.message||error);}
  finally{busy=false;render();if(failure&&id===refreshRequest)$('everything-tracking-status').textContent=failure;
   // Re-entry may have loaded the snapshot before this invalidated request finished.
   if(active&&id!==refreshRequest)void load(currentId!==query.id);
   else if(active&&currentId!==query.id)void refresh();
  }
 }
 function renderControls(){
  const query=current(),rows=ordered(),has=query&&ready(),locked=busy||loading||renaming?.mode==='inline';
  for(const check of $('everything-tracking-body').querySelectorAll('input[type=checkbox]'))check.disabled=locked;
  const filter=$('everything-tracking-filter');if(filter.value!==resultFilter())filter.value=resultFilter();filter.disabled=locked||!query;
  $('everything-tracking-size-unit').value=sizeUnit();$('everything-tracking-size-unit').disabled=locked;
  $('everything-tracking-filter-clear').disabled=locked||!resultFilter();
  $('everything-tracking-copy-query').disabled=locked||!query;
  const pause=$('everything-tracking-pause');pause.disabled=locked||!query;pause.textContent=query?.enabled===false?'恢復追蹤':'暫停追蹤';
  for(const name of ['refresh','edit','delete'])$('everything-tracking-'+name).disabled=locked||!query||(name==='refresh'&&(!has||!query.enabled));
  for(const name of ['select-all','select-none','select-invert'])$('everything-tracking-'+name).disabled=locked||!rows.length;
  for(const name of ['favorite','copy','copy-names','copy-folders','copy-table','rename','move','bulk-open','bulk-locations','trash'])$('everything-tracking-'+name).disabled=locked||!selected.size;
  $('everything-tracking-rename-item').disabled=locked||selected.size!==1;
  $('everything-tracking-interval').value=String(data.refreshSeconds);$('everything-tracking-interval').disabled=locked;
  $('settings-everything-tracking-refresh').value=String(data.refreshSeconds);
  $('everything-tracking-selected-menu').disabled=locked||!selected.size;
  const expanded=window.settingsUI?.get().everythingToolsExpanded!==false,toggle=$('everything-tracking-toggle-tools'),tools=$('everything-tracking-tools');
  if(!expanded&&tools.contains(document.activeElement))toggle.focus();tools.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'▾ 收合操作工具':'▸ 展開操作工具';
  const summary=$('everything-tracking-update-summary');summary.hidden=expanded;summary.textContent=!query?'尚無追蹤搜尋':!query.enabled?'追蹤已暫停':!ready()?'Everything 未就緒':!data.refreshSeconds?'定時更新已關閉':selected.size?'定時更新暫停（已選取結果）':'定時更新：'+({60:'每分鐘',300:'每 5 分鐘',900:'每 15 分鐘'}[data.refreshSeconds]||data.refreshSeconds+' 秒');
  $('everything-tracking-selected').textContent='已選 '+selected.size+' 項';
 }
 function render(){
  if(!callbacks)return;if(renaming?.mode==='inline'){renderControls();return;}
  const tags=new Map();for(const query of data.queries)for(const name of query.tags){const key=name.toLocaleLowerCase(),prior=tags.get(key);tags.set(key,{key,name:prior?.name||name,count:(prior?.count||0)+1});}
  $('everything-tracking-tags').replaceChildren(...[{key:null,name:'全部追蹤',count:data.queries.length},{key:'',name:'未加標籤',count:data.queries.filter(item=>!item.tags.length).length},...[...tags.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'))].map(item=>{
   const control=button('',()=>selectTag(item.key),'favorite-tag-filter'+(tag===item.key?' active':''));control.append(node('span',item.name),node('span',String(item.count),'count-pill'));control.setAttribute('aria-pressed',String(tag===item.key));control.setAttribute('aria-haspopup','menu');control.title=item.count+' 個追蹤搜尋；右鍵開啟標籤選單';control.addEventListener('contextmenu',event=>tagMenu(event,item));control.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')tagMenu(event,item);});return control;
  }));
  $('everything-tracking-rules').replaceChildren(...filtered().map(query=>{
   const control=button('',()=>{if(blocked())return;rememberQuery(query.id);restoreSelection();render();void refresh();},'everything-tracking-rule'+(currentId===query.id?' active':''));control.append(node('strong',query.name),node('small',query.enabled?query.tags.join(' · ')||'未加標籤':'已暫停'));control.setAttribute('aria-pressed',String(currentId===query.id));return control;
  }));
  const query=current(),snapshot=query?.snapshot,rows=snapshot?.rows||[],visibleColumns=shownColumns(),entries=ordered();
  $('everything-tracking-filter-count').textContent=resultFilter().trim()?'顯示 '+entries.length+' / '+rows.length+' 項':'共 '+rows.length+' 項';
  $('everything-tracking-title').textContent=query?.name||'追蹤 Everything 搜尋';$('everything-tracking-command').textContent=query?.text||'新增搜尋命令及標籤，追蹤符合條件的檔案與資料夾。';
  const status=$('everything-tracking-status');status.classList.toggle('error',Boolean(snapshot?.error));
  status.textContent=!ready()?'請在設定 → 啟動選取 es.exe 並啟用 Everything；此功能僅適用於 Windows。':!query?'尚無追蹤搜尋，按「＋ 追蹤搜尋」新增。':!query.enabled?'已暫停追蹤；按「恢復追蹤」重新啟用。':snapshot?.error?'更新失敗：'+snapshot.error+(snapshot.checkedAt?'；保留 '+new Date(snapshot.checkedAt).toLocaleString('zh-Hant')+' 的上次結果。':''):!snapshot?'尚未查詢，按「立即更新」讀取結果。':'已更新 '+new Date(snapshot.checkedAt).toLocaleString('zh-Hant')+' · '+rows.length+' 項'+(snapshot.truncated?'（超過上限，只顯示前 500 項）':'')+(snapshot.skipped?' · 略過 '+snapshot.skipped+' 項無法存取的位置'+(snapshot.skippedReasons?.length?'（'+snapshot.skippedReasons.join('；')+'）':''):'');
  const list=$('everything-tracking-results'),body=$('everything-tracking-body'),scroll=list.scrollTop,focused=body.contains(document.activeElement)||document.activeElement===list;body.replaceChildren();
  const labels=Object.fromEntries(Object.entries(columns.COLUMNS).map(([key,column])=>[key,column.label])),sort=sorting(),sortKey=sort.key,sortDirection=sort.direction;
  for(const [key,label] of Object.entries(labels)){
   const control=$('everything-tracking-sort-'+key);control.textContent=label+(key===sortKey?(sortDirection==='asc'?' ▲':' ▼'):'');control.disabled=busy||loading;
   control.parentElement.setAttribute('aria-sort',key===sortKey?(sortDirection==='asc'?'ascending':'descending'):'none');
  }
  entries.forEach(({item,index})=>{
   const row=node('tr',undefined,'everything-tracking-row'),check=node('input'),checkCell=node('td');row.setAttribute('data-index',String(index));check.type='checkbox';check.checked=selected.has(index);check.disabled=busy;row.classList.toggle('selected',check.checked);row.setAttribute('aria-selected',String(check.checked));check.setAttribute('aria-label','選取 '+item.name);let checkEvent={};
   check.addEventListener('click',event=>{checkEvent=event;});
   check.addEventListener('change',()=>{if(!blocked())changeSelection(index,checkEvent,check.checked);checkEvent={};});checkCell.append(check);
   if(tableSelection)tableSelection.guard(row);
   else row.addEventListener('mousedown',event=>{
    if(!blocked()&&event.shiftKey&&event.button===0&&!event.target.closest('button,input,a,select,textarea,[contenteditable]'))event.preventDefault();
   });
   row.addEventListener('click',event=>{
    if(blocked()||event.detail>1||event.button!==undefined&&event.button!==0||event.target.closest('button,input,a,select,textarea,[contenteditable]')||!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&window.getSelection?.()?.toString())return;
    changeSelection(index,event);$('everything-tracking-results').focus();
   });
   const name=node('td',undefined,'everything-tracking-name'),label=node('span',undefined,'everything-tracking-file-label'),icon=node('span',item.type==='folder'?'📁':'📄','everything-tracking-file-icon'),image=node('img'),location=node('td',view.location(item),'everything-tracking-location');
   if(item.type==='file')icon.textContent='';icon.setAttribute('data-kind',item.type);if(/\.lnk$/i.test(item.path))label.setAttribute('data-shortcut','true');
   icon.setAttribute('aria-hidden','true');image.alt='';image.hidden=true;image.width=image.height=16;
   image.addEventListener('load',()=>{icon.hidden=true;image.hidden=false;});image.addEventListener('error',()=>{icon.hidden=false;image.hidden=true;});
   if(item.type==='folder'){image.className='everything-tracking-folder-icon';image.setAttribute('src','folder-icon.svg');}else image.setAttribute('data-result-index',String(index));
   label.append(icon,image,node('span',item.name,'everything-tracking-file-text'));name.append(label);
   name.title=(item.type==='folder'?'資料夾':'檔案')+'：'+item.path+'\n雙擊開啟';location.title=view.location(item)+'\n雙擊開啟所在位置';
   name.addEventListener('dblclick',()=>void action('open',[index]));location.addEventListener('dblclick',()=>void action('show',[index]));
   const copy=node('td',undefined,'everything-tracking-copy'),copyButton=button('⧉ 路徑',()=>void action('copy',[index]));copyButton.title='複製 '+item.path;copyButton.setAttribute('aria-label','複製 '+item.name+' 的完整路徑');copy.append(copyButton);
   row.addEventListener('contextmenu',event=>rowMenu(event,index));row.append(checkCell);
   for(const key of visibleColumns){const column=columns.COLUMNS[key];
    const cell=key==='name'?name:key==='location'?location:node('td',columns.display(item,key,{sizeUnit:sizeUnit()}),'everything-tracking-'+key);cell.setAttribute('data-column',key);if(key!=='name'&&key!=='location')cell.title=cell.textContent;if(column.number)cell.classList.add('everything-tracking-number');row.append(cell);
   }if(showCopy())row.append(copy);body.append(row);
  });
  if(query&&snapshot&&!entries.length){const row=node('tr'),cell=node('td',rows.length?'目前清單沒有符合篩選的項目，請修改或清除結果篩選。':'目前沒有符合條件的結果。','list-empty');cell.setAttribute('colspan',String(shownColumns().length+1+(showCopy()?1:0)));row.append(cell);body.append(row);}
  if(query?.snapshot&&!busy&&!loading)void loadIcons(query);
  window.everythingLayout?.apply();list.scrollTop=scroll;renderControls();if(snapshot?.pruned)status.textContent+=' · 已移除回收項目，保留其餘結果';if(snapshot?.metadataUnavailable)status.textContent+=' · 目前 ES 不支援額外欄位，相關資訊顯示 —；可更新官方 ES 工具。';if(focused)list.focus();
 }
 function paintIcons(state){
  if(window.settingsUI?.get().everythingFileIcons===false||iconState!==state||current()?.id+':'+current()?.snapshot?.token!==state.key)return;
  for(const image of $('everything-tracking-body').querySelectorAll('img[data-result-index]')){
   const value=state.values.get(Number(image.getAttribute('data-result-index')));
   if(value&&image.getAttribute('src')!==value)image.setAttribute('src',value);
  }
 }
 async function loadIcons(query){
  if(!api.trackingIcons||window.settingsUI?.get().everythingFileIcons===false)return;
  const key=query.id+':'+query.snapshot.token;
  if(iconState?.key!==key)iconState={key,values:new Map(),started:false};
  const state=iconState;paintIcons(state);if(state.started)return;state.started=true;
  const files=query.snapshot.rows.map((item,index)=>({item,index})).filter(({item})=>item.type!=='folder'&&!/^[\\/]{2}/.test(item.path)).map(({index})=>index);
  for(let offset=0;offset<files.length;offset+=100){
   if(iconState!==state)return;
   const indices=files.slice(offset,offset+100);
   try{const icons=await api.trackingIcons(query.id,query.snapshot.token,indices);if(iconState!==state)return;
    for(const icon of icons)if(indices.includes(icon.index)&&typeof icon.dataURL==='string'&&/^data:image\/png;base64,/.test(icon.dataURL))state.values.set(icon.index,icon.dataURL);
    paintIcons(state);
   }catch{return;}
  }
 }
 function chooseColumns(){
  if(blocked())return;const root=$('everything-column-choices');root.replaceChildren();
  for(const [key,column] of Object.entries(columns.COLUMNS)){const label=node('label',undefined,'check-row'),check=node('input');check.type='checkbox';check.value=key;check.checked=shownColumns().includes(key);check.disabled=key==='name';label.append(check,node('span',column.label+(key==='name'?'（固定）':'')));root.append(label);}
  const copy=node('label',undefined,'check-row'),check=node('input');check.type='checkbox';check.value='copy-action';check.checked=showCopy();copy.append(check,node('span','複製（操作欄）'));root.append(copy);
  $('everything-columns-dialog').showModal();
 }
 function setColumns(values){
  updateView({everythingColumns:columns.normalizeColumns(values)});
 }
 function columnMenu(event,key){
  event.preventDefault();event.stopPropagation();if(blocked())return;
  window.favoritesUI?.showMenu(event,[{label:'調整適合欄位大小',disabled:!key,run:()=>window.everythingLayout?.autoSize(key)},{label:'自動調整所有欄位大小',run:()=>window.everythingLayout?.autoSize()},
   ...(key?['asc','desc']:[]).map(direction=>({label:direction==='asc'?'依此欄遞增排序':'依此欄遞減排序',run:()=>changeSort(key,direction)})),
   ...Object.entries(columns.COLUMNS).map(([name,column])=>({label:(shownColumns().includes(name)?'✓ ':'　 ')+column.label,disabled:name==='name',run:()=>setColumns(shownColumns().includes(name)?shownColumns().filter(value=>value!==name):[...shownColumns(),name])})),
   {label:(showCopy()?'✓ ':'　 ')+'複製（操作欄）',run:()=>updateView({everythingShowCopy:!showCopy()})},
   {label:'選擇欄位…',run:chooseColumns},{label:'還原預設四欄',run:()=>updateView({everythingColumns:[...columns.DEFAULT_COLUMNS],everythingShowCopy:true})},{label:'還原欄寬',run:()=>window.everythingLayout?.reset()}]);
 }
 function syncStartQuery(){
  const control=$('settings-everything-start-query');if(!control)return;const value=window.settingsUI?.get().everythingStartQuery||'';control.replaceChildren();
  for(const item of [{id:'',name:'上次選取的追蹤搜尋（首次使用第一項）'},...data.queries]){const option=node('option',item.name);option.value=item.id;control.append(option);}
  if(value&&!data.queries.some(item=>item.id===value)){const option=node('option','原搜尋已移除（改用第一項）');option.value=value;control.append(option);}control.value=value;
 }
 async function copyQuery(){const query=current();if(!query||blocked())return;try{await api.copyQuery(query.id);callbacks.showToast('已複製搜尋條件（包含類型篩選）');}catch(error){callbacks.showFailure('無法複製搜尋條件',error);}}
 function rowMenu(event,index){
  event.preventDefault();if(blocked())return;
  if(!selected.has(index)){selected=new Set([index]);anchor=index;paintSelection();}
  const count=selected.size,one=count===1;
  const items=[{label:'開啟檔案／資料夾'+(one?'':'（'+count+' 項，先確認）'),run:()=>action(one?'open':'bulk-open')},
   {label:'開啟所在資料夾'+(one?'':'（先確認）'),run:()=>action(one?'show':'bulk-locations')},
   {label:'複製完整路徑 · Ctrl+C',run:()=>action('copy')},{label:'複製檔名 · Ctrl+Shift+C',run:()=>action('copy-names')},{label:'複製所在資料夾',run:()=>action('copy-folders')},{label:'複製所選表格（可貼到試算表）',run:()=>action('copy-table')},
   {label:'重新命名… · F2',disabled:!one,run:renameItem},{label:'批次改名…',run:()=>action('rename')},{label:'批次搬移… · Ctrl+Shift+M',run:()=>action('move')},{label:'保留為一般收藏',run:()=>action('favorite')},{label:'移至資源回收筒… · Delete',run:()=>action('trash')},
   {label:'全選結果 · Ctrl+A',run:()=>selectResults('all')},{label:'取消選取 · Esc',run:()=>selectResults('none')},{label:'複製搜尋條件',run:copyQuery},{label:'編輯搜尋／標籤',run:()=>editor(current())}];
  window.favoritesUI?.showMenu(event,items);
 }
 function open(id=null){
  if(!window.favoritesUI?.show('tracking'))return false;if(id){cancelInlineRename(false,false);rememberQuery(id);rememberTag(null);restoreSelection();}return true;
 }
 function selectResults(kind){
  if(blocked())return;
  selected=new Set(ordered().map(({index})=>index).filter(i=>kind==='all'||kind==='invert'&&!selected.has(i)));
  if(kind==='none')anchor=null;
  paintSelection();$('everything-tracking-results').focus();
 }
 async function action(kind,indices=[...selected]){
  const query=current();if(!query?.snapshot||blocked()||!indices.length)return;
  if(kind==='copy-table'){const wanted=new Set(indices);indices=ordered().filter(entry=>wanted.has(entry.index)).map(entry=>entry.index);}
  busy=true;render();
  try{const result=await api.trackingAction(query.id,query.snapshot.token,indices,kind,kind==='copy-table'?{columns:shownColumns(),sizeUnit:sizeUnit()}:undefined);
   if(kind==='favorite'){callbacks.showToast('已保留 '+result.added+' 項一般收藏；'+result.existing+' 項已存在');if(result.issues?.length)callbacks.showFailure('部分結果未能收藏',result.issues.join('\n'));}
   else if(kind==='copy-table')callbacks.showToast('已複製 '+result.copied+' 項表格，可貼到試算表');
   else if(['copy','copy-names','copy-folders'].includes(kind))callbacks.showToast('已複製 '+result.copied+' 項'+({'copy':'路徑','copy-names':'檔名','copy-folders':'所在資料夾'}[kind]));
   else if(kind==='trash'&&!result.canceled){callbacks.showToast('已移至資源回收筒 '+result.trashed+' 項');if(result.failures?.length)callbacks.showFailure('部分項目未能回收',result.failures.join('\n'));busy=false;if(result.trashed)await load(true);}
   else if(kind==='rename')callbacks.onRename(result);
   else if(kind==='move')await window.movingUI.start(result.paths,{sourceLabel:'Everything 追蹤結果'});
   else if(kind==='bulk-open'||kind==='bulk-locations'){if(!result.canceled){callbacks.showToast('已開啟 '+result.opened+' 項');if(result.failures?.length)callbacks.showFailure('部分項目未能開啟',result.failures.join('\n'));}}
  }catch(error){callbacks.showFailure('追蹤結果操作未完成',error);}
  finally{busy=false;render();}
 }
 async function toggleTracking(){
  const query=current();if(!query||blocked())return;const enabled=!query.enabled;busy=true;renderControls();
  try{await api.trackingSave({...query,enabled});busy=false;await load(enabled);callbacks.showToast(enabled?'已恢復追蹤':'已暫停追蹤');}
  catch(error){callbacks.showFailure('無法切換追蹤狀態',error);}
  finally{busy=false;render();}
 }
 function cancelInlineRename(focus=true,reload=true){
  if(renaming?.mode!=='inline'||busy)return;
  const target=renaming;renaming=null;target.text.hidden=false;
  target.label.replaceChildren(...Array.from(target.label.children).filter(child=>child!==target.input));
  target.cell.replaceChildren(...Array.from(target.cell.children).filter(child=>child!==target.error));
  renderControls();if(focus)$('everything-tracking-results').focus();
  if(pendingLoad&&reload){pendingLoad=false;void load(false);}
 }
 function renameItem(){
  if(blocked())return;if(selected.size!==1){callbacks.showToast('請只選取一個項目；多個檔案請使用「批次改名」。');return;}
  const query=current(),index=[...selected][0],item=query?.snapshot?.rows[index];if(!item)return;
  const name=item.name,mode=renameMode();renaming={id:query.id,token:query.snapshot.token,index,mode};
  let input;
  if(mode==='inline'){
   const row=Array.from($('everything-tracking-body').querySelectorAll('tr[data-index]')).find(row=>Number(row.getAttribute('data-index'))===index),cell=row?.querySelector('.everything-tracking-name'),label=cell?.querySelector('.everything-tracking-file-label'),text=label?.querySelector('.everything-tracking-file-text');
   if(!cell||!label||!text){renaming=null;return;}
   input=node('input',undefined,'everything-inline-rename');input.type='text';input.id='everything-inline-rename-name';input.maxLength=255;input.spellcheck=false;input.value=name;input.setAttribute('aria-label','重新命名 '+name);input.title='Enter 確認；Esc 或離開欄位取消。檔案請包含副檔名。';
   const error=node('span',undefined,'everything-inline-rename-error');error.id='everything-inline-rename-error';error.setAttribute('role','alert');input.setAttribute('aria-describedby',error.id);
   Object.assign(renaming,{input,error,cell,label,text});text.hidden=true;label.append(input);cell.append(error);
   input.addEventListener('input',()=>{error.textContent='';input.removeAttribute('aria-invalid');});
   input.addEventListener('keydown',event=>{event.stopPropagation();if(event.isComposing||event.repeat||event.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();void saveItemName();}else if(event.key==='Escape'){event.preventDefault();cancelInlineRename();}});
   input.addEventListener('blur',()=>cancelInlineRename(false));renderControls();
  }else{
   $('everything-item-rename-source').textContent=item.path;$('everything-item-rename-name').value=name;$('everything-item-rename-error').textContent='';$('everything-item-rename-dialog').showModal();input=$('everything-item-rename-name');
  }
  input.focus();const end=item.type==='file'&&name.lastIndexOf('.')>0?name.lastIndexOf('.'):name.length;input.setSelectionRange?.(0,end);
 }
 async function saveItemName(){
  if(!renaming||busy)return;const target=renaming,inline=target.mode==='inline',input=inline?target.input:$('everything-item-rename-name');let failed=false;busy=true;renderControls();
  if(inline)input.disabled=true;else for(const id of ['everything-item-rename-name','everything-item-rename-save','everything-item-rename-cancel'])$(id).disabled=true;
  try{
   const result=await api.trackingAction(target.id,target.token,[target.index],'rename-item',{name:input.value});
   if(inline)renaming=null;else $('everything-item-rename-dialog').close();pendingLoad=false;callbacks.showToast(result.changed?'已重新命名':'名稱未變更');
   if(result.warning)callbacks.showFailure('改名完成，請留意',result.warning);
   busy=false;
   if(result.changed&&currentId===target.id){selected.delete(target.index);anchor=null;rememberSelection();}
   await load(false);
  }catch(error){failed=true;(inline?target.error:$('everything-item-rename-error')).textContent=String(error.message||error);if(inline)input.setAttribute('aria-invalid','true');}
  finally{busy=false;if(inline){input.disabled=false;if(failed&&renaming===target)input.focus();}else for(const id of ['everything-item-rename-name','everything-item-rename-save','everything-item-rename-cancel'])$(id).disabled=false;renderControls();}
 }

 function editor(query=null){
  if(busy||editing||document.querySelector('dialog[open]'))return;
  editing={id:query?.id||null};$('everything-rule-title').textContent=query?'編輯追蹤搜尋':'追蹤 Everything 搜尋';
  for(const name of ['name','text','mode','type'])$('everything-rule-'+name).value=query?.[name]||(name==='mode'?'syntax':name==='type'?'all':'');
  window.everythingWorkbench?.set('everything-rule',query);$('everything-rule-tags').value=query?.tags.join(', ')||'';$('everything-rule-enabled').checked=query?.enabled!==false;$('everything-rule-error').textContent='';$('everything-tracking-dialog').showModal();$('everything-rule-name').focus();
 }
 async function save(){
  if(!editing||busy)return;
  busy=true;for(const control of $('everything-tracking-dialog').querySelectorAll('input,textarea,select,button'))control.disabled=true;
  try{const query=await api.trackingSave({...editing,...window.everythingWorkbench?.get('everything-rule'),name:$('everything-rule-name').value,text:$('everything-rule-text').value,mode:$('everything-rule-mode').value,type:$('everything-rule-type').value,tags:$('everything-rule-tags').value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean),enabled:$('everything-rule-enabled').checked});currentId=query.id;if(tag!==null&&(tag===''?query.tags.length:!query.tags.some(name=>name.toLocaleLowerCase()===tag)))rememberTag(null);selected.clear();$('everything-tracking-dialog').close();busy=false;await load(true);}
  catch(error){$('everything-rule-error').textContent=String(error.message||error);}
  finally{busy=false;for(const control of $('everything-tracking-dialog').querySelectorAll('input,textarea,select,button'))control.disabled=false;render();}
 }
 async function remove(){const query=current();if(!query||busy||!window.confirm('移除「'+query.name+'」追蹤？實際檔案與一般收藏會保留。'))return;busy=true;try{data=await api.trackingRemove(query.id);currentId=null;selected.clear();}catch(error){callbacks.showFailure('無法移除追蹤',error);}finally{busy=false;await load(true);}}
 async function interval(control){try{data=await api.trackingConfigure(Number(control.value));schedule();renderControls();}catch(error){callbacks.showFailure('無法儲存更新間隔',error);renderControls();}}
 function activate(value){active=value;if(!value){cancelInlineRename(false,false);pendingLoad=false;request++;refreshRequest++;clearInterval(timer);return;}if(callbacks)void load(true);}
 function keydown(event){
  if(event.defaultPrevented||event.isComposing||event.repeat||event.altKey||!visible()||blocked())return;
  const ctrl=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
  if(ctrl&&!event.shiftKey&&key==='f'){event.preventDefault();event.stopPropagation();const field=$('everything-tracking-filter');field.focus();field.select?.();return;}
  const target=event.target,input=target.closest('input');
  if(target.closest('textarea,select,[contenteditable]')||input&&input.type!=='checkbox')return;
  let run;
  if((key==='contextmenu'||key==='f10'&&event.shiftKey)&&selected.size)run=()=>rowMenu(event,[...selected][0]);
  else if(ctrl&&key==='a')run=()=>selectResults(event.shiftKey?'invert':'all');
  else if(ctrl&&key==='c'&&selected.size)run=()=>action(event.shiftKey?'copy-names':'copy');
  else if(!ctrl&&!event.shiftKey&&key==='escape')run=()=>selectResults('none');
  else if(!ctrl&&!event.shiftKey&&key==='f5'&&current()?.enabled&&ready())run=refresh;
  else if(!ctrl&&!event.shiftKey&&key==='delete'&&selected.size)run=()=>action('trash');
  else if(!ctrl&&!event.shiftKey&&key==='f2'&&selected.size)run=renameItem;
  else if(!event.shiftKey&&key==='enter'&&selected.size&&!target.closest('button,a'))run=()=>action(ctrl?'bulk-locations':'bulk-open');
  else if(ctrl&&event.shiftKey&&key==='m'&&selected.size)run=()=>action('move');
  if(run){event.preventDefault();event.stopPropagation();void run();}
 }
 function init(options){
  callbacks=options;tag=window.settingsUI?.get().everythingSelectedTag??null;window.everythingWorkbench?.setup({key:'everything-rule',text:'everything-rule-text',mode:'everything-rule-mode',type:'everything-rule-type',blocked:()=>busy});window.everythingLayout?.init();$('everything-tracking-new').addEventListener('click',()=>editor());$('everything-tracking-edit').addEventListener('click',()=>editor(current()));$('everything-tracking-delete').addEventListener('click',remove);$('everything-tracking-refresh').addEventListener('click',refresh);
  for(const name of ['all','none','invert'])$('everything-tracking-select-'+name).addEventListener('click',()=>selectResults(name));
  for(const name of ['copy','copy-names','copy-folders','copy-table','favorite','rename','move','bulk-open','bulk-locations','trash'])$('everything-tracking-'+name).addEventListener('click',()=>action(name));
  $('everything-tracking-toggle-tools').addEventListener('click',()=>{if(callbacks?.isBusy?.())return;updateView({everythingToolsExpanded:window.settingsUI?.get().everythingToolsExpanded===false},true);});
  $('everything-tracking-selected-menu').addEventListener('click',event=>{if(!blocked()&&selected.size)rowMenu(event,[...selected][0]);});
  $('everything-tracking-columns').addEventListener('click',chooseColumns);$('everything-tracking-autosize').addEventListener('click',()=>{if(!blocked())window.everythingLayout?.autoSize();});
  $('everything-columns-cancel').addEventListener('click',()=>$('everything-columns-dialog').close());$('everything-columns-default').addEventListener('click',()=>{for(const check of $('everything-column-choices').querySelectorAll('input'))check.checked=check.value==='copy-action'||columns.DEFAULT_COLUMNS.includes(check.value);});$('everything-columns-save').addEventListener('click',()=>{const checked=[...$('everything-column-choices').querySelectorAll('input')].filter(check=>check.checked).map(check=>check.value);updateView({everythingColumns:columns.normalizeColumns(checked),everythingShowCopy:checked.includes('copy-action')});$('everything-columns-dialog').close();});
  $('everything-tracking-copy-query').addEventListener('click',copyQuery);$('everything-tracking-quick-settings').addEventListener('click',()=>window.settingsUI?.openCategory('floating'));$('everything-tracking-reset-widths').addEventListener('click',()=>window.everythingLayout?.reset());
  $('everything-tracking-results').addEventListener('contextmenu',event=>{if(event.target.closest('tr[data-index]'))return;event.preventDefault();if(!blocked())window.favoritesUI?.showMenu(event,[{label:'全選結果',run:()=>selectResults('all')},{label:'立即更新',disabled:!current()?.enabled||!ready(),run:refresh},{label:'新增追蹤搜尋',run:()=>editor()},{label:'還原欄寬與面板寬度',run:()=>window.everythingLayout?.reset()}]);});
  for(const key of Object.keys(columns.COLUMNS))$('everything-tracking-sort-'+key).parentElement.addEventListener('contextmenu',event=>columnMenu(event,key));
  $('everything-tracking-size-unit').addEventListener('change',event=>{if(!blocked())updateView({everythingSizeUnit:event.target.value});});
  $('everything-tracking-copy-header').addEventListener('contextmenu',event=>columnMenu(event,null));
  $('everything-tracking-rename-item').addEventListener('click',renameItem);
  $('everything-item-rename-form').addEventListener('submit',event=>{event.preventDefault();void saveItemName();});
  $('everything-item-rename-cancel').addEventListener('click',()=>{if(!busy)$('everything-item-rename-dialog').close();});
  $('everything-item-rename-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('everything-item-rename-dialog').addEventListener('close',()=>{renaming=null;});
  const help=$('everything-tracking-filter-help'),hint=$('everything-tracking-filter-hint'),helpWrap=help.parentElement;
  const showHint=()=>{hint.hidden=false;help.setAttribute('aria-expanded','true');},hideHint=()=>{hint.hidden=true;help.setAttribute('aria-expanded','false');};
  helpWrap.addEventListener('mouseenter',showHint);helpWrap.addEventListener('mouseleave',()=>{if(document.activeElement!==help)hideHint();});
  help.addEventListener('focus',showHint);help.addEventListener('blur',hideHint);help.addEventListener('click',showHint);
  help.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideHint();}});
  const filter=$('everything-tracking-filter');
  filter.addEventListener('input',()=>{if(blocked())return;resultFilters.set(currentId,filter.value);restoreSelection();$('everything-tracking-results').scrollTop=0;render();});
  $('everything-tracking-filter-clear').addEventListener('click',()=>{if(blocked())return;resultFilters.delete(currentId);restoreSelection();$('everything-tracking-results').scrollTop=0;render();filter.focus();});
  $('everything-tracking-panel').addEventListener('keydown',keydown);
  document.addEventListener?.('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f')keydown(event);});
  for(const key of Object.keys(columns.COLUMNS))$('everything-tracking-sort-'+key).addEventListener('click',()=>changeSort(key));
  for(const name of ['everything-tracking-interval','settings-everything-tracking-refresh'])$(name).addEventListener('change',()=>interval($(name)));
  $('everything-rule-form').addEventListener('submit',event=>{event.preventDefault();void save();});$('everything-rule-cancel').addEventListener('click',()=>{if(!busy)$('everything-tracking-dialog').close();});$('everything-tracking-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});$('everything-tracking-dialog').addEventListener('close',()=>{editing=null;});
  $('everything-tracking-pause').addEventListener('click',toggleTracking);
  $('everything-tag-form').addEventListener('submit',event=>{event.preventDefault();void saveTag();});
  $('everything-tag-name').addEventListener('input',()=>{$('everything-tag-error').textContent='';tagNote();});
  $('everything-tag-cancel').addEventListener('click',()=>{if(!busy)$('everything-tag-dialog').close();});
  $('everything-tag-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('everything-tag-dialog').addEventListener('close',()=>{tagEditing=null;});
  renderControls();api.onTrackingChanged(()=>{void load(false);});void load(active);
 }
 window.everythingTrackingUI={selection:()=>({kind:'tracking',id:currentId,token:current()?.snapshot?.token,indices:[...selected]}),init,activate,open,settingsChanged:()=>{if(updatingView)return;const value=window.settingsUI?.get().everythingSelectedTag??null;if(value!==tag){cancelInlineRename(false,false);tag=value;currentId=null;selected.clear();void load(active);}else if(renaming?.mode==='inline'){pendingLoad=true;renderControls();}else render();},select:id=>{cancelInlineRename(false,false);currentId=id;if(id)rememberQuery(id);rememberTag(null);restoreSelection();},render};
})();
