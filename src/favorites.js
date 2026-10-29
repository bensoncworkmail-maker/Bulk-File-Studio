'use strict';
(() => {
  const api=window.favoritesAPI;
  const {paginate}=window.studioPagination;
  const $=id=>document.getElementById(id);
  const collator=new Intl.Collator('zh-Hant',{numeric:true,sensitivity:'base'});
  const basename=filepath=>filepath.split(/[\\/]/).filter(Boolean).pop()||filepath;
  const labels={ready:'可使用',missing:'找不到位置',replaced:'檔案可能已替換',unavailable:'無法存取'};
  let items=[],selected=new Set(),activeTag=null,active=false,busy=false,loaded=false,revision=0;
  let settingsActive=false,pageIndex=0;
  let openingIds=[],callbacks,editingIds=[],removingIds=[],pendingLink=null,contextState=null;
  const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  function button(text,handler,className='btn btn-ghost') {
    const el=node('button',className,text);el.type='button';el.addEventListener('click',handler);return el;
  }
  function setView(view) {
    if(callbacks?.isBusy())return;
    active=view==='favorites';settingsActive=view==='settings'||view==='info';closeMenu();
    $('info-page').classList.toggle('hidden',view!=='info');$('tab-info').classList.toggle('active',view==='info');$('tab-info').setAttribute('aria-pressed',String(view==='info'));
    $('btn-undo').classList.toggle('hidden',settingsActive);
    $('favorites-page').classList.toggle('hidden',!active);
    $('settings-page').classList.toggle('hidden',view!=='settings');
    for(const id of ['rename-intro','rename-workspace','rename-footer','btn-export','btn-favorite-selected'])$(id).classList.toggle('hidden',active||settingsActive);
    $('tab-favorites').classList.toggle('active',active);$('tab-rename').classList.toggle('active',!active&&!settingsActive);$('tab-settings').classList.toggle('active',view==='settings');
    $('tab-favorites').setAttribute('aria-pressed',String(active));$('tab-rename').setAttribute('aria-pressed',String(!active&&!settingsActive));$('tab-settings').setAttribute('aria-pressed',String(view==='settings'));
    if(settingsActive)window.settingsUI.refreshInfo();
    $('drop-overlay').querySelector('strong').textContent=active?'放開以收藏位置':'放開以加入檔案';
  }
  function visibleItems() {
    const search=$('favorite-search').value.trim().toLocaleLowerCase(),type=$('favorite-type').value,status=$('favorite-status').value;
    const result=items.filter(item=>(activeTag===null || (activeTag===''?!item.tags.length:item.tags.some(tag=>tag.toLocaleLowerCase()===activeTag))) &&
      (type==='all'||item.type===type) && (status==='all'||(status==='ready'?item.status==='ready':item.status!=='ready')) &&
      (!search||[item.label,basename(item.path),item.path,...item.tags].some(text=>text.toLocaleLowerCase().includes(search))));
    const sort=$('favorite-sort').value;
    return result.sort((a,b)=>sort==='recent'?(b.createdAt.localeCompare(a.createdAt)||collator.compare(a.path,b.path)):
      collator.compare(sort==='path'?a.path:(a.label||basename(a.path)),sort==='path'?b.path:(b.label||basename(b.path))));
  }
  function renderTags() {
    const container=$('favorite-tags');container.replaceChildren();
    const tags=new Map();
    for(const item of items)for(const tag of item.tags){const key=tag.toLocaleLowerCase();const prior=tags.get(key);tags.set(key,{name:prior?.name||tag,count:(prior?.count||0)+1});}
    if(activeTag && !tags.has(activeTag))activeTag=null;
    const definitions=[{key:null,name:'全部收藏',count:items.length},{key:'',name:'未分類',count:items.filter(item=>!item.tags.length).length},
      ...[...tags.entries()].sort((a,b)=>collator.compare(a[1].name,b[1].name)).map(([key,value])=>({key,...value}))];
    for(const tag of definitions){
      const el=button('',()=>{activeTag=tag.key;pageIndex=0;render();},'favorite-tag-filter'+(activeTag===tag.key?' active':''));
      el.setAttribute('aria-pressed',String(activeTag===tag.key));el.append(node('span','',tag.name),node('span','count-pill',String(tag.count)));container.appendChild(el);
    }
  }
  function render() {
    if(!callbacks)return;
    renderTags();
    const filtered=visibleItems(),page=paginate(filtered,pageIndex,window.settingsUI.get().pageSize),visible=page.rows,visibleIds=new Set(visible.map(item=>item.id));
    pageIndex=page.page;$('favorite-page-info').textContent=`${page.page+1} / ${page.pageCount}`;
    $('favorite-page-prev').disabled=busy||!page.hasPrevious;$('favorite-page-next').disabled=busy||!page.hasNext;
    const hiddenCount=[...selected].filter(id=>!visibleIds.has(id)).length;
    $('favorite-count').textContent=loaded?items.length:'—';
    $('favorite-selection-count').textContent=selected.size?`已選取 ${selected.size} 項${hiddenCount?`（${hiddenCount} 項目前未顯示）`:''}`:'尚未選取';
    for(const id of ['btn-fav-open','btn-fav-copy','btn-fav-move','btn-fav-edit','btn-fav-remove','btn-fav-rename','btn-fav-select-none'])$(id).disabled=busy||!loaded||!selected.size;
    $('btn-fav-select-all').disabled=busy||!loaded||!visible.length;
    for(const id of ['btn-fav-add-files','btn-fav-add-folders','btn-fav-refresh'])$(id).disabled=busy;
    const container=$('favorite-list');container.replaceChildren();
    if(!visible.length){
      container.appendChild(node('div','list-empty',!loaded?'無法載入收藏；請重新整理。原資料不會被清空。':items.length?'沒有符合條件的收藏。':'尚未收藏任何位置。加入檔案或資料夾，或把項目拖放到此頁。'));
    }
    for(const item of visible) {
      const row=node('div','favorite-row');
      const check=node('input');check.type='checkbox';check.checked=selected.has(item.id);check.disabled=busy;
      check.setAttribute('aria-label','選取 '+(item.label||basename(item.path)));
      check.addEventListener('change',()=>{if(check.checked)selected.add(item.id);else selected.delete(item.id);render();});
      const content=node('div','favorite-name-cell');
      const icon=node('span','favorite-row-icon',item.type==='folder'?'▱':'▤');
      const name=button(item.label||basename(item.path),()=>{},'favorite-name');name.disabled=busy||item.status!=='ready';
      name.addEventListener('dblclick',()=>open(item));name.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();open(item);}});name.title=item.path;content.append(icon,name);
      let location=item.path.replace(/[\\/][^\\/]+$/,'')||'/';if(/^[A-Za-z]:$/.test(location))location+='\\';
      const locationButton=button(location,()=>{},'favorite-location');locationButton.title=item.path;locationButton.disabled=busy||item.status!=='ready';
      locationButton.addEventListener('dblclick',()=>run(()=>api.show(item.id)));locationButton.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run(()=>api.show(item.id));}});
      const badges=node('div','favorite-badges');
      for(const tag of item.tags)badges.appendChild(button(tag,()=>{activeTag=tag.toLocaleLowerCase();pageIndex=0;render();},'favorite-badge'));
      if(!item.tags.length)badges.appendChild(node('span','favorite-badge','未分類'));
      const status=node('div','favorite-status'+(item.status==='ready'?'':' problem'),`${item.type==='folder'?'資料夾':'檔案'} · ${labels[item.status]||'需要處理'}`);status.title=item.reason||'';
      const actions=node('div','favorite-row-actions');
      const more=button('⋯',event=>showItemMenu(event,item));more.disabled=busy;more.setAttribute('aria-label','更多操作：'+(item.label||basename(item.path)));
      actions.append(more);row.append(check,content,locationButton,badges,status,actions);
      row.classList.toggle('selected',selected.has(item.id));
      row.addEventListener('click',event=>{if(busy||event.target.closest('input,button'))return;if(!event.ctrlKey&&!event.metaKey)selected.clear();if(selected.has(item.id))selected.delete(item.id);else selected.add(item.id);render();});
      row.addEventListener('contextmenu',event=>{event.preventDefault();if(!busy){if(!selected.has(item.id)){selected=new Set([item.id]);render();}showItemMenu(event,item);}});
      container.appendChild(row);
    }
    $('favorite-results').textContent=`顯示 ${page.start}–${page.end} / ${filtered.length} 項 · 共 ${items.length} 項，${items.filter(item=>item.status!=='ready').length} 項需處理`;
  }
  async function refresh() {
    const request=++revision;
    try {
      const result=await api.list();
      if(result.activate)setView('favorites');
      if(request!==revision)return;
      items=result.items;loaded=true;
      selected=new Set([...selected].filter(id=>items.some(item=>item.id===id)));render();
      if(result.notice){callbacks.showToast(result.notice.message);if(result.notice.issues.length)callbacks.showFailure('部分右鍵收藏未完成',result.notice.issues.join('\n'));}
    } catch(e) {if(request===revision){loaded=false;render();callbacks.showFailure('無法讀取收藏',e);}}
  }
  async function run(task,refreshAfter=false) {
    if(busy)return;
    busy=true;render();closeMenu();
    try {await task();if(refreshAfter)await refresh();}
    catch(e){callbacks.showFailure('收藏操作未完成',e);}
    finally {busy=false;render();}
  }
  function reportAdded(result) {
    if(result.canceled)return;
    callbacks.showToast(`已收藏 ${result.added} 項；${result.existing} 項已存在`,'success');
    if(result.issues?.length)callbacks.showFailure('部分項目未能收藏',result.issues.join('\n'));
  }
  async function addPaths(paths) {await run(async()=>reportAdded(await api.add(paths)),true);}
  async function importSelected() {
    if(!selected.size)return;
    await run(async()=>{
      const result=await api.toRename([...selected],$('favorite-recursive').checked);
      callbacks.addToRename(result);setView('rename');
    });
  }
  function requestBulkOpen(){if(busy||!selected.size)return;if(selected.size>20){callbacks.showFailure('開啟項目過多','每次最多開啟 20 項，請縮小選取範圍。');return;}openingIds=[...selected];$('favorite-open-description').textContent=`將使用系統預設程式開啟 ${openingIds.length} 個檔案／資料夾，包含跨頁選取。外部程式可能有自己的網路行為。`;$('favorite-open-dialog').showModal();}
  function moveSelected(){if(busy||!selected.size)return;const found=items.filter(item=>selected.has(item.id));if(found.some(item=>item.type!=='file'||item.status!=='ready')){callbacks.showFailure('無法搬移','只可搬移可使用的一般檔案；資料夾請先加入工作台。');return;}window.movingUI.start(found.map(item=>item.path));}
  async function open(item) {await run(()=>api.open(item.id));}
  function edit(ids=[...selected]) {
    if(busy||!ids.length)return;
    const found=items.filter(item=>ids.includes(item.id));if(found.length!==ids.length)return;
    editingIds=[...ids];pendingLink=null;
    $('favorite-edit-title').textContent=ids.length===1?'編輯收藏':`編輯 ${ids.length} 項收藏的標籤`;
    $('favorite-single-fields').classList.toggle('hidden',ids.length!==1);
    $('favorite-label').value=ids.length===1?found[0].label:'';
    $('favorite-path').value=ids.length===1?found[0].path:'';
    const common=found[0].tags.filter(tag=>found.every(item=>item.tags.some(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase())));
    $('favorite-edit-tags').value=common.join(', ');
    $('favorite-edit-note').textContent=ids.length===1?'最多 20 個標籤，每個最多 32 個字元。':'儲存後會以輸入的標籤取代全部所選項目的現有標籤，包含目前未顯示的項目。';
    closeMenu();$('favorite-edit-dialog').showModal();
  }
  function requestRemove(ids=[...selected]) {
    if(busy||!ids.length)return;
    removingIds=[...ids];closeMenu();
    $('favorite-remove-description').textContent=`即將移除 ${ids.length} 項收藏紀錄，包含已選取但目前未顯示的項目。`;
    $('favorite-remove-dialog').showModal();
  }
  function closeMenu() {$('favorite-context-menu')?.classList.add('hidden');}
  function menuAt(event,actions) {
    closeMenu();const menu=$('favorite-context-menu');menu.replaceChildren();
    for(const action of actions){const el=button(action.label,()=>{closeMenu();action.run();},'');el.setAttribute('role','menuitem');el.disabled=Boolean(action.disabled);menu.appendChild(el);}
    menu.classList.remove('hidden');
    const rect=event.currentTarget?.getBoundingClientRect();
    const x=event.clientX||rect?.left||20,y=event.clientY||rect?.bottom||80;
    menu.style.left=Math.max(8,Math.min(x,window.innerWidth-246))+'px';
    menu.style.top=Math.max(8,Math.min(y,window.innerHeight-menu.getBoundingClientRect().height-8))+'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }
  function showItemMenu(event,item) {
    const ids=selected.has(item.id)?[...selected]:[item.id];
    menuAt(event,[
      {label:'開啟',disabled:item.status!=='ready',run:()=>open(item)},
      {label:'顯示所在位置',disabled:item.status!=='ready',run:()=>run(()=>api.show(item.id))},
      {label:`批次開啟所選（${ids.length} 項）`,run:()=>{selected=new Set(ids);requestBulkOpen();}},
      {label:`搬移所選檔案（${ids.length} 項）`,run:()=>{selected=new Set(ids);moveSelected();}},
      {label:'複製完整路徑',run:()=>run(async()=>{await api.copy(item.id);callbacks.showToast('已複製路徑');})},
      {label:ids.length===1?'編輯標籤／重新連結':`編輯 ${ids.length} 項的標籤`,run:()=>edit(ids)},
      {label:'只重新連結此項目',run:()=>edit([item.id])},
      {label:`加入重新命名（${ids.length} 項）`,run:()=>{selected=new Set(ids);importSelected();}},
      {label:`移除收藏（${ids.length} 項）`,run:()=>requestRemove(ids)}
    ]);
  }
  async function updateContextStatus() {
    try {
      contextState=await api.contextStatus();
      $('favorite-context-status').textContent=(contextState.enabled?'已啟用。':'未啟用。')+contextState.reason;
      $('btn-context-menu').disabled=!contextState.supported;
      $('btn-context-menu').textContent=contextState.enabled?'停用右鍵收藏':'啟用右鍵收藏';
    } catch(e){$('favorite-context-status').textContent=String(e.message||e);$('btn-context-menu').disabled=true;}
  }
  async function init(options) {
    callbacks=options;
    $('tab-info').addEventListener('click',()=>setView('info'));
    $('btn-fav-open').addEventListener('click',requestBulkOpen);
    $('btn-fav-copy').addEventListener('click',()=>run(async()=>{await api.copyMany([...selected]);callbacks.showToast('已複製所選路徑');}));
    $('btn-fav-move').addEventListener('click',moveSelected);
    $('btn-fav-open-cancel').addEventListener('click',()=>$('favorite-open-dialog').close());
    $('btn-fav-open-confirm').addEventListener('click',()=>{const ids=[...openingIds];$('favorite-open-dialog').close();run(async()=>{const result=await api.bulkOpen(ids);callbacks.showToast(`已開啟 ${result.opened} 項`);if(result.failures.length)callbacks.showFailure('部分項目未能開啟',result.failures.join('\n'));});});
    document.addEventListener('keydown',event=>{
      if(!active||busy||callbacks.isBusy()||window.movingUI.hasOpenDialog()||document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
      const action=window.studioShortcuts.match(event);if(!action)return;event.preventDefault();
      const actions={selectAll:()=>{for(const item of visibleItems())selected.add(item.id);render();},clear:()=>{selected.clear();render();},search:()=>$('favorite-search').focus(),open:requestBulkOpen,copy:()=>$('btn-fav-copy').click(),edit:()=>edit(),remove:()=>requestRemove(),refresh,add:()=>$('btn-fav-add-files').click(),rename:importSelected,move:moveSelected,undo:()=>$('btn-undo').click()};actions[action]?.();
    });
    $('tab-rename').addEventListener('click',()=>setView('rename'));
    $('tab-favorites').addEventListener('click',()=>{setView('favorites');refresh();});
    $('tab-settings').addEventListener('click',()=>setView('settings'));
    $('btn-fav-settings').addEventListener('click',()=>setView('settings'));
    $('btn-fav-add-files').addEventListener('click',()=>run(async()=>reportAdded(await api.choose('file')),true));
    $('btn-fav-add-folders').addEventListener('click',()=>run(async()=>reportAdded(await api.choose('folder')),true));
    $('btn-fav-refresh').addEventListener('click',refresh);
    for(const id of ['favorite-search','favorite-type','favorite-status','favorite-sort'])$(id).addEventListener(id==='favorite-search'?'input':'change',()=>{pageIndex=0;render();});
    $('favorite-page-prev').addEventListener('click',()=>{pageIndex--;render();});
    $('favorite-page-next').addEventListener('click',()=>{pageIndex++;render();});
    $('btn-fav-select-all').addEventListener('click',()=>{for(const item of paginate(visibleItems(),pageIndex,window.settingsUI.get().pageSize).rows)selected.add(item.id);render();});
    $('btn-fav-select-none').addEventListener('click',()=>{selected.clear();render();});
    $('btn-fav-edit').addEventListener('click',()=>edit());
    $('btn-fav-remove').addEventListener('click',()=>requestRemove());
    $('btn-fav-rename').addEventListener('click',importSelected);
    $('btn-favorite-selected').addEventListener('click',()=>addPaths(callbacks.getSelectedPaths()));
    $('btn-fav-edit-cancel').addEventListener('click',()=>$('favorite-edit-dialog').close());
    $('btn-fav-relink').addEventListener('click',async()=>{
      if(editingIds.length!==1)return;
      const button=$('btn-fav-relink');button.disabled=true;
      try {const filepath=await api.chooseLink(editingIds[0]);if(filepath){pendingLink=filepath;$('favorite-path').value=filepath;}}
      catch(e){callbacks.showFailure('無法選擇新位置',e);}
      finally{button.disabled=false;}
    });
    $('favorite-edit-form').addEventListener('submit',event=>{
      event.preventDefault();const ids=[...editingIds],changes={tags:$('favorite-edit-tags').value.split(/[,，\n]/)};
      if(ids.length===1){changes.label=$('favorite-label').value;if(pendingLink!==null)changes.path=pendingLink;}
      $('favorite-edit-dialog').close();run(async()=>{await api.update(ids,changes);callbacks.showToast('已儲存收藏設定','success');},true);
    });
    $('btn-fav-remove-cancel').addEventListener('click',()=>$('favorite-remove-dialog').close());
    $('btn-fav-remove-confirm').addEventListener('click',()=>{
      const ids=[...removingIds];$('favorite-remove-dialog').close();run(async()=>{await api.remove(ids);callbacks.showToast('已移除收藏，實際檔案已保留');},true);
    });
    $('btn-context-menu').addEventListener('click',async()=>{
      if(!contextState?.supported)return;
      $('btn-context-menu').disabled=true;
      try {await api.setContext(!contextState.enabled);await updateContextStatus();}
      catch(e){callbacks.showFailure('右鍵選單設定未完成',e);await updateContextStatus();}
    });
    document.addEventListener('pointerdown',event=>{if(!$('favorite-context-menu').contains(event.target))closeMenu();});
    document.addEventListener('keydown',event=>{
      const menu=$('favorite-context-menu');if(menu.classList.contains('hidden'))return;
      if(event.key==='Escape'){closeMenu();return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
        buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();
      }
    });
    window.addEventListener('focus',()=>{if(active)refresh();});
    api.onChanged(payload=>{if(payload.activate)setView('favorites');refresh();});
    setView(window.settingsUI.get().startPage);await refresh();await updateContextStatus();
  }
  window.favoritesUI=Object.freeze({init,isActive:()=>active,isSettings:()=>settingsActive,addPaths,refresh,render,resetPage:()=>{pageIndex=0;},
    hasOpenDialog:()=>$('favorite-edit-dialog').open||$('favorite-remove-dialog').open||$('favorite-open-dialog').open||window.movingUI.hasOpenDialog(),
    show:view=>setView(view),
    showSourceMenu:(event,filepath)=>{
      if(busy||!callbacks)return;
      const paths=callbacks.getSelectedPaths(),actions=[{label:'☆ 收藏此檔案',run:()=>addPaths([filepath])}];
      if(paths.length>1&&paths.includes(filepath))actions.push({label:`☆ 收藏選取的 ${paths.length} 個檔案`,run:()=>addPaths(paths)});
      menuAt(event,actions);
    }});
})();
