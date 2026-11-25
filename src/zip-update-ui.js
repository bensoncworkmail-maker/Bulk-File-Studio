'use strict';
(()=>{
 const api=window.zipUpdateAPI;if(!api)return;const view=window.zipUpdateView||globalThis.zipUpdateView;let prefs=view.normalize(window.settingsUI?.get()?.zipUpdateView);const $=id=>document.getElementById('zip-update-'+id),root=$('page');if(!root)return;
 const labels={added:'新增',changed:'內容不同',same:'內容相同',blocked:'無法處理',source:'待比較',completed:'已完成',partial:'部分完成',canceled:'已停止',running:'未完成，可檢查／還原',restored:'已還原','partial-undo':'部分還原'};
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 let data={files:[],sourceFolders:[],targetFolders:[],savedTargets:[],roots:[],runs:[],selected:{},browsers:{}},plan=null,selected=new Set(),page=0,busy=false,lastResult=null,expanded=new Set(),tree,treeKey='';
 let mode='compare',configuredMode;
 const batch=window.zipBatchUI?.create({api,runTask,status:(...args)=>status(...args)});
 const browserPages={source:0,target:0},eligible=row=>['added','changed'].includes(row.status),status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
 const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
 function persistView(){window.settingsUI?.update({zipUpdateView:view.normalize(prefs)});}
 function saveView(){prefs.expanded=[...expanded];persistView();}
 function jump(id){$(id).scrollIntoView({behavior:'smooth',block:'start'});}
 const resizeHandles=[...root.querySelectorAll('[data-zip-resize]')];
 function renderPanelSize(handle){
  const key=handle.getAttribute('data-zip-resize'),value=prefs.layout[key],{min,max}=view.dimensions[key];
  if(key==='batch-split'){
   root.style.setProperty('--zip-batch-source-fr',value+'fr');root.style.setProperty('--zip-batch-target-fr',(100-value)+'fr');
  }else if(key==='split'){
   root.style.setProperty('--zip-source-fr',value+'fr');root.style.setProperty('--zip-target-fr',(100-value)+'fr');
  }else root.style.setProperty('--zip-'+key+'-height',value+'px');
  handle.setAttribute('aria-valuemin',min);handle.setAttribute('aria-valuemax',max);
  handle.setAttribute('aria-valuenow',value);handle.setAttribute('aria-valuetext',value+(key.endsWith('split')?'%':' 像素'));
 }
 function bindPanelResize(handle){
  const key=handle.getAttribute('data-zip-resize'),{min,max,initial}=view.dimensions[key],split=key.endsWith('split');
  const panels=key==='batch-split'?document.getElementById('zip-batch-layout'):$('source-target-panels');
  const increase=split?'ArrowRight':'ArrowDown',decrease=split?'ArrowLeft':'ArrowUp';
  const coordinate=event=>split?event.clientX:event.clientY;
  let drag;
  function resize(value){prefs.layout[key]=view.dimension(key,value);renderPanelSize(handle);}
  handle.addEventListener('pointerdown',event=>{
   if(event.button!==0)return;
   event.preventDefault();handle.focus();handle.setPointerCapture(event.pointerId);
   drag={id:event.pointerId,start:coordinate(event),size:prefs.layout[key]};
  });
  handle.addEventListener('pointermove',event=>{
   if(!drag||drag.id!==event.pointerId)return;
   const delta=coordinate(event)-drag.start;
   resize(drag.size+(split?100*delta/Math.max(1,panels.clientWidth-14):delta));
  });
  for(const type of ['pointerup','lostpointercapture','pointercancel'])handle.addEventListener(type,event=>{
   if(drag?.id!==event.pointerId)return;
   drag=null;persistView();
  });
  handle.addEventListener('keydown',event=>{
   if(![increase,decrease,'Home','End'].includes(event.key))return;
   event.preventDefault();
   resize(event.key==='Home'?min:event.key==='End'?max:prefs.layout[key]+(event.key===increase?1:-1)*(split?2:16));
   persistView();
  });
  handle.addEventListener('dblclick',()=>{resize(initial);persistView();});
  renderPanelSize(handle);
 }
 function bindEntryMenu(tr,value){
  tr.tabIndex=0;
  const show=async event=>{
   event.preventDefault();event.stopPropagation();if(busy)return;
   try{await api.command('entry-menu',value);}catch(error){status(error.message||String(error),true);}
  };
  tr.addEventListener('contextmenu',show);
  tr.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')show(event);});
 }
 function renderTargetOptions(){
  const field=$('targets'),quick=$('quick-target'),savedTargets=data.savedTargets||[];
  const saved=savedTargets.indexOf(data.selected.target),recent=data.targetFolders.indexOf(data.selected.target);
  const empty=node('option','選擇目的地');empty.value='';field.replaceChildren(empty);
  for(const [kind,rows,title] of [['saved',savedTargets,'已儲存的常用位置'],['recent',data.targetFolders,'最近使用']]){
   if(!rows.length)continue;
   const group=node('optgroup');group.label=title;
   rows.forEach((folder,index)=>{const option=node('option',folder);option.value=kind+':'+index;group.append(option);});
   field.append(group);
  }
  field.value=saved>=0?'saved:'+saved:recent>=0?'recent:'+recent:'';
  const placeholder=node('option','常用目標');placeholder.value='';placeholder.disabled=true;
  quick.replaceChildren(placeholder);
  savedTargets.forEach((folder,index)=>{
   const option=node('option',index===saved?folder+'（目前）':folder);
   option.value=String(index);quick.append(option);
  });
  quick.value='';
  quick.title=savedTargets.length?'切換已儲存的目標資料夾':'可在「目標資料夾」儲存常用位置';
 }
 function invalidate(){plan=null;selected.clear();page=0;lastResult=null;treeKey='';expanded.clear();}
 function options(field,values,placeholder){const old=field.value;field.replaceChildren();const empty=node('option',placeholder);empty.value='';field.append(empty);values.forEach((text,i)=>{const option=node('option',text);option.value=String(i);field.append(option);});field.value=old;}
 function sync(next){for(const kind of ['source','target'])if(next.browsers?.[kind]?.folder!==data.browsers?.[kind]?.folder){browserPages[kind]=0;$(kind+'-browser-query').value='';}data=next;options($('sources'),data.sourceFolders,'選擇最近來源位置');renderTargetOptions();const old=$('root').value;$('root').replaceChildren();for(const text of ['',...data.roots]){const option=node('option',text?text+'／內的檔案':'保留 ZIP 完整層級');option.value=text;$('root').append(option);}$('root').value=data.roots.includes(old)?old:'';$('source-path').textContent=data.selected.zipPath||'尚未選擇 ZIP';$('target-path').textContent=data.selected.target||'尚未選擇目標';const sourceIndex=data.sourceFolders.indexOf(data.browsers?.source?.root);$('sources').value=sourceIndex>=0?String(sourceIndex):'';render();}
 function currentRows(){const query=$('query').value.toLowerCase(),filter=$('filter').value,sourceRoot=$('root').value;return (plan?.rows||data.files.filter(r=>!sourceRoot||r.name.startsWith(sourceRoot+'/')).map(r=>({...r,relative:sourceRoot?r.name.slice(sourceRoot.length+1):r.name,status:'source',destination:''}))).filter(r=>(!plan||filter==='all'||filter==='changes'&&r.status!=='same'||filter===r.status)&&(!query||(r.relative||r.name).toLowerCase().includes(query)||(r.destination||'').toLowerCase().includes(query)));}
 function makeTree(){const rows=currentRows(),key=JSON.stringify([plan?.token||data.selected.zipPath,$('filter').value,$('query').value,rows.map(r=>r.id)]);tree=window.zipUpdateTree.build(rows,prefs.sorts.compare);if(key!==treeKey){treeKey=key;page=0;expanded=new Set([...tree.folders.keys()].filter(path=>$('query').value||prefs.expandAll||prefs.expanded.includes(path)));}}
 function members(path){return tree?.folders.get(path)?.members.filter(eligible)||[];}
 function controls(){for(const field of root.querySelectorAll('button,input,select,textarea'))field.disabled=busy;$('cancel').disabled=false;$('cancel').hidden=!busy;if(mode==='normal'){batch?.controls(busy);return;}$('apply').disabled=busy||!plan||!selected.size;$('apply').textContent='確認套用'+(selected.size?'（'+selected.size+' 個）':'');$('preview').disabled=busy||!data.files.length||!data.selected.target;$('latest').disabled=busy||!data.browsers?.source?.folder||!data.selected.target;$('open-target').disabled=busy||!data.selected.target;$('save-target').disabled=busy||!data.selected.target||(data.savedTargets||[]).includes(data.selected.target);$('save-target').textContent=(data.savedTargets||[]).includes(data.selected.target)?'★ 已儲存':'☆ 儲存目前位置';$('forget-target').disabled=busy||!$('targets').value;$('select-all').disabled=$('select-none').disabled=busy||!plan;
  $('quick-target').disabled=busy||!data.savedTargets?.length;
  const p=tree?.page(expanded,page);$('prev').disabled=busy||!p||p.index===0;$('next').disabled=busy||!p||p.index>=p.last;
  for(const input of $('rows').querySelectorAll('input')){const rows=input.dataset.folder?members(input.dataset.folder):[plan?.rows.find(r=>r.id===input.dataset.id)].filter(Boolean);const allowed=rows.filter(eligible);input.disabled=busy||!plan||!allowed.length;const count=allowed.filter(r=>selected.has(r.id)).length;input.checked=Boolean(allowed.length)&&count===allowed.length;input.indeterminate=count>0&&count<allowed.length;}
  for(const kind of ['source','target']){const state=data.browsers?.[kind],count=browserRows(kind).length;$(kind+'-up').disabled=busy||!state?.canUp;$(kind+'-prev').disabled=busy||browserPages[kind]===0;$(kind+'-next').disabled=busy||browserPages[kind]>=Math.ceil(count/100)-1;}
 }
 function browserRows(kind){const query=$(kind+'-browser-query').value.toLowerCase();return view.browserRows((data.browsers?.[kind]?.rows||[]).filter(r=>!query||r.name.toLowerCase().includes(query)),prefs.sorts[kind]);}
 function renderBrowser(kind){const snapshot=data.browsers?.[kind],rows=browserRows(kind),container=$(kind+'-browser-rows');browserPages[kind]=Math.min(browserPages[kind],Math.max(0,Math.ceil(rows.length/100)-1));container.replaceChildren();$(kind+'-folder-path').textContent=snapshot?.folder||(kind==='source'?'選擇來源資料夾或常用來源位置':'選擇目標資料夾後顯示內容');
  for(const entry of rows.slice(browserPages[kind]*100,browserPages[kind]*100+100)){const tr=node('tr'),name=node('td');
   const zip=kind==='source'&&entry.kind==='zip';
   if(entry.kind==='folder'||zip){
    const button=node('button',(zip?'▣ ':'▸ 📁 ')+entry.name,'zip-browser-item');
    button.type='button';
    button.title=zip?'讀取這個 ZIP':kind==='target'?'進入並設為目標資料夾':'進入來源資料夾';
    button.addEventListener('click',()=>{
     void runTask(async()=>{
      const value=await api.command(zip?'source-open':kind+'-enter',entry.id);
      if(zip||kind==='target')await compareSelection(value,{newZip:zip,reveal:zip});
      else{sync(value);status('已切換來源資料夾。');}
     });
    });
    name.append(button);
   }else name.textContent=(entry.kind==='blocked'?'⚠ ':'')+entry.name;
   name.title=entry.error||entry.name;
   tr.append(name,node('td',entry.kind==='folder'?'—':size(entry.size)),node('td',entry.modified?new Date(entry.modified).toLocaleString():entry.error||''));
   if(entry.kind!=='blocked')bindEntryMenu(tr,{panel:kind,id:entry.id,kind:entry.kind});
   container.append(tr);
  }
  if(!rows.length){const tr=node('tr'),td=node('td',snapshot?.folder?'此位置沒有符合的'+(kind==='source'?' ZIP 或資料夾':'項目'):'尚未選擇位置');td.colSpan=3;tr.append(td);container.append(tr);}$(kind+'-browser-status').textContent=`${rows.length} 項`+(rows.length>100?` · ${browserPages[kind]+1}／${Math.ceil(rows.length/100)} 頁`:'')+(snapshot?.truncated?' · 清單已達上限，可使用選擇器另選檔案或資料夾':'');
 }
 function renderResults(){makeTree();const p=tree.page(expanded,page);page=p.index;$('rows').replaceChildren();
  for(const entry of p.rows){const tr=node('tr'),checkCell=node('td'),check=node('input'),name=node('td'),label=node(entry.kind==='folder'?'button':'span',(entry.kind==='folder'?(expanded.has(entry.path)?'▾ 📁 ':'▸ 📁 '):'')+entry.name+(entry.context?'（續）':''),'zip-tree-label');check.type='checkbox';label.style.setProperty('--zip-depth',entry.depth);label.title=entry.kind==='folder'?entry.path:entry.row.name;
   bindEntryMenu(tr,{panel:'compare',id:(entry.row||entry.members[0]).id,folder:entry.kind==='folder'?entry.path:undefined,sourceRoot:plan?.sourceRoot??$('root').value,target:data.selected.target||''});
   if(entry.kind==='folder'){check.dataset.folder=entry.path;check.setAttribute('aria-label','更新資料夾 '+entry.path+' 內符合篩選的檔案');label.type='button';label.setAttribute('aria-expanded',String(expanded.has(entry.path)));label.setAttribute('aria-label',(expanded.has(entry.path)?'收合':'展開')+'資料夾 '+entry.path);label.addEventListener('click',()=>{expanded.has(entry.path)?expanded.delete(entry.path):expanded.add(entry.path);prefs.expandAll=false;saveView();renderResults();controls();});check.addEventListener('change',()=>{for(const row of members(entry.path))check.checked?selected.add(row.id):selected.delete(row.id);controls();});tr.className='zip-folder-row';const summary=['added','changed','same','blocked'].map(k=>[k,entry.members.filter(r=>r.status===k).length]).filter(([,n])=>n).map(([k,n])=>labels[k]+' '+n).join(' · ');name.append(label);
    const member=entry.members.find(row=>row.destination);
    let destination='';
    if(member){
     const remainingLength=(member.relative||member.name).length-entry.path.length;
     destination=member.destination.slice(0,-remainingLength);
    }
    tr.append(checkCell,name,node('td',summary||entry.members.length+' 個檔案'),node('td',size(entry.members.reduce((n,r)=>n+r.size,0))),node('td',destination,'zip-update-path'));
   }else{const row=entry.row;check.dataset.id=row.id;check.setAttribute('aria-label','更新 '+row.name);check.addEventListener('change',()=>{check.checked?selected.add(row.id):selected.delete(row.id);controls();});name.append(label);tr.append(checkCell,name,node('td',labels[row.status]||row.status,'zip-update-state-'+row.status),node('td',size(row.size)),node('td',(row.destination||'')+(row.error?'\n'+row.error:''),'zip-update-path'));}checkCell.append(check);$('rows').append(tr);
  }
  if(!p.rows.length){const tr=node('tr'),cell=node('td',data.files.length?'沒有符合條件的檔案。':'尚未選擇 ZIP。');cell.colSpan=5;tr.append(cell);$('rows').append(tr);}$('pagination').textContent=p.total?`第 ${page+1}／${p.last+1} 頁 · ${currentRows().length} 個檔案`:'';
 }
 function renderHistory(){$('history').replaceChildren();for(const run of data.runs){const row=node('article');row.append(node('strong',(labels[run.status]||run.status)+' · '+new Date(run.date).toLocaleString()),node('p',run.zipPath+'\n→ '+run.target,'zip-update-path'));for(const [text,action]of [['查看結果','details'],['開啟目標','open-target'],['備份／記錄','open-backup'],['還原這次更新','undo']]){const button=node('button',text,'btn btn-ghost');button.type='button';button.addEventListener('click',()=>runTask(async()=>{const value=await api.command(action,run.id);if(['undo','details'].includes(action)&&!value.canceled){lastResult=value;await refresh();report(value);$('history-panel').open=true;jump('history-panel');}}));if(action==='undo'&&run.status==='restored')button.hidden=true;row.append(button);}$('history').append(row);}if(lastResult){const failures=lastResult.rows.filter(r=>r.error),rows=failures.length?failures:lastResult.rows,block=node('section'),list=node('ul');block.append(node('p',(failures.length?'未完成／衝突 ':'更新結果 ')+rows.length+' 個'+(rows.length>100?'（先顯示 100 個，完整記錄可從「備份／記錄」開啟）':'')));for(const row of rows.slice(0,100))list.append(node('li',({applied:'已套用',restored:'已還原',failed:'失敗',pending:'未執行',writing:'需核對','backed-up':'已備份'}[row.state]||row.state)+' · '+row.relative+(row.error?'：'+row.error:'')));block.append(list);$('history').prepend(block);}}
 function renderComparison(){
  const target=plan?.target||data.selected.target,sourceRoot=plan?.sourceRoot??$('root').value;
  $('compare-target').textContent=target||'尚未選擇目標';
  $('target').textContent=target?'更換目標':'選擇目標資料夾';
  $('compare-root').hidden=!data.files.length;
  $('compare-root').textContent='ZIP 來源層級：'+(sourceRoot?sourceRoot+'/':'保留 ZIP 完整層級');
  $('structure-warning').textContent=plan?.structureWarning||'';
  $('structure-warning').hidden=!plan?.structureWarning;
  $('summary').textContent=plan?['added','changed','same','blocked'].map(k=>labels[k]+' '+plan.rows.filter(r=>r.status===k).length).join(' · '):data.files.length?`ZIP 有 ${data.files.length} 個檔案；請核對來源層級及目標後比較。`:'先選 ZIP 與目標資料夾，再比較檔案。';
  renderResults();
 }
 function render(){if(mode==='normal'){controls();return;}for(const button of root.querySelectorAll('[data-zip-sort]')){const [kind,key]=button.getAttribute('data-zip-sort').split(':'),sort=prefs.sorts[kind],active=sort.key===key;button.parentElement.setAttribute('aria-sort',active?(sort.direction==='asc'?'ascending':'descending'):'none');button.title='按'+(active&&sort.direction==='asc'?'降冪':'升冪')+'排序（自動記住）';button.classList.toggle('zip-sort-active',active);button.setAttribute('data-direction',active?sort.direction:'');}const brief=(path)=>path?.split(/[\\/]/).filter(Boolean).at(-1)||'';$('setup-summary').textContent=[brief(data.selected.zipPath),brief(data.selected.target)].filter(Boolean).join(' → ');$('flow-hint').textContent=busy?'處理中，可從下方查看進度或停止。':plan?'已比較完成，核對勾選項目後按「確認套用」。':data.files.length&&data.selected.target?'可重新比較目前的 ZIP。':'選好來源與目標後會自動比較。';for(const kind of ['source','target'])renderBrowser(kind);renderComparison();renderHistory();controls();}
 async function refresh(){sync(await api.command('state'));}
 async function compare({reveal=true,refreshedSource=false}={}){
  invalidate();
  plan=await api.command('preview',$('root').value);
  selected=new Set(plan.rows.filter(eligible).map(row=>row.id));
  render();
  if(reveal)jump('comparison');
  status((refreshedSource?'來源清單已更新。':'')+(selected.size?'比較完成，請核對勾選項目及目標路徑。':'比較完成，沒有可套用的差異。'));
 }
 async function compareSelection(value,{newZip=false,reveal=true,refreshedSource=false}={}){
  while(value.passwordRequired){
   const password=await askPassword(value);
   value=await api.command(password?'unlock-zip':'skip-zip-password',password||undefined);
  }
  if(value.canceled)return;
  invalidate();
  if(newZip)$('root').value='';
  sync(value);
  if(data.files.length&&data.selected.target)await compare({reveal,refreshedSource});
  else status(data.files.length?'請選擇目標資料夾，選好後會自動比較。':'選擇 ZIP 後會自動比較。');
 }
 async function refreshLocations(){
  const before=data.selected.target;
  const value=await api.command('refresh-locations');
  if(before!==value.selected.target&&value.files.length)await compareSelection(value,{reveal:false});
  else sync(value);
 }
 function report(value){status(`${labels[value.status]||value.status}：已套用 ${value.applied} 個，已還原 ${value.restored} 個。${value.rows.some(r=>r.error)?'請按「更新結果／還原」查看未完成項目。':''}`,value.rows.some(r=>r.error));}
 function askPassword(value){
  const dialog=document.getElementById('zip-password-dialog'),input=document.getElementById('zip-password-input');
  document.getElementById('zip-password-message').textContent=value.name+' · '+value.message;
  input.value='';dialog.returnValue='';dialog.showModal();
  return new Promise(resolve=>dialog.addEventListener('close',()=>{
   const password=dialog.returnValue==='unlock'?input.value:'';
   input.value='';resolve(password);
  },{once:true}));
 }
 async function runTask(task){
  if(busy)return;
  busy=true;status('處理中…');controls();
  try{return await task();}
  catch(error){status(error.message||String(error),true);}
  finally{
   busy=false;
   if($('status').textContent==='處理中…')status(mode==='normal'?'加入 ZIP，選擇目標位置並預覽。':plan?'比較已就緒，請核對後套用。':data.files.length&&data.selected.target?'來源與目標已就緒，可按「重新比較」。':'請選擇 ZIP 與目標資料夾。');
   render();
  }
 }
 function showMode(value){
  mode=value==='normal'?'normal':'compare';
  const normal=mode==='normal';
  $('mode-compare').setAttribute('aria-pressed',String(!normal));
  $('mode-normal').setAttribute('aria-pressed',String(normal));
  for(const id of ['steps','setup','comparison','history-panel','compare-actions'])$(id).hidden=normal;
  for(const id of ['normal','normal-actions'])$(id).hidden=!normal;
  $('drop').textContent=normal?'拖放 ZIP 至此以加入解壓清單。':'拖放一個 ZIP 至此以比較更新。';
 }
 function activateMode(){return mode==='normal'?batch?.activate():refreshLocations();}
 for(const value of ['compare','normal'])$('mode-'+value).addEventListener('click',()=>{
  if(busy||mode===value)return;
  if(mode==='normal')batch?.clearPasswords();
  showMode(value);
  if(value==='normal')batch?.resetMode();
  void runTask(activateMode);
 });
 const on=(id,task)=>$(id).addEventListener('click',()=>runTask(task));
 on('choose',async()=>compareSelection(await api.command('choose-zip'),{newZip:true}));
 on('latest',async()=>compareSelection(await api.command('choose-latest'),{newZip:true,refreshedSource:true}));
 on('add-source',async()=>{const value=await api.command('choose-source-folder');if(!value.canceled){sync(value);status('已記住來源資料夾，可直接點選清單中的 ZIP。');}});
 const chooseTarget=async()=>compareSelection(await api.command('choose-target'));
 on('target',chooseTarget);
 $('sources').addEventListener('change',()=>{if($('sources').value!=='')void runTask(async()=>{sync(await api.command('browse-source',Number($('sources').value)));status('已載入來源位置，請點選 ZIP。');});});
 const switchTarget=(kind,index)=>runTask(async()=>compareSelection(await api.command(kind==='saved'?'select-saved-target':'select-target',index)));
 $('targets').addEventListener('change',()=>{
  if(!$('targets').value)return;
  const [kind,index]=$('targets').value.split(':');void switchTarget(kind,Number(index));
 });
 $('quick-target').addEventListener('change',()=>{
  const {value}=$('quick-target');$('quick-target').value='';
  if(value!==''&&data.savedTargets[Number(value)]!==data.selected.target)void switchTarget('saved',Number(value));
 });
 on('save-target',async()=>{sync(await api.command('save-target'));status('目前目標已儲存為常用位置；之後可從清單選取或移除。');});
 on('forget-target',async()=>{const [kind,index]=$('targets').value.split(':');sync(await api.command('forget-target',{kind,index:Number(index)}));status('已從位置清單移除；目前目標及實體資料夾保留。');});
 $('root').addEventListener('change',()=>void runTask(async()=>{
  if(data.files.length&&data.selected.target)await compare();
  else status('選好目標後會自動比較目前的來源層級。');
 }));
 on('preview',()=>compare());
 on('apply',async()=>{const value=await api.command('apply',{token:plan.token,ids:[...selected]});if(!value.canceled){invalidate();lastResult=value;if(data.selected.target)sync(await api.command('refresh-browser','target'));else await refresh();report(value);if(value.rows.some(r=>r.error)){$('history-panel').open=true;jump('history-panel');}else jump('comparison');}});
 on('open-target',()=>api.command('open-target'));on('select-all',()=>{for(const row of currentRows())if(eligible(row))selected.add(row.id);});on('select-none',()=>selected.clear());
 for(const kind of ['source','target']){on(kind+'-up',async()=>{const value=await api.command(kind+'-up');if(kind==='target')await compareSelection(value,{reveal:false});else{sync(value);status('已返回來源上層。');}});$(kind+'-browser-query').addEventListener('input',()=>{browserPages[kind]=0;renderBrowser(kind);controls();});for(const [suffix,delta]of [['prev',-1],['next',1]])$(kind+'-'+suffix).addEventListener('click',()=>{browserPages[kind]+=delta;renderBrowser(kind);controls();});}
 on('refresh',async()=>{await refreshLocations();status('位置清單已重新整理。');});
 $('cancel').addEventListener('click',async()=>{try{await api.command('cancel');status('已要求停止後續項目；正在完成中的檔案會先安全結束。');}catch(e){status(e.message,true);}});
 for(const id of ['filter','query'])$(id).addEventListener(id==='query'?'input':'change',()=>{treeKey='';renderResults();controls();});
 for(const [id,delta]of [['prev',-1],['next',1]])$(id).addEventListener('click',()=>{page+=delta;renderResults();controls();});
 $('expand-all').addEventListener('click',()=>{expanded=new Set(tree.folders.keys());prefs.expandAll=true;saveView();page=0;renderResults();controls();});$('collapse-all').addEventListener('click',()=>{expanded.clear();prefs.expandAll=false;saveView();page=0;renderResults();controls();});
 const isFileDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
 const hideDrop=()=>$('drop').hidden=true;
 for(const type of ['dragenter','dragover'])root.addEventListener(type,event=>{
  if(!isFileDrag(event))return;
  event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=busy?'none':'copy';$('drop').hidden=busy;
 });
 root.addEventListener('dragleave',event=>{if(!root.contains(event.relatedTarget))hideDrop();});
 root.addEventListener('drop',event=>{
  hideDrop();if(!isFileDrag(event))return;
  event.preventDefault();event.stopPropagation();if(busy)return;
  const files=Array.from(event.dataTransfer.files||[]);
  if(!files.length||files.some(file=>!/\.zip$/i.test(file.name))){status('請拖入 ZIP 檔案。',true);return;}
  if(mode==='compare'&&files.length!==1){status('比較更新一次可使用一個 ZIP。批次處理請切換至「一般解壓」。',true);return;}
  void runTask(async()=>mode==='normal'?batch.drop(files):compareSelection(await api.drop(files[0]),{newZip:true}));
 });
 window.addEventListener?.('blur',hideDrop);
 resizeHandles.forEach(bindPanelResize);
 for(const button of root.querySelectorAll('[data-zip-sort]'))button.addEventListener('click',()=>{const [kind,key]=button.getAttribute('data-zip-sort').split(':'),sort=prefs.sorts[kind];prefs.sorts[kind]={key,direction:sort.key===key&&sort.direction==='asc'?'desc':'asc'};persistView();if(kind==='compare')page=0;else{browserPages[kind]=0;}render();});
 $('go-setup').addEventListener('click',()=>{$('setup').open=true;jump('setup');});$('go-compare').addEventListener('click',()=>jump('comparison'));$('go-history').addEventListener('click',()=>{$('history-panel').open=true;jump('history-panel');});
 api.onProgress?.(value=>{if(busy)status(({extract:'讀取 ZIP','batch-preview':'讀取 ZIP 目錄',batch:'批次解壓',compare:'比較內容',apply:'套用更新',undo:'還原更新'}[value.phase]||'處理中')+` ${value.current}／${value.total}：${value.name}`);});
 window.zipUpdateUI={
  activate:()=>{
   if(busy)return;
   const settings=window.settingsUI?.get();
   prefs=view.normalize(settings?.zipUpdateView||prefs);
   resizeHandles.forEach(renderPanelSize);hideDrop();treeKey='';
   const startup=settings?.zipStartMode||'compare';
   if(configuredMode!==startup){configuredMode=startup;showMode(startup);}
   if(mode==='normal')batch?.resetMode();
   void runTask(activateMode);
  },
  open:()=>window.favoritesUI.show('zip'),
  deactivate:()=>batch?.clearPasswords(),
  isBusy:()=>busy
 };
})();
