'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.productivityAPI,M=window.studioProductivity;
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const button=(label,task,cls='btn btn-ghost')=>{const el=node('button',label,cls);el.type='button';el.addEventListener('click',()=>{if(!busy)task();});return el;};
 let callbacks,busy=false,dirty=true,loaded=false,section='repair',state=null,repair=null,restore=null,suggestions=null,workFavorites=new Set(),workRecords=new Set(),refreshRequest=0,planning;
 const selectedTools={rules:null,worksets:null,snippets:null},snippetSelection=new Set(),backupSelection=new Set();const splitControls=[];let nativePreferences={toolSplitWidths:{}};
 const liveRecords=()=>state?.workspace.document.records.filter(record=>!record.deletedAt&&state.workspace.document.sheets.some(sheet=>sheet.id===record.sheetId&&!sheet.deletedAt))||[];
 const configuration=()=>({settings:window.settingsUI.get(),shortcuts:window.studioShortcuts.getBindings(),...callbacks.configuration()});
 function status(text,error=false,id='productivity-status'){
  const target=$(id);
  target.textContent=text;target.classList.toggle('error',error);
 }
 async function run(task,message){
  if(busy||callbacks.isBusy())return;
  const onPlanning=!$('planning-page').classList.contains('hidden');
  const target=onPlanning?'planning-status':'productivity-status';
  busy=true;status('處理中…',false,target);
  const disabled=[...$('productivity-page').querySelectorAll('button,input,textarea,select')].map(el=>[el,el.disabled]);
  disabled.forEach(([el])=>el.disabled=true);
  try{
   const result=await task();
   status(typeof message==='function'?message(result):(message||''),false,target);
   return result;
  }catch(error){
   status(String(error.message||error),true,target);callbacks.showFailure('操作未完成',error);
   return undefined;
  }finally{
   busy=false;disabled.forEach(([el,value])=>{if(el.isConnected)el.disabled=value;});updateActions();
  }
 }
 async function load(){const request=++refreshRequest,data=await api.get();if(request!==refreshRequest)return;state=data;loaded=true;dirty=false;render();}
 function show(value){
  if(value==='calendar'||value==='logs'){
   window.favoritesUI.show(value==='calendar'?'planning':'logs');
   return;
  }
  section=value;
  for(const item of $('productivity-nav').querySelectorAll('button'))item.setAttribute('aria-pressed',String(item.dataset.productivity===value));
  for(const panel of $('productivity-page').querySelectorAll('.productivity-panel'))panel.hidden=panel.id!=='productivity-'+value;
 }

 function options(id,items,empty='請選擇'){const select=$(id),old=select.value;select.replaceChildren();if(empty!==null){const option=node('option',empty);option.value='';select.append(option);}for(const item of items){const option=node('option',item.label);option.value=item.id;select.append(option);}if(items.some(item=>item.id===old))select.value=old;}
 function empty(root,text){if(!root.children.length)root.append(node('p',text,'productivity-empty'));}
 function render(){renderBackups();renderRules();renderSnippets();renderWorksets();renderWorkChoices();planning.update(state);updateActions();}
 function renderRepair(){const root=$('repair-list');root.replaceChildren();for(const row of repair?.rows||[]){const label=node('label',undefined,'productivity-check'),check=node('input');check.type='checkbox';check.dataset.key=row.key;check.disabled=!row.ready;check.checked=row.ready;const content=node('span',row.label);content.append(node('small',row.source+'\n→ '+row.destination+(row.error?'\n無法修復：'+row.error:'')));label.append(check,content);root.append(label);}empty(root,'沒有符合舊根路徑的連結。');updateActions();}
 function repairKeys(){return [...$('repair-list').querySelectorAll('input:checked')].map(el=>el.dataset.key);}
 function updateBackupSelection(){const valid=new Set(state?.backups.map(item=>item.name)||[]);for(const name of backupSelection)if(!valid.has(name))backupSelection.delete(name);$('backup-selection-count').textContent='已選 '+backupSelection.size+' 份';$('backup-export-selected').disabled=busy||!backupSelection.size;$('backup-delete-selected').disabled=busy||!backupSelection.size;const all=$('backup-select-all');all.checked=Boolean(valid.size)&&backupSelection.size===valid.size;all.indeterminate=backupSelection.size>0&&backupSelection.size<valid.size;}
 function renderBackups(){const root=$('backup-list');root.replaceChildren();$('backup-location').textContent='備份位置：'+(state.backupFolder||'資料目錄下的 profile-backups')+(state.backupScheduleLast?' · 最近排程備份 '+new Date(state.backupScheduleLast).toLocaleString():'');for(const backup of state.backups){const row=node('article',undefined,'backup-row'),check=node('input');check.type='checkbox';check.checked=backupSelection.has(backup.name);check.setAttribute('aria-label','選取備份 '+backup.name);check.addEventListener('change',()=>{check.checked?backupSelection.add(backup.name):backupSelection.delete(backup.name);updateBackupSelection();});const text=node('div');text.append(node('strong',backup.name),node('small',(backup.size/1024).toFixed(1)+' KB'));const actions=node('div',undefined,'productivity-actions');actions.append(button('預覽還原',()=>previewBackup(backup.name)),button('匯出',()=>run(()=>api.backupExport(backup.name),result=>result?.canceled?'已取消':'備份已匯出')));row.append(check,text,actions);root.append(row);}empty(root,'尚未建立完整備份。');updateBackupSelection();}
 async function previewBackup(name,filepath){await run(async()=>{restore=null;$('backup-preview').hidden=true;const value=await api.backupPreview(name,filepath);if(value.canceled)return;restore=value;$('backup-summary').textContent=value.label+' ／ '+new Date(value.createdAt).toLocaleString()+'\n'+value.warning;const root=$('backup-counts');root.replaceChildren();const labels={records:'工作區紀錄',favorites:'收藏',reminders:'提醒',views:'儲存檢視',rules:'整理規則',worksets:'情境工作集',snippets:'文字片段'};for(const [key,counts] of Object.entries(value.counts))root.append(node('p',labels[key]+'：'+counts[0]+' → '+counts[1]));$('backup-preview').hidden=false;},'請核對還原前後數量。');}
 async function applyRestored(value){const entries={'brs-settings-v1':value.settings,'bfs-shortcuts-v1':value.shortcuts,'brs-presets-v1':value.naming.presets,'brs-rules-v1':value.naming.activeRules},previous=Object.fromEntries(Object.keys(entries).map(key=>[key,localStorage.getItem(key)]));try{for(const [key,data] of Object.entries(entries))localStorage.setItem(key,JSON.stringify(data));await api.ackRestored();}catch(error){for(const [key,data] of Object.entries(previous))try{if(data===null)localStorage.removeItem(key);else localStorage.setItem(key,data);}catch{/* The durable pending settings remain available for the next startup. */}throw new Error('資料已還原，但介面設定尚未套用。請重新啟動重試：'+error.message);}window.location.reload();}
 function clearRule(){selectedTools.rules=null;$('rule-form').dataset.dirty='false';for(const id of ['id','name','extensions','contains','after','before','prefix','tags','folder'])$(id==='prefix'?'organize-prefix':'rule-'+id).value='';}
 function editRule(rule){if(busy)return;for(const key of ['id','name','extensions','contains','after','before','prefix','folder'])$(key==='prefix'?'organize-prefix':'rule-'+key).value=rule[key];$('rule-tags').value=rule.tags.join(', ');$('rule-name').focus();}
 function renderRules(){const root=$('rule-list');root.replaceChildren();for(const rule of state.data.rules.filter(rule=>(rule.name+' '+rule.extensions+' '+rule.contains+' '+rule.folder).toLocaleLowerCase().includes(($('rules-master-query')?.value||'').toLocaleLowerCase()))){const item=button(rule.name,()=>{if(!discard('rules'))return;selectedTools.rules=rule.id;editRule(rule);renderRules();},'tool-master-item');item.setAttribute('aria-current',String(selectedTools.rules===rule.id));item.append(node('small',[rule.extensions||'全部副檔名',rule.contains||'全部名稱'].join(' · ')));root.append(item);}empty(root,'新增規則後，先預覽建議，再選擇套用動作。');options('rule-select',state.data.rules.map(rule=>({id:rule.id,label:rule.name})));}
 function renderSuggestions(){const root=$('rule-results');root.replaceChildren();for(const row of suggestions?.rows||[]){const label=node('label',undefined,'productivity-check'),check=node('input');check.type='checkbox';check.checked=row.matched;check.disabled=!row.matched;check.dataset.path=row.source;const content=node('span',row.name);content.append(node('small',row.source+'\n'+(row.error?'無法處理：'+row.error:row.matched?'→ '+row.destination+'\n標籤：'+(row.tags.join('、')||'無'):'不符合條件')));label.append(check,content);root.append(label);}updateActions();}
 function rulePaths(){return [...$('rule-results').querySelectorAll('input:checked')].map(el=>el.dataset.path);}
 async function ruleAction(action){const result=await run(()=>api.rulesAction(suggestions.token,rulePaths(),action),action==='tag'?value=>'已新增收藏 '+value.added+' 項、更新現有收藏 '+value.existing+' 項'+(value.issues.length?'；未完成：'+value.issues.join('；'):''):undefined);if(!result)return;if(action==='tag'){suggestions=null;renderSuggestions();await run(load);}else if(action==='rename'){if(!result.prefix){status('此規則沒有設定檔名前綴。',true);return;}try{await callbacks.rename(result.paths,result.prefix);}catch(error){callbacks.showFailure('無法開啟改名工具',error);}}else{try{await window.movingUI.start(result.paths,{sourceLabel:'整理規則建議',targetFolder:result.folder});status('請在搬移視窗選擇或核對目標：'+(result.folder||'尚未設定'));}catch(error){callbacks.showFailure('無法開啟搬移工具',error);}}}
 function clearWorkset(){selectedTools.worksets=null;$('workset-paths').value='';$('workset-form').dataset.dirty='false';workFavorites.clear();workRecords.clear();$('workset-id').value='';$('workset-name').value='';$('workset-query').value='';renderWorkChoices();}
 function renderWorkChoices(){if(!state)return;const query=$('workset-query').value.toLocaleLowerCase(),sheets=new Map(state.workspace.document.sheets.map(sheet=>[sheet.id,sheet.name]));for(const [id,items,selected] of [['workset-favorites',state.favorites.map(value=>({id:value.id,label:(value.label||value.path),detail:value.status==='ready'?'收藏位置':value.reason})),workFavorites],['workset-records',liveRecords().map(value=>({id:value.id,label:value.title,detail:sheets.get(value.sheetId)})),workRecords]]){const root=$(id),filtered=items.filter(value=>(value.label+' '+value.detail).toLocaleLowerCase().includes(query));root.replaceChildren();for(const item of filtered.slice(0,100)){const label=node('label'),check=node('input');check.type='checkbox';check.checked=selected.has(item.id);check.addEventListener('change',()=>{if(check.checked)selected.add(item.id);else selected.delete(item.id);$('workset-count').textContent='已選 '+workFavorites.size+' 個收藏、'+workRecords.size+' 筆紀錄';});label.append(check,node('span',item.label),node('small',item.detail));root.append(label);}if(filtered.length>100)root.append(node('p','顯示前 100 項，請搜尋縮小範圍。','notes-hint'));empty(root,'沒有符合條件的項目。');}$('workset-count').textContent='已選 '+workFavorites.size+' 個收藏、'+workRecords.size+' 筆紀錄（最多 20 個收藏、100 筆紀錄）';}
 function openRecord(id){if(busy)return;window.notesUI.openSearchTarget('record',id).catch(error=>callbacks.showFailure('無法開啟紀錄',error));}
 function selectWorkset(value){if(!discard('worksets'))return;selectedTools.worksets=value.id;workFavorites=new Set(value.favoriteIds);workRecords=new Set(value.recordIds);$('workset-id').value=value.id;$('workset-name').value=value.name;$('workset-paths').value=(value.paths||[]).join('\n');renderWorkChoices();renderWorksets();}
 function renderWorksets(){const root=$('workset-list');root.replaceChildren();for(const value of state.data.worksets.filter(value=>(value.name+' '+(value.paths||[]).join(' ')).toLocaleLowerCase().includes(($('worksets-master-query')?.value||'').toLocaleLowerCase()))){const item=button(value.name,()=>selectWorkset(value),'tool-master-item');item.setAttribute('aria-current',String(selectedTools.worksets===value.id));item.append(node('small',value.favoriteIds.length+(value.paths?.length||0)+' 個位置 · '+value.recordIds.length+' 筆紀錄'));root.append(item);}empty(root,'新增工作集，集中開啟同一項工作的資料。');const detail=$('workset-detail');if(!detail)return;detail.replaceChildren();const value=state.data.worksets.find(item=>item.id===selectedTools.worksets);if(!value)return;detail.append(node('h3',value.name+' · 已儲存內容'),button('開啟工作集',async()=>{const result=await run(()=>api.worksetOpen(value.id),result=>result.canceled?'已取消':'已開啟 '+result.opened+' 個位置'+(result.failures.length?'；'+result.failures.join('；'):''));if(result?.recordId)openRecord(result.recordId);},'btn btn-primary'),button('刪除工作集',()=>remove('worksets',value.id)));for(const id of value.recordIds){const record=liveRecords().find(record=>record.id===id);detail.append(record?button('▦ '+record.title,()=>openRecord(id)):node('p','紀錄已移除'));}for(const path of value.paths||[])detail.append(node('p',path));for(const id of value.favoriteIds){const favorite=state.favorites.find(item=>item.id===id);detail.append(node('p',favorite?(favorite.label||favorite.path)+(favorite.status==='ready'?'':'（暫時無法使用）'):'收藏已移除'));}}
 function clearSnippet(){selectedTools.snippets=null;$('snippet-form').dataset.dirty='false';window.shortcutControls.set($('snippet-shortcut'),'');for(const key of ['id','name','category','body'])$('snippet-'+key).value='';}
 function selectSnippet(value){if(!discard('snippets'))return;selectedTools.snippets=value.id;for(const key of ['id','name','category','body'])$('snippet-'+key).value=value[key];window.shortcutControls.set($('snippet-shortcut'),value.shortcut);renderSnippets();}
 function renderSnippets(){const root=$('snippet-list'),query=$('snippet-query').value.toLocaleLowerCase();for(const id of snippetSelection)if(!state.data.snippets.some(item=>item.id===id))snippetSelection.delete(id);root.replaceChildren();const rows=state.data.snippets.filter(value=>(value.name+' '+value.category+' '+value.body).toLocaleLowerCase().includes(query)).sort((a,b)=>a.category.localeCompare(b.category,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant'));let category=null;for(const value of rows){if(category!==value.category){category=value.category;root.append(node('h3',category||'未分類','tool-category'));}const row=node('div',undefined,'tool-master-row'),check=node('input');check.type='checkbox';check.checked=snippetSelection.has(value.id);check.setAttribute('aria-label','選取 '+value.name);check.addEventListener('change',()=>{if(check.checked)snippetSelection.add(value.id);else snippetSelection.delete(value.id);updateSnippetBulk();});const item=button(value.name,()=>selectSnippet(value),'tool-master-item');item.setAttribute('aria-current',String(selectedTools.snippets===value.id));item.title=value.body;item.append(node('small',M.expandSnippet(value.body,{customer:$('snippet-customer').value}).slice(0,70)));row.append(check,item);root.append(row);}empty(root,'新增文字片段，或調整搜尋條件。');const detail=$('snippet-detail');if(detail){detail.replaceChildren();const value=state.data.snippets.find(item=>item.id===selectedTools.snippets);if(value)detail.append(button('複製已儲存內容',()=>run(()=>api.snippetCopy(value.id,$('snippet-customer').value),'已複製文字片段'),'btn btn-secondary'),button('刪除此片段',()=>remove('snippets',value.id)));}updateSnippetBulk();}
 async function remove(kind,id){if(!window.confirm('確定刪除此項目？'))return;await run(async()=>{await api.remove(kind,id);await load();},'已刪除。');}
 async function moveCard(id,fieldId,value){
  await run(async()=>{await api.boardMove(id,fieldId,value,state.workspace.revision);await load();},'狀態已更新。');
 }
 async function showPreview(value){if(!value||value.canceled)return;if(value.opened||value.type==='pdf'){status('已開啟 PDF 預覽視窗：'+value.name);return;}$('document-preview-title').textContent=value.name;$('document-preview-path').textContent=value.path;const root=$('document-preview-content');root.replaceChildren();if(value.type==='image'){const image=node('img');image.alt=value.name;image.addEventListener('error',()=>root.replaceChildren(node('p','此圖片無法解碼，請確認格式與檔案是否完整。')));image.src=value.data;root.append(image);}else root.append(node('pre',value.text));$('document-preview-dialog').showModal();}
 function updateActions(){const hasRepair=Boolean(repair?.rows.some(row=>row.ready));$('repair-select').disabled=busy||!hasRepair;$('repair-apply').disabled=busy||!hasRepair||!repairKeys().length;for(const action of ['tag','rename','move'])$('rule-'+action).disabled=busy||!suggestions||!rulePaths().length;$('backup-restore').disabled=busy||!restore;if(state)updateBackupSelection();}
 let logView,pendingLogs;
 function openLogs(reset=false){
  const config=pendingLogs||{kind:'logs'};
  pendingLogs=null;
  if(!reset&&logView&&config.sheetId===undefined){logView.refresh();return;}
  logView?.dispose();
  logView=window.toolViewsUI?.mount($('logs-page'),{
   data:filters=>api.viewData(config,filters),
   clearScope:config.sheetId?()=>openLogs(true):null,
   action:(_,id)=>window.notesUI.openSearchTarget('record',id)
  },config);
 }
 function snippetPicker(target,customer=()=>''){
  const details=node('details',undefined,'snippet-picker');
  details.append(node('summary','插入常用文字片段'));
  const list=node('select');list.setAttribute('aria-label','選擇常用文字片段');
  const feedback=node('small');feedback.setAttribute('role','status');
  const insert=button('插入',async()=>{
   const id=list.value;if(!id)return;
   const start=target.selectionStart??target.value.length,end=target.selectionEnd??start;
   const previous=target.value;insert.disabled=true;
   try{
    const value=await api.snippetText(id,customer());
    if(!details.isConnected||!details.open||!target.isConnected||target.value!==previous)throw new Error('欄位已變更，請重新插入');
    if(target.maxLength>=0&&previous.length-(end-start)+value.length>target.maxLength)throw new Error('插入後會超過欄位字數上限');
    target.setRangeText(value,start,end,'end');
    target.dispatchEvent(new Event('input',{bubbles:true}));
    target.focus();feedback.textContent='已插入文字片段';
   }catch(error){feedback.textContent=error.message;}finally{insert.disabled=!list.value;}
  });
  const copy=button('開啟浮動片段',()=>window.desktopAPI.openFloatingPanel('snippets').catch(error=>feedback.textContent=error.message));
  insert.disabled=true;
  details.append(list,insert,copy,feedback);
  list.addEventListener('change',()=>insert.disabled=!list.value);
  details.addEventListener('toggle',async()=>{
   if(!details.open)return;
   try{
    const rows=await api.snippetList(),previous=list.value;
    list.replaceChildren();
    const hint=node('option',rows.length?'選擇文字片段…':'尚未建立文字片段');hint.value='';list.append(hint);
    for(const item of rows){const option=node('option',[item.category,item.name].filter(Boolean).join(' ／ '));option.value=item.id;list.append(option);}
    list.value=rows.some(item=>item.id===previous)?previous:'';insert.disabled=!list.value;
   }catch(error){feedback.textContent=error.message;}
  });
  return details;
 }
 function previewRules(dropped){return run(async()=>{suggestions=null;renderSuggestions();if(!$('rule-select').value)throw new Error('請先選擇整理規則');const paths=dropped??await api.rulesChoose();if(!paths.length)return;suggestions=await api.rulesPreview($('rule-select').value,paths);renderSuggestions();},'已產生建議，確認後才套用。');}
 function discard(kind){const form=$({rules:'rule-form',worksets:'workset-form',snippets:'snippet-form'}[kind]);if(form.dataset.dirty==='true'&&!window.confirm('放棄尚未儲存的修改並切換項目？'))return false;form.dataset.dirty='false';return true;}
 function updateSnippetBulk(){if($('snippet-selected-count'))$('snippet-selected-count').textContent='已選 '+snippetSelection.size+' 項';}
 function setupToolSplits(){
  const splits=splitControls;
  for(const [kind,listId,formId] of [['rules','rule-list','rule-form'],['worksets','workset-list','workset-form'],['snippets','snippet-list','snippet-form']]){
   const panel=$('productivity-'+kind),list=$(listId),form=$(formId),layout=node('div',undefined,'tool-split'),master=node('aside',undefined,'tool-master'),detail=node('div',undefined,'tool-detail');
   const children=[...panel.children],description=children.find(item=>item.tagName==='P');
   for(const child of children){if(child===list||child===description||child.tagName==='H2'||child.classList.contains('tool-view-heading'))continue;detail.append(child);}
   const listHeader=node('div',undefined,'tool-master-header');listHeader.append(node('strong','已儲存項目'),button('＋ 新增',()=>{if(!discard(kind))return;if(kind==='rules'){clearRule();renderRules();}else if(kind==='worksets'){clearWorkset();renderWorksets();}else{clearSnippet();renderSnippets();}form.querySelector('input:not([type=hidden])')?.focus();}));master.append(listHeader);if(kind!=='snippets'){const search=node('input');search.id=kind+'-master-query';search.type='search';search.placeholder='搜尋名稱或位置';search.setAttribute('aria-label','搜尋已儲存項目');search.addEventListener('input',()=>kind==='rules'?renderRules():renderWorksets());master.append(search);}master.append(list);layout.append(master,detail);panel.append(layout);
   if(kind==='snippets'){
    const query=$('snippet-query').closest('.productivity-fields');master.prepend(query);
    const bulk=node('div',undefined,'snippet-bulk');const all=button('全選搜尋結果',()=>{const text=$('snippet-query').value.toLocaleLowerCase();for(const item of state.data.snippets)if((item.name+' '+item.category+' '+item.body).toLocaleLowerCase().includes(text))snippetSelection.add(item.id);renderSnippets();});
    const category=node('input');category.id='snippet-bulk-category';category.maxLength=60;category.placeholder='批次分類名稱';category.setAttribute('aria-label','批次分類名稱');
    const apply=action=>run(async()=>{const ids=[...snippetSelection];if(!ids.length)throw new Error('請先選取文字片段');if(action==='delete'&&!window.confirm('刪除選取的 '+ids.length+' 個文字片段？'))return;await api.snippetsBulk(ids,action,category.value);snippetSelection.clear();if(action==='delete')clearSnippet();await load();},'批次操作已完成');
    bulk.append(all,button('取消選取',()=>{snippetSelection.clear();renderSnippets();}),node('span','','notes-hint'),category,button('套用分類',()=>apply('category')),button('刪除所選',()=>apply('delete')));bulk.children[2].id='snippet-selected-count';master.insertBefore(bulk,list);
    const actions=node('div',undefined,'productivity-actions');actions.id='snippet-detail';detail.prepend(actions);
   }else if(kind==='worksets'){const actions=node('div',undefined,'productivity-card');actions.id='workset-detail';detail.append(actions);}
   else{const removeButton=button('刪除目前規則',()=>{if($('rule-id').value)remove('rules',$('rule-id').value);});form.append(removeButton);}
   form.addEventListener('input',()=>form.dataset.dirty='true');
   splits.push([kind,window.resizableSplit.attach(layout,{width:250,save:async width=>{const widths={...(await window.desktopAPI.get()).toolSplitWidths,[kind]:width};nativePreferences.toolSplitWidths=widths;await window.desktopAPI.configure({toolSplitWidths:widths});}})]);
  }
  window.desktopAPI.get().then(prefs=>{nativePreferences=prefs;for(const [kind,split] of splits)split.set(prefs.toolSplitWidths?.[kind]||250);}).catch(()=>{});
 }
 function init(config){callbacks=config;setupToolSplits();window.shortcutControls.bind($('snippet-shortcut'));
  $('tab-planning')?.addEventListener('click',()=>window.favoritesUI.show('planning'));
  $('tab-logs')?.addEventListener('click',()=>window.favoritesUI.show('logs'));
  for(const [id,kind] of [['planning-overlay','planning'],['snippets-overlay','snippets']]){
   $(id)?.addEventListener('click',()=>window.desktopAPI.openFloatingPanel(kind).catch(error=>callbacks.showFailure('無法開啟浮動工具',error)));
  }
  api.onToolOpen?.(config=>{
   const page=config.kind==='snippets'?'productivity':config.kind;
   if(config.kind==='logs')pendingLogs=config;
   if(!window.favoritesUI.show(page)){
    pendingLogs=null;
    callbacks.showFailure('請先完成目前操作','原有輸入已保留');
    return;
   }
   if(config.kind==='snippets')show('snippets');
  });
$('tab-productivity').addEventListener('click',()=>window.favoritesUI.show('productivity'));$('productivity-nav').addEventListener('click',event=>{const target=event.target.closest('[data-productivity]');if(target)show(target.dataset.productivity);});$('productivity-refresh').addEventListener('click',()=>run(load,'已重新整理。'));
  const drop=window.studioFileDrop;
  const setFolder=id=>paths=>run(async()=>{
   $(id).value=await api.folder(drop.single(paths));
   $(id).dispatchEvent(new Event('input',{bubbles:true}));
  });
  for(const [zone,input] of [['repair-from','repair-from'],['repair-to','repair-to'],['repair-folder','repair-to'],['rule-folder','rule-folder'],['rule-pick-folder','rule-folder']])drop?.bind(zone,setFolder(input));
  drop?.bind('rule-preview',previewRules);drop?.bind('workset-paths',paths=>{const list=[...new Set([...$('workset-paths').value.split(/\r?\n/).filter(Boolean),...paths])];$('workset-paths').value=list.join('\n');$('workset-paths').dispatchEvent(new Event('input',{bubbles:true}));});
  drop?.bind('productivity-preview',async paths=>showPreview(await run(()=>api.previewChoose(drop.single(paths)))));
  drop?.bind('backup-import',paths=>previewBackup(undefined,drop.single(paths)));
  $('repair-folder').addEventListener('click',()=>run(async()=>{const value=await api.folder();if(value)$('repair-to').value=value;}));$('repair-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{repair=null;$('repair-list').replaceChildren();repair=await api.repairPreview($('repair-from').value,$('repair-to').value);renderRepair();},value=>'請核對新舊位置後勾選修復項目。');});for(const id of ['repair-from','repair-to'])$(id).addEventListener('input',()=>{repair=null;$('repair-list').replaceChildren();updateActions();});$('repair-select').addEventListener('click',()=>{for(const check of $('repair-list').querySelectorAll('input'))check.checked=!check.disabled;updateActions();});$('repair-list').addEventListener('change',updateActions);$('repair-apply').addEventListener('click',()=>run(async()=>{const result=await api.repairApply(repair.token,repairKeys(),configuration());if(!result.canceled){repair=null;$('repair-list').replaceChildren();await load();}return result;},result=>result.canceled?'已取消':'已修復 '+result.updated+' 項；修復前備份已保留。'));
  $('backup-open-folder').addEventListener('click',()=>run(()=>api.backupOpenFolder(),'已開啟備份資料夾。'));
  $('backup-select-all').addEventListener('change',()=>{backupSelection.clear();if($('backup-select-all').checked)for(const item of state.backups)backupSelection.add(item.name);renderBackups();});
  $('backup-export-selected').addEventListener('click',()=>run(()=>api.backupExportMany([...backupSelection]),result=>result.canceled?'已取消':'已匯出 '+result.count+' 份備份'+(result.failures.length?'；'+result.failures.join('；'):'')));
  $('backup-delete-selected').addEventListener('click',()=>run(async()=>{const result=await api.backupDelete([...backupSelection]);if(!result.canceled){backupSelection.clear();await load();}return result;},result=>result.canceled?'已取消':'已刪除 '+result.count+' 份備份'+(result.failures.length?'；'+result.failures.join('；'):'')));
  $('backup-create').addEventListener('click',()=>run(async()=>{const result=await api.backupCreate(configuration());await load();return result;},'完整備份已建立。'));$('backup-import').addEventListener('click',()=>previewBackup());$('backup-cancel').addEventListener('click',()=>{restore=null;$('backup-preview').hidden=true;updateActions();});$('backup-restore').addEventListener('click',()=>run(async()=>{const result=await api.backupRestore(restore.token,configuration());if(!result.canceled)await applyRestored(result.ui);return result;},result=>result.canceled?'已取消':'還原完成，正在重新載入。'));
  $('rule-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{const input={};for(const key of ['id','name','extensions','contains','after','before','prefix','folder'])input[key]=$(key==='prefix'?'organize-prefix':'rule-'+key).value;input.tags=$('rule-tags').value.split(/[,，]/).map(value=>value.trim()).filter(Boolean);await api.save('rules',input);clearRule();suggestions=null;renderSuggestions();await load();},'規則已儲存。');});$('rule-new').addEventListener('click',clearRule);$('rule-pick-folder').addEventListener('click',()=>run(async()=>{const value=await api.folder();if(value)$('rule-folder').value=value;}));$('rule-preview').addEventListener('click',()=>previewRules());$('rule-select').addEventListener('change',()=>{suggestions=null;renderSuggestions();});$('rule-results').addEventListener('change',updateActions);for(const action of ['tag','rename','move'])$('rule-'+action).addEventListener('click',()=>ruleAction(action));
  $('workset-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{if(!workFavorites.size&&!workRecords.size&&!$('workset-paths').value.trim())throw new Error('請至少選取一個收藏或紀錄');const result=await api.save('worksets',{id:$('workset-id').value,name:$('workset-name').value,favoriteIds:[...workFavorites],recordIds:[...workRecords],paths:$('workset-paths').value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)});clearWorkset();await load();const saved=state.data.worksets.find(item=>item.id===result.worksets.at(-1)?.id);if(saved)selectWorkset(saved);},'工作集已儲存。');});$('workset-query').addEventListener('input',renderWorkChoices);$('workset-new').addEventListener('click',()=>{if(discard('worksets')){clearWorkset();renderWorksets();}});
  $('snippet-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{const result=await api.save('snippets',{id:$('snippet-id').value,name:$('snippet-name').value,category:$('snippet-category').value,body:$('snippet-body').value,shortcut:window.shortcutControls.get($('snippet-shortcut'))});clearSnippet();await load();const saved=state.data.snippets.find(item=>item.id===result.snippets.at(-1)?.id);if(saved)selectSnippet(saved);},'文字片段已儲存。');});$('snippet-new').addEventListener('click',()=>{if(discard('snippets')){clearSnippet();renderSnippets();}});$('snippet-query').addEventListener('input',renderSnippets);$('snippet-customer').addEventListener('input',renderSnippets);
  planning=window.planningView.init({openRecord,moveCard,isBusy:()=>busy||callbacks.isBusy()});
  $('document-choose').addEventListener('click',async()=>showPreview(await run(()=>api.previewChoose())));$('document-preview-close').addEventListener('click',()=>$('document-preview-dialog').close());$('document-preview-dialog').addEventListener('close',()=>$('document-preview-content').replaceChildren());
  let logSettings;
  const backupTick=async()=>{if(busy||callbacks.isBusy()||!api.backupTick)return;try{const value=await api.backupTick(configuration());if(value.created){dirty=true;if(section==='backup'&&!$('productivity-page').classList.contains('hidden'))await run(load,'已完成定時備份。');}}catch(error){status('定時備份未完成：'+String(error.message||error),true);}};
  setInterval(()=>void backupTick(),60000);void backupTick();
  window.desktopAPI.onChanged(({settings})=>{
   if(!settings)return;
   nativePreferences=settings;for(const [kind,split] of splitControls)split.set(settings.toolSplitWidths?.[kind]||250);if(state){state.preferences=settings;planning?.update(state);}
   const next=JSON.stringify(settings.logView);
   if(next!==logSettings)logView?.refresh();
   logSettings=next;
  });
  const changed=()=>{
   dirty=true;
   if(!$('logs-page')?.classList.contains('hidden'))logView?.refresh();
   if(!busy&&$('planning-page')&&!$('planning-page').classList.contains('hidden'))run(load);
  };window.favoritesAPI.onChanged(changed);window.workspaceAPI.onChanged(changed);window.remindersAPI.onChanged(changed);api.restoredUI().then(value=>{if(value)return applyRestored(value);}).catch(error=>{status('資料已還原，但介面設定待套用：'+error.message,true);});
 }
 window.productivityUI=Object.freeze({init,openLogs,snippetPicker,openSection:tool=>{if(Object.hasOwn(window.quickActionsModel.TOOLS,tool)&&window.favoritesUI.show('productivity'))show(tool);},canLeave:()=>!busy,activate:()=>{if(!loaded||dirty)return run(load);},previewLink:async(recordId,index)=>showPreview(await run(()=>api.previewLink(recordId,index)))});
})();
