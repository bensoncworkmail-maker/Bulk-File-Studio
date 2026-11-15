'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.everythingAPI;
 let callbacks,active=false,data={queries:[],refreshSeconds:60,engine:{}},currentId=null,tag=null,selected=new Set(),anchor=null,renaming=null,busy=false,loading=false,editing=null,timer,request=0,refreshRequest=0;
 const node=(name,text,className)=>{const el=document.createElement(name);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 const button=(text,run,className='btn btn-ghost')=>{const el=node('button',text,className);el.type='button';el.disabled=busy;el.addEventListener('click',run);return el;};
 const current=()=>data.queries.find(item=>item.id===currentId);
 const ready=()=>data.engine.supported&&data.engine.enabled&&data.engine.configured;
 const filtered=()=>data.queries.filter(item=>tag===null||(tag===''?!item.tags.length:item.tags.some(name=>name.toLocaleLowerCase()===tag)));
 const blocked=()=>busy||loading||callbacks?.isBusy?.()||Boolean(document.querySelector('dialog[open]'));
 function visible(){return active&&!$('favorites-page').classList.contains('hidden')&&!document.hidden;}
 function schedule(){clearInterval(timer);if(active&&data.refreshSeconds)timer=setInterval(()=>{if(visible()&&!busy&&!loading&&!selected.size&&!document.querySelector('dialog[open]')&&current()?.enabled&&ready())void refresh();},data.refreshSeconds*1000);}
 async function load(update=false){
  const id=++request;loading=true;
  try{const value=await api.trackingList();if(id!==request)return;data=value;selected.clear();anchor=null;
   if(tag&&!data.queries.some(item=>item.tags.some(name=>name.toLocaleLowerCase()===tag)))tag=null;
   if(!filtered().some(item=>item.id===currentId))currentId=filtered()[0]?.id||null;
   loading=false;render();schedule();if(update&&visible()&&current()?.enabled&&ready())await refresh();
  }catch(error){if(id===request)$('everything-tracking-status').textContent=String(error.message||error);}
  finally{if(id===request){loading=false;renderControls();}}
 }
 async function refresh(){
  const query=current();if(!query||busy||!ready()||!query.enabled)return;
  const id=++refreshRequest;let failure='';busy=true;selected.clear();anchor=null;render();$('everything-tracking-status').textContent='正在查詢 Everything…';
  try{const value=await api.trackingRefresh(query.id);if(id===refreshRequest&&currentId===query.id){data=value;render();}}
  catch(error){failure=String(error.message||error);}
  finally{busy=false;render();if(failure&&id===refreshRequest)$('everything-tracking-status').textContent=failure;
   // Re-entry may have loaded the snapshot before this invalidated request finished.
   if(active&&id!==refreshRequest)void load(currentId!==query.id);
   else if(active&&currentId!==query.id)void refresh();
  }
 }
 function renderControls(){
  const query=current(),rows=query?.snapshot?.rows||[],has=query&&ready();
  for(const name of ['refresh','edit','delete'])$('everything-tracking-'+name).disabled=busy||!query||(name==='refresh'&&(!has||!query.enabled));
  for(const name of ['select-all','select-none','select-invert'])$('everything-tracking-'+name).disabled=busy||loading||!rows.length;
  for(const name of ['favorite','copy','copy-names','copy-folders','rename','move','bulk-open','bulk-locations'])$('everything-tracking-'+name).disabled=busy||loading||!selected.size;
  $('everything-tracking-rename-item').disabled=busy||loading||selected.size!==1;
  $('everything-tracking-interval').value=String(data.refreshSeconds);$('everything-tracking-interval').disabled=busy;
  $('settings-everything-tracking-refresh').value=String(data.refreshSeconds);
  $('everything-tracking-selected').textContent='已選 '+selected.size+' 項';
 }
 function render(){
  if(!callbacks)return;
  const tags=new Map();for(const query of data.queries)for(const name of query.tags){const key=name.toLocaleLowerCase(),prior=tags.get(key);tags.set(key,{key,name:prior?.name||name,count:(prior?.count||0)+1});}
  $('everything-tracking-tags').replaceChildren(...[{key:null,name:'全部追蹤',count:data.queries.length},{key:'',name:'未加標籤',count:data.queries.filter(item=>!item.tags.length).length},...[...tags.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'))].map(item=>{
   const control=button('',()=>{if(busy)return;tag=item.key;currentId=filtered()[0]?.id||null;selected.clear();render();void refresh();},'favorite-tag-filter'+(tag===item.key?' active':''));control.append(node('span',item.name),node('span',String(item.count),'count-pill'));control.setAttribute('aria-pressed',String(tag===item.key));control.title=item.count+' 個追蹤搜尋';return control;
  }));
  $('everything-tracking-rules').replaceChildren(...filtered().map(query=>{
   const control=button('',()=>{if(busy)return;currentId=query.id;selected.clear();render();void refresh();},'everything-tracking-rule'+(currentId===query.id?' active':''));control.append(node('strong',query.name),node('small',query.enabled?query.tags.join(' · ')||'未加標籤':'已暫停'));control.setAttribute('aria-pressed',String(currentId===query.id));return control;
  }));
  const query=current(),snapshot=query?.snapshot,rows=snapshot?.rows||[];
  $('everything-tracking-title').textContent=query?.name||'追蹤 Everything 搜尋';$('everything-tracking-command').textContent=query?.text||'新增搜尋命令及標籤，追蹤符合條件的檔案與資料夾。';
  const status=$('everything-tracking-status');status.classList.toggle('error',Boolean(snapshot?.error));
  status.textContent=!ready()?'請在設定 → 啟動選取 es.exe 並啟用 Everything；此功能僅適用於 Windows。':!query?'尚無追蹤搜尋，按「＋ 追蹤搜尋」新增。':!query.enabled?'已暫停追蹤；可從編輯搜尋重新啟用。':snapshot?.error?'更新失敗：'+snapshot.error+(snapshot.checkedAt?'；保留 '+new Date(snapshot.checkedAt).toLocaleString('zh-Hant')+' 的上次結果。':''):!snapshot?'尚未查詢，按「立即更新」讀取結果。':'已更新 '+new Date(snapshot.checkedAt).toLocaleString('zh-Hant')+' · '+rows.length+' 項'+(snapshot.truncated?'（超過上限，只顯示前 500 項）':'')+(snapshot.skipped?' · 略過 '+snapshot.skipped+' 項無法存取的位置':'');
  const list=$('everything-tracking-results'),scroll=list.scrollTop,focused=list.contains(document.activeElement);list.replaceChildren();
  rows.forEach((item,index)=>{
   const row=node('article',undefined,'everything-tracking-row'),check=node('input');check.type='checkbox';check.checked=selected.has(index);check.disabled=busy;row.classList.toggle('selected',check.checked);check.setAttribute('aria-label','選取 '+item.name);check.addEventListener('change',()=>{if(blocked())return;check.checked?selected.add(index):selected.delete(index);anchor=index;row.classList.toggle('selected',check.checked);renderControls();});
   row.addEventListener('click',event=>{
    if(blocked()||event.button!==undefined&&event.button!==0||event.target.closest('button,input,a,select,textarea,[contenteditable]')||window.getSelection?.()?.toString())return;
    if(event.shiftKey&&anchor!==null){if(!event.ctrlKey&&!event.metaKey)selected.clear();for(let i=Math.min(anchor,index);i<=Math.max(anchor,index);i++)selected.add(i);}
    else if(event.ctrlKey||event.metaKey){selected.has(index)?selected.delete(index):selected.add(index);anchor=index;}
    else {selected=new Set([index]);anchor=index;}
    render();$('everything-tracking-results').focus();
   });
   const text=node('div',undefined,'everything-tracking-file');text.append(button(item.name,()=>void action('open',[index]),'workspace-favorite-link'),button(item.path,()=>void action('show',[index]),'everything-tracking-path'));
   const size=item.type==='folder'?'資料夾':Number.isFinite(item.size)?(item.size>=1048576?(item.size/1048576).toLocaleString('zh-Hant',{maximumFractionDigits:1})+' MB':item.size.toLocaleString('zh-Hant')+' bytes'):'檔案';text.append(node('small',size+(Number.isFinite(item.modifiedMs)?' · 修改 '+new Date(item.modifiedMs).toLocaleString('zh-Hant'):'')));
   const tools=node('div',undefined,'everything-tracking-actions');tools.append(button('開啟',()=>void action('open',[index])),button('定位',()=>void action('show',[index])));row.append(check,text,tools);list.append(row);
  });
  if(query&&snapshot&&!rows.length&&!snapshot.error)list.append(node('p','目前沒有符合條件的結果。','list-empty'));
  list.scrollTop=scroll;renderControls();if(focused)list.focus();
 }
 function selectResults(kind){
  if(blocked())return;const rows=current()?.snapshot?.rows||[];
  selected=new Set(rows.map((_,i)=>i).filter(i=>kind==='all'||kind==='invert'&&!selected.has(i)));
  if(kind==='none')anchor=null;
  render();$('everything-tracking-results').focus();
 }
 async function action(kind,indices=[...selected]){
  const query=current();if(!query?.snapshot||blocked()||!indices.length)return;
  busy=true;render();
  try{const result=await api.trackingAction(query.id,query.snapshot.token,indices,kind);
   if(kind==='favorite'){callbacks.showToast('已保留 '+result.added+' 項一般收藏；'+result.existing+' 項已存在');if(result.issues?.length)callbacks.showFailure('部分結果未能收藏',result.issues.join('\n'));}
   else if(['copy','copy-names','copy-folders'].includes(kind))callbacks.showToast('已複製 '+result.copied+' 項'+({'copy':'路徑','copy-names':'檔名','copy-folders':'所在資料夾'}[kind]));
   else if(kind==='rename')callbacks.onRename(result);
   else if(kind==='move')await window.movingUI.start(result.paths,{sourceLabel:'Everything 追蹤結果'});
   else if(kind==='bulk-open'||kind==='bulk-locations'){if(!result.canceled){callbacks.showToast('已開啟 '+result.opened+' 項');if(result.failures?.length)callbacks.showFailure('部分項目未能開啟',result.failures.join('\n'));}}
  }catch(error){callbacks.showFailure('追蹤結果操作未完成',error);}
  finally{busy=false;render();}
 }
 function renameItem(){
  if(blocked())return;if(selected.size!==1){callbacks.showToast('請只選取一個項目；多個檔案請使用「批次改名」。');return;}
  const query=current(),index=[...selected][0],item=query?.snapshot?.rows[index];if(!item)return;
  renaming={id:query.id,token:query.snapshot.token,index};
  const name=item.path.split(/[\\/]/).at(-1);$('everything-item-rename-source').textContent=item.path;
  $('everything-item-rename-name').value=name;$('everything-item-rename-error').textContent='';
  $('everything-item-rename-dialog').showModal();const input=$('everything-item-rename-name');input.focus();const end=item.type==='file'&&name.lastIndexOf('.')>0?name.lastIndexOf('.'):name.length;input.setSelectionRange?.(0,end);
 }
 async function saveItemName(){
  if(!renaming||busy)return;const target=renaming;busy=true;renderControls();
  for(const id of ['everything-item-rename-name','everything-item-rename-save','everything-item-rename-cancel'])$(id).disabled=true;
  try{
   const result=await api.trackingAction(target.id,target.token,[target.index],'rename-item',{name:$('everything-item-rename-name').value});
   $('everything-item-rename-dialog').close();callbacks.showToast(result.changed?'已重新命名':'名稱未變更');
   if(result.warning)callbacks.showFailure('改名完成，請留意',result.warning);busy=false;await load(true);
  }catch(error){$('everything-item-rename-error').textContent=String(error.message||error);}
  finally{busy=false;for(const id of ['everything-item-rename-name','everything-item-rename-save','everything-item-rename-cancel'])$(id).disabled=false;renderControls();}
 }
 function editor(query=null){
  if(busy||editing||document.querySelector('dialog[open]'))return;
  editing={id:query?.id||null};$('everything-rule-title').textContent=query?'編輯追蹤搜尋':'追蹤 Everything 搜尋';
  for(const name of ['name','text','mode','type'])$('everything-rule-'+name).value=query?.[name]||(name==='mode'?'syntax':name==='type'?'all':'');
  $('everything-rule-tags').value=query?.tags.join(', ')||'';$('everything-rule-enabled').checked=query?.enabled!==false;$('everything-rule-error').textContent='';$('everything-tracking-dialog').showModal();$('everything-rule-name').focus();
 }
 async function save(){
  if(!editing||busy)return;
  busy=true;for(const control of $('everything-tracking-dialog').querySelectorAll('input,textarea,select,button'))control.disabled=true;
  try{const query=await api.trackingSave({...editing,name:$('everything-rule-name').value,text:$('everything-rule-text').value,mode:$('everything-rule-mode').value,type:$('everything-rule-type').value,tags:$('everything-rule-tags').value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean),enabled:$('everything-rule-enabled').checked});currentId=query.id;tag=null;selected.clear();$('everything-tracking-dialog').close();busy=false;await load(true);}
  catch(error){$('everything-rule-error').textContent=String(error.message||error);}
  finally{busy=false;for(const control of $('everything-tracking-dialog').querySelectorAll('input,textarea,select,button'))control.disabled=false;render();}
 }
 async function remove(){const query=current();if(!query||busy||!window.confirm('移除「'+query.name+'」追蹤？實際檔案與一般收藏會保留。'))return;busy=true;try{data=await api.trackingRemove(query.id);currentId=null;selected.clear();}catch(error){callbacks.showFailure('無法移除追蹤',error);}finally{busy=false;await load(true);}}
 async function interval(control){try{data=await api.trackingConfigure(Number(control.value));schedule();renderControls();}catch(error){callbacks.showFailure('無法儲存更新間隔',error);renderControls();}}
 function activate(value){active=value;if(!value){request++;refreshRequest++;clearInterval(timer);return;}if(callbacks)void load(true);}
 function keydown(event){
  if(event.defaultPrevented||event.isComposing||event.repeat||event.altKey||!visible()||blocked())return;
  const target=event.target,input=target.closest('input');
  if(target.closest('textarea,select,[contenteditable]')||input&&input.type!=='checkbox')return;
  const ctrl=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();let run;
  if(ctrl&&key==='a')run=()=>selectResults(event.shiftKey?'invert':'all');
  else if(ctrl&&key==='c'&&selected.size)run=()=>action(event.shiftKey?'copy-names':'copy');
  else if(!ctrl&&!event.shiftKey&&key==='escape')run=()=>selectResults('none');
  else if(!ctrl&&!event.shiftKey&&key==='f5'&&current()?.enabled&&ready())run=refresh;
  else if(!ctrl&&!event.shiftKey&&key==='f2'&&selected.size)run=renameItem;
  else if(!event.shiftKey&&key==='enter'&&selected.size&&!target.closest('button,a'))run=()=>action(ctrl?'bulk-locations':'bulk-open');
  else if(ctrl&&event.shiftKey&&key==='m'&&selected.size)run=()=>action('move');
  if(run){event.preventDefault();event.stopPropagation();void run();}
 }
 function init(options){
  callbacks=options;$('everything-tracking-new').addEventListener('click',()=>editor());$('everything-tracking-edit').addEventListener('click',()=>editor(current()));$('everything-tracking-delete').addEventListener('click',remove);$('everything-tracking-refresh').addEventListener('click',refresh);
  for(const name of ['all','none','invert'])$('everything-tracking-select-'+name).addEventListener('click',()=>selectResults(name));
  for(const name of ['copy','copy-names','copy-folders','favorite','rename','move','bulk-open','bulk-locations'])$('everything-tracking-'+name).addEventListener('click',()=>action(name));
  $('everything-tracking-rename-item').addEventListener('click',renameItem);
  $('everything-item-rename-form').addEventListener('submit',event=>{event.preventDefault();void saveItemName();});
  $('everything-item-rename-cancel').addEventListener('click',()=>{if(!busy)$('everything-item-rename-dialog').close();});
  $('everything-item-rename-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('everything-item-rename-dialog').addEventListener('close',()=>{renaming=null;});
  $('everything-tracking-panel').addEventListener('keydown',keydown);
  for(const name of ['everything-tracking-interval','settings-everything-tracking-refresh'])$(name).addEventListener('change',()=>interval($(name)));
  $('everything-rule-form').addEventListener('submit',event=>{event.preventDefault();void save();});$('everything-rule-cancel').addEventListener('click',()=>{if(!busy)$('everything-tracking-dialog').close();});$('everything-tracking-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});$('everything-tracking-dialog').addEventListener('close',()=>{editing=null;});
  api.onTrackingChanged(()=>{void load(false);});void load(active);
 }
 window.everythingTrackingUI={init,activate,select:id=>{currentId=id;selected.clear();},render};
})();
