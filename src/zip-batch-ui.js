'use strict';
(()=>{
 function create({api,runTask,status}){
  const $=id=>document.getElementById('zip-batch-'+id);
  const settings=()=>window.settingsUI?.get()||{};
  const update=patch=>window.settingsUI?.update(patch);
  const trackingAPI=window.everythingAPI;
  const node=(tag,text)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;return value;};
  const button=(text,action)=>{const value=node('button',text);value.type='button';value.className='btn btn-ghost';value.addEventListener('click',action);return value;};
  const key=path=>/^[a-z]:[\\/]/i.test(path)?path.toLowerCase():path;
  const sourceSelection=window.tableSelection?.create({changed:()=>controls(batchBusy),isBusy:()=>batchBusy});
  const sources=new Map(),selected=new Set(),visibleRows=new Map(),passwordFields=new Map();
  let target='',limit=50,preview,result,recycled=new Map(),batchBusy=false;
  let queries=[],queryId='',page=0,anchor=null,rangeBase=null,trackingLoaded=false,cachedOrder;
  const pageSize=75;
  const query=()=>queries.find(item=>item.id===queryId);
  const trackingHeaders=[...$('tracking').querySelectorAll('[data-zip-batch-sort]')];
  const sourceHeaders=[...$('source-table').querySelectorAll('[data-zip-batch-source-sort]')];
  const columns=()=>window.everythingResultColumns;
  const sort=()=>window.everythingViewSettings.effective(settings().everythingSortStates?.[queryId],columns().DEFAULT_COLUMNS);
  const sourceSort=()=>window.everythingViewSettings.effective(settings().zipBatchSourceSort,columns().DEFAULT_COLUMNS);
  const isZip=({type,path})=>type==='file'&&/\.zip$/i.test(path)&&!/^[/\\]{2}/.test(path);
  function renderHeaders(headers,attribute,sort){
   for(const header of headers){
    const column=header.getAttribute(attribute);
    const active=column===sort.key;
    header.parentElement.setAttribute('aria-sort',active?(sort.direction==='asc'?'ascending':'descending'):'none');
    header.textContent=columns().COLUMNS[column].label+(active?(sort.direction==='asc'?' ▲':' ▼'):'');
   }
  }
  function trackingRows(){
   const snapshot=query()?.snapshot;
   if(!snapshot)return [];
   const {key,direction}=sort(),filter=$('filter').value;
   if(cachedOrder?.snapshot===snapshot&&cachedOrder.key===key&&cachedOrder.direction===direction&&cachedOrder.filter===filter)return cachedOrder.rows;
   const view=window.everythingTrackingView;
   const rows=view.filterRows(view.sortedRows(snapshot.rows,key,direction),filter)
    .filter(({item})=>isZip(item));
   cachedOrder={snapshot,key,direction,filter,rows};
   return rows;
  }
  function clearPasswords(){
   $('shared-password').value='';
   for(const field of passwordFields.values())field.value='';
   controls(batchBusy);
  }
  const passwordFor=id=>passwordFields.get(id)?.value||$('shared-password').value;
  function invalidate(){
   preview=null;
   passwordFields.clear();
   $('preview').replaceChildren();
   $('preview-hint').hidden=false;
   controls(batchBusy);
  }
  function trackingSummary(){
   const rows=trackingRows(),snapshot=query()?.snapshot;
   $('tracking-summary').textContent=(snapshot?.error||(!queryId?'沒有可用的追蹤搜尋':snapshot?rows.length+' 個 ZIP'+(snapshot.truncated?'（追蹤結果已達上限）':''):'請更新所選的追蹤結果'))+
    (rows.length>pageSize?' · '+(page+1)+'／'+Math.ceil(rows.length/pageSize)+' 頁':'')+(selected.size?' · 已勾選 '+selected.size+' 個':'');
  }
  function controls(busy){
   batchBusy=busy;
   $('clear').disabled=busy||!sources.size;
   $('remove-selected').disabled=busy||!sourceSelection?.selected.size;
   $('add').disabled=busy||!$('paths').value.trim();
   $('save-target').disabled=busy||!target||$('targets').value!=='';
   $('preview-button').disabled=busy||!sources.size||!target;
   $('run').disabled=$('preview-button').disabled||Boolean(preview&&!preview.rows.some(row=>!row.error&&(!row.encrypted||passwordFor(row.id))));
   $('open').disabled=busy||!result?.rows.some(row=>['completed','partial'].includes(row.status));
   $('recycle').disabled=busy||!result?.rows.some(row=>row.status==='completed'&&!recycled.get(row.id)?.recycled);
   $('retry').disabled=busy||!result?.rows.some(row=>row.status!=='completed');
   $('refresh').disabled=busy||!query()?.enabled;
   $('add-tracking').disabled=busy||!selected.size;
   $('prev').disabled=busy||page===0;
   $('next').disabled=busy||(page+1)*pageSize>=trackingRows().length;
   trackingHeaders.forEach(header=>{header.disabled=busy||!queryId;});
   sourceHeaders.forEach(header=>{header.disabled=busy||!sources.size;});
   trackingSummary();
  }
  function renderSources(){
   const {DEFAULT_COLUMNS,display}=columns();
   const sort=sourceSort();
   const ordered=window.everythingTrackingView.sortedRows([...sources.values()],sort.key,sort.direction);
   sourceSelection?.begin(ordered.map(({item})=>key(item.path)));
   const rows=ordered.map(({item})=>{
    const row=node('tr'),action=node('td'),cell=node('td');
    cell.className='table-select-cell';
    if(sourceSelection){
     const check=node('input');check.type='checkbox';check.setAttribute('aria-label','選取 '+item.name);
     cell.append(check);sourceSelection.bind(row,key(item.path),check);
    }
    const remove=button('移除',()=>{sources.delete(key(item.path));invalidate();renderSources();});
    remove.setAttribute('aria-label','移除 '+item.name);
    action.append(remove);
    row.append(cell,...DEFAULT_COLUMNS.map(column=>fileCell(item,column,display)),action);
    return row;
   });
   $('sources').replaceChildren(...rows);
   renderHeaders(sourceHeaders,'data-zip-batch-source-sort',sort);
   $('count').textContent='待解壓 ZIP（'+sources.size+'／'+limit+'）';
   if(sourceSelection)sourceSelection.paint();else controls(batchBusy);
  }
  function fileCell(item,column,display){
   const cell=node('td',display(item,column,{sizeUnit:settings().everythingSizeUnit}));
   if(column==='name'||column==='location')cell.title=column==='name'?item.name:cell.textContent;
   return cell;
  }
  function addSources(value){
   if(value.canceled)return;
   const rejected=[...value.errors];
   let added=0;
   for(const item of value.rows){
    const id=key(item.path);
    if(sources.has(id))continue;
    if(sources.size>=limit){rejected.push('清單已達 '+limit+' 個 ZIP 上限。');break;}
    sources.set(id,item);added++;
   }
   if(added){invalidate();renderSources();}
   status('已加入 '+added+' 個 ZIP。'+(rejected.length?' '+rejected.join('；'):''),Boolean(rejected.length));
  }
  function syncTarget(value){
   if(value.canceled)return;
   if(target!==value.target)invalidate();
   target=value.target;limit=value.batchLimit;
   const options=value.savedTargets.map((folder,index)=>{const option=node('option',folder);option.value=String(index);return option;});
   const empty=node('option','選擇已儲存的資料夾');empty.value='';
   const index=value.savedTargets.indexOf(target);
   $('targets').replaceChildren(empty,...options);$('targets').value=index<0?'':String(index);
   $('target-path').textContent=target||'尚未選擇目標資料夾';
   controls(batchBusy);
  }
  function resetSelection(index=null){anchor=index;rangeBase=null;}
  function rememberSelection(){
   const snapshot=query()?.snapshot;
   if(!snapshot?.token)return;
   const saved={...settings().zipBatchSelections};
   delete saved[queryId];
   if(selected.size)saved[queryId]=[...selected].map(index=>snapshot.rows[index].path);
   update({zipBatchSelections:saved});
  }
  function restoreSelection(){
   selected.clear();resetSelection();page=0;
   const saved=new Set((settings().zipBatchSelections?.[queryId]||[]).map(key));
   query()?.snapshot?.rows.forEach((item,index)=>{
    if(selected.size<limit&&isZip(item)&&saved.has(key(item.path)))selected.add(index);
   });
  }
  function selectRows(indices,base){
   const next=new Set(base);
   for(const index of indices){
    if(next.size>=limit&&!next.has(index)){status('一次最多勾選 '+limit+' 個 ZIP。',true);break;}
    next.add(index);
   }
   selected.clear();next.forEach(index=>selected.add(index));
   rememberSelection();
   for(const [index,{row,check}] of visibleRows){
    check.checked=selected.has(index);
    row.classList.toggle('zip-batch-selected',check.checked);
   }
   controls(batchBusy);
  }
  function toggle(index,checked=!selected.has(index)){
   resetSelection(index);
   if(!checked)selected.delete(index);
   selectRows(checked?[index]:[],selected);
  }
  function extend(index,from=index){
   const order=trackingRows().map(({index})=>index);
   if(!order.includes(anchor))resetSelection(from);
   rangeBase??=new Set(selected);
   const a=order.indexOf(anchor),b=order.indexOf(index),range=order.slice(Math.min(a,b),Math.max(a,b)+1);
   selectRows(a<=b?range:range.reverse(),rangeBase);
  }
  function onTrackingKey(event,index){
   if(batchBusy||event.altKey)return;
   const {key,shiftKey}=event,ctrl=event.ctrlKey||event.metaKey;
   const all=ctrl&&key.toLowerCase()==='a';
   const arrow=key==='ArrowUp'||key==='ArrowDown'||(ctrl||shiftKey)&&(key==='ArrowLeft'||key==='ArrowRight');
   if(key!==' '&&!all&&!arrow)return;
   event.preventDefault();event.stopPropagation();
   if(key===' '){toggle(index);return;}
   const rows=trackingRows();
   if(all){resetSelection(index);selectRows(rows.map(row=>row.index),[]);return;}
   const position=rows.findIndex(row=>row.index===index)+(key==='ArrowUp'||key==='ArrowLeft'?-1:1);
   if(!rows[position])return;
   const next=rows[position].index;
   if(shiftKey)extend(next,index);else if(!ctrl)resetSelection(next);
   const nextPage=Math.floor(position/pageSize);
   if(page!==nextPage){page=nextPage;renderTracking();}
   visibleRows.get(next)?.row.focus();
  }
  function renderTracking(){
   const rows=trackingRows();
   const {DEFAULT_COLUMNS,display}=columns();
   page=Math.min(page,Math.max(0,Math.ceil(rows.length/pageSize)-1));
   visibleRows.clear();
   $('tracking-rows').replaceChildren(...rows.slice(page*pageSize,(page+1)*pageSize).map(({item,index})=>{
    const row=node('tr'),select=node('td'),check=node('input');
    row.tabIndex=0;
    check.type='checkbox';check.checked=selected.has(index);
    row.classList.toggle('zip-batch-selected',check.checked);
    check.setAttribute('aria-label','選取 '+item.name);
    visibleRows.set(index,{row,check});
    let extendCheck=false;
    check.addEventListener('click',event=>{extendCheck=event.shiftKey;});
    check.addEventListener('change',()=>{if(extendCheck)extend(index);else toggle(index,check.checked);extendCheck=false;});

    row.addEventListener('keydown',event=>onTrackingKey(event,index));
    window.tableSelection?.guard(row);
    function selectClick(event){
     if(batchBusy)return;
     const modified=event.shiftKey||event.ctrlKey||event.metaKey;
     if(event.target===check||event.button>0&&event.type!=='contextmenu'||
       !modified&&(event.type==='contextmenu'||window.getSelection?.()?.toString()))return;
     event.preventDefault();
     if(event.shiftKey)extend(index);
     else if(modified)toggle(index);
     else{resetSelection(index);selectRows([index],[]);}
     row.focus();
    }
    row.addEventListener('click',selectClick);
    row.addEventListener('contextmenu',selectClick);
    select.append(check);
    const token=query()?.snapshot?.token,trackingId=queryId;
    row.append(select,...DEFAULT_COLUMNS.map(column=>{
     const cell=fileCell(item,column,display);
     if(column==='name'||column==='location'){
      cell.title+=(column==='name'?' · 雙擊開啟 ZIP':' · 雙擊在檔案總管定位');
      cell.addEventListener('dblclick',event=>{
       if(batchBusy||event.button!==0||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return;
       event.stopPropagation();
       void runTask(()=>trackingAPI.trackingAction(trackingId,token,[index],column==='name'?'open':'show'));
      });
     }
     return cell;
    }));
    return row;
   }));
   renderHeaders(trackingHeaders,'data-zip-batch-sort',sort());
   controls(batchBusy);
  }
  function syncTracking(value){
   if(!value)return;
   const previous=query();
   queries=value.queries||[];
   const desired=settings().zipBatchTrackingId;
   queryId=queries.some(item=>item.id===queryId)?queryId:queries.some(item=>item.id===desired)?desired:queries[0]?.id||'';
   if(previous?.id!==queryId||previous?.snapshot?.token!==query()?.snapshot?.token)restoreSelection();
   const options=queries.map(item=>{const option=node('option',item.name+(item.enabled?'':'（已暫停）'));option.value=item.id;return option;});
   $('query').replaceChildren(...options);$('query').value=queryId;
   trackingLoaded=true;renderTracking();
  }
  function renderPreview(value,{reveal=true}={}){
   preview=value;passwordFields.clear();
   $('preview-hint').hidden=true;
   const entries=value.rows.map(row=>{
    const group=node('article');
    group.append(node('strong',row.archive));
    if(row.error){
     const error=node('p',row.error);error.className='zip-update-state-blocked';group.append(error);
    }else{
     const list=node('ul');
     let offset=0;
     const flat=$('extract-mode').value==='flat';
     const more=button('顯示更多輸出',appendOutputs);
     function appendOutputs(){
      const next=row.outputs.slice(offset,offset+50);
      for(const output of next)list.append(node('li',(output.directory?'資料夾　':'檔案　')+output.path));
      offset+=next.length;more.hidden=offset>=row.outputs.length;
     }
     appendOutputs();
     group.append(node('p',row.outputs.length?row.outputs.length+(flat?' 個檔案':' 個第一層輸出'):'ZIP 內沒有項目'),list,more);
     if(row.encrypted){
      const label=node('label','ZIP 密碼 '),field=node('input');
      field.type='password';field.maxLength=1024;field.autocomplete='off';
      field.setAttribute('aria-label','ZIP 密碼 '+row.archive);
      field.addEventListener('input',()=>controls(batchBusy));
      passwordFields.set(row.id,field);label.append(field);group.append(label);
     }
    }
    return group;
   });
   $('preview').replaceChildren(...entries);
   if(passwordFields.size)$('preview').prepend(node('p','個別密碼優先使用。未填個別密碼時使用共用密碼，兩者皆空白會跳過該 ZIP。'));
   if(reveal)$('preview').scrollIntoView({block:'nearest'});
   controls(batchBusy);
  }
  function renderResult(){
   $('result').hidden=false;
   $('result-rows').replaceChildren(...result.rows.map(row=>{
    const recovery=recycled.get(row.id),label={completed:'已完成',partial:'部分完成',failed:'失敗',skipped:'已跳過',canceled:'未執行'}[row.status];
    const item=node('li',label+' · '+row.archive+'\n→ '+row.destination+'（'+row.count+' 個檔案）'+
     (row.error?'\n'+row.error:'')+(recovery?.recycled?'\n來源 ZIP 已移到資源回收筒':recovery?.recycleError?'\n回收失敗：'+recovery.recycleError:''));
    if(row.status!=='completed'||recovery?.recycleError)item.className='zip-update-state-blocked';
    return item;
   }));
   controls(batchBusy);
  }
  async function recycle(){
   const value=await api.command('batch-recycle',result.token);
   if(value.canceled)return;
   value.rows.forEach(row=>recycled.set(row.id,row));
   renderResult();
   status('已回收 '+value.rows.filter(row=>row.recycled).length+' 個來源 ZIP。',value.rows.some(row=>row.recycleError));
  }
  const on=(id,task)=>$(id).addEventListener('click',()=>void runTask(task));
  on('pick',async()=>addSources(await api.command('batch-choose-files')));
  $('paths').addEventListener('input',()=>controls(batchBusy));
  on('add',async()=>{
   const paths=$('paths').value.split(/\r?\n/).map(line=>line.trim().replace(/^"(.*)"$/,'$1')).filter(Boolean);
   const value=await api.command('batch-add-paths',[...new Set(paths)]);
   addSources(value);if(!value.errors.length)$('paths').value='';
  });
  on('clear',()=>{sources.clear();invalidate();renderSources();});
  on('remove-selected',()=>{
   for(const id of sourceSelection?.selected||[])sources.delete(id);
   invalidate();renderSources();
  });
  on('pick-target',async()=>syncTarget(await api.command('batch-choose-target')));
  on('save-target',async()=>{syncTarget(await api.command('batch-save-target'));status('已儲存目前的解壓位置。');});
  $('targets').addEventListener('change',()=>{
   if($('targets').value!=='')void runTask(async()=>syncTarget(await api.command('batch-select-target',Number($('targets').value))));
  });
  function describeMode(){
   $('extract-hint').textContent=$('extract-mode').value==='flat'
    ?'將檔案放在同一層。同名檔案會自動加編號，空資料夾會略過。'
    :'保留 ZIP 內的資料夾結構。同名的第一層項目會自動加編號。';
  }
  $('shared-password').addEventListener('input',()=>controls(batchBusy));
  $('extract-mode').addEventListener('change',()=>{
   describeMode();
   if($('remember-mode').checked)update({zipDefaultExtractMode:$('extract-mode').value});
   invalidate();
  });
  $('remember-mode').addEventListener('change',()=>{
   const remember=$('remember-mode').checked;
   update({zipRememberExtractMode:remember,...(remember?{zipDefaultExtractMode:$('extract-mode').value}:{})});
  });
  $('tracking').addEventListener('toggle',()=>{
   if($('tracking').open&&!trackingLoaded&&trackingAPI)void runTask(async()=>syncTracking(await trackingAPI.trackingList()));
  });
  $('query').addEventListener('change',()=>{
   queryId=$('query').value;update({zipBatchTrackingId:queryId});restoreSelection();renderTracking();
  });
  $('filter').addEventListener('input',()=>{resetSelection();page=0;renderTracking();});
  on('refresh',async()=>syncTracking(await trackingAPI.trackingRefresh(queryId)));
  $('prev').addEventListener('click',()=>{page--;renderTracking();});
  $('next').addEventListener('click',()=>{page++;renderTracking();});
  on('add-tracking',async()=>{
   const value=await api.command('batch-add-tracking',{id:queryId,token:query()?.snapshot?.token,indices:[...selected]});
   addSources(value);
  });
  for(const header of trackingHeaders)header.addEventListener('click',()=>{
   const states=settings().everythingSortStates||{},key=header.getAttribute('data-zip-batch-sort');
   update({everythingSortStates:{...states,[queryId]:window.everythingViewSettings.select(states[queryId],key)}});
   resetSelection();page=0;renderTracking();
  });
  for(const header of sourceHeaders)header.addEventListener('click',()=>{
   const column=header.getAttribute('data-zip-batch-source-sort');
   update({zipBatchSourceSort:window.everythingViewSettings.select(settings().zipBatchSourceSort,column)});
   renderSources();
  });
  async function previewSources({paths=[...sources.values()].map(item=>item.path),reveal=true}={}){
   invalidate();
   const value=await api.command('batch-preview',{paths,mode:$('extract-mode').value});
   renderPreview(value,{reveal});
  }
  on('preview-button',async()=>{
   await previewSources();
   status('請核對預期結果及解壓位置。');
  });
  on('run',async()=>{
   if(!preview){
    await previewSources({reveal:false});
    if([...passwordFields.keys()].some(id=>!passwordFor(id))){
     $('password-options').open=true;
     $('preview').scrollIntoView({block:'nearest'});
     status('此批 ZIP 有加密檔案。請輸入共用或個別密碼，再按「開始解壓」。');
     return;
    }
   }
   if(preview.rows.every(row=>row.error)){
    $('preview').scrollIntoView({block:'nearest'});
    status('目前沒有可解壓的 ZIP，請查看預期結果。',true);
    return;
   }
   const {token}=preview;
   const passwords=Object.fromEntries([...passwordFields.keys()].map(id=>[id,passwordFor(id)]).filter(([,password])=>password));
   clearPasswords();
   const next=await api.command('batch-run',{token,passwords});
   result=next;recycled=new Map();invalidate();
   for(const row of result.rows)if(row.status==='completed')sources.delete(key(row.archive));
   renderSources();renderResult();
   $('result').scrollIntoView({block:'nearest'});
   const completed=result.rows.filter(row=>row.status==='completed').length;
   status('完成 '+completed+'／'+result.rows.length+' 個 ZIP。',completed!==result.rows.length);
   if(completed&&settings().zipAskRecycle)await recycle();
  });
  on('open',()=>api.command('batch-open-target','result'));
  on('recycle',recycle);
  on('retry',async()=>{
   const paths=result.rows.filter(row=>row.status!=='completed').map(row=>row.archive);
   const value=await api.command('batch-add-paths',paths);
   addSources(value);
   const accepted=value.rows.filter(item=>sources.has(key(item.path))).map(item=>item.path);
   if(accepted.length)await previewSources({paths:accepted});
  });
  return {
   controls,clearPasswords,
   resetMode:()=>{
    const value=settings().zipDefaultExtractMode||'direct';
    if($('extract-mode').value!==value){$('extract-mode').value=value;invalidate();}
    $('remember-mode').checked=settings().zipRememberExtractMode!==false;
    describeMode();
   },
   drop:async files=>addSources(await api.addDropped(files)),
   activate:async()=>{
    syncTarget(await api.command('batch-state'));
    renderSources();
    if($('tracking').open&&trackingAPI)syncTracking(await trackingAPI.trackingList());
   }
  };
 }
 window.zipBatchUI={create};
})();
