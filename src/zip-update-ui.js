'use strict';
(()=>{
 const api=window.zipUpdateAPI;if(!api)return;const $=id=>document.getElementById('zip-update-'+id),dialog=$('dialog');if(!dialog)return;
 const labels={added:'新增',changed:'內容不同',same:'內容相同',blocked:'無法處理',source:'待比較',completed:'已完成',partial:'部分完成',canceled:'已停止',running:'未完成，可檢查／還原',restored:'已還原','partial-undo':'部分還原'};
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 let data={files:[],sourceFolders:[],targetFolders:[],roots:[],runs:[],selected:{}},plan=null,selected=new Set(),page=0,busy=false,lastResult=null;
 const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
 const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
 function invalidate(){plan=null;selected.clear();page=0;lastResult=null;}
 function options(field,values,placeholder){const old=field.value;field.replaceChildren();const empty=node('option',placeholder);empty.value='';field.append(empty);values.forEach((text,i)=>{const opt=node('option',text);opt.value=String(i);field.append(opt);});field.value=old;}
 function sync(next){data=next;options($('sources'),data.sourceFolders,'最近使用的來源位置');options($('targets'),data.targetFolders,'選擇最近目的地');const old=$('root').value;$('root').replaceChildren();for(const text of ['',...data.roots]){const opt=node('option',text?text+'／內的檔案':'保留 ZIP 完整層級');opt.value=text;$('root').append(opt);}$('root').value=data.roots.includes(old)?old:'';$('source-path').textContent=data.selected.zipPath||'尚未選擇 ZIP';$('target-path').textContent=data.selected.target||'尚未選擇目標';$('targets').value=data.selected.target?String(data.targetFolders.indexOf(data.selected.target)):'';render();}
 function currentRows(){const query=$('query').value.toLowerCase(),filter=$('filter').value;return (plan?.rows||data.files.map(r=>({...r,status:'source',destination:''}))).filter(r=>(!plan||filter==='all'||filter==='changes'&&r.status!=='same'||filter===r.status)&&(!query||(r.relative||r.name).toLowerCase().includes(query)||r.destination.toLowerCase().includes(query)));}
 function controls(){for(const field of dialog.querySelectorAll('button,input,select'))field.disabled=busy;$('cancel').disabled=false;$('cancel').hidden=!busy;$('apply').disabled=busy||!plan||!selected.size;$('apply').textContent='確認套用'+(selected.size?'（'+selected.size+' 個）':'');$('preview').disabled=busy||!data.files.length||!data.selected.target;$('open-target').disabled=busy||!data.selected.target;$('prev').disabled=busy||page===0;$('next').disabled=busy||page>=Math.ceil(currentRows().length/100)-1;$('select-all').disabled=$('select-none').disabled=busy||!plan;for(const input of $('rows').querySelectorAll('input')){const row=plan?.rows.find(r=>r.id===input.dataset.id);input.disabled=busy||!row||!['added','changed'].includes(row.status);}}
 function render(){
  const rows=currentRows(),last=Math.max(0,Math.ceil(rows.length/100)-1);page=Math.min(page,last);$('rows').replaceChildren();
  for(const row of rows.slice(page*100,page*100+100)){
   const tr=node('tr'),checkCell=node('td'),check=node('input');check.type='checkbox';check.dataset.id=row.id;check.checked=selected.has(row.id);check.disabled=busy||!['added','changed'].includes(row.status);check.setAttribute('aria-label','更新 '+(row.relative||row.name));check.addEventListener('change',()=>{check.checked?selected.add(row.id):selected.delete(row.id);controls();});checkCell.append(check);tr.append(checkCell,node('td',row.name,'zip-update-path'),node('td',labels[row.status]||row.status,'zip-update-state-'+row.status),node('td',size(row.size)),node('td',row.destination+(row.error?'\n'+row.error:''),'zip-update-path'));$('rows').append(tr);
  }
  if(!rows.length){const cell=node('td',data.files.length?'沒有符合條件的檔案。':'尚未選擇 ZIP。');cell.colSpan=5;const tr=node('tr');tr.append(cell);$('rows').append(tr);}
  $('page').textContent=rows.length?`第 ${page+1}／${last+1} 頁 · ${rows.length} 個檔案`:'';
  $('summary').textContent=plan?['added','changed','same','blocked'].map(k=>labels[k]+' '+plan.rows.filter(r=>r.status===k).length).join(' · '):data.files.length?`ZIP 有 ${data.files.length} 個檔案；請核對來源層級及目標後比較。`:'先選 ZIP 與目標資料夾，再比較檔案。';
  $('history').replaceChildren();for(const run of data.runs){const row=node('article'),head=node('strong',(labels[run.status]||run.status)+' · '+new Date(run.date).toLocaleString()),detail=node('p',run.zipPath+'\n→ '+run.target,'zip-update-path');row.append(head,detail);for(const [text,action]of [['查看結果','details'],['開啟目標','open-target'],['備份／記錄','open-backup'],['還原這次更新','undo']]){const b=node('button',text,'btn btn-ghost');b.type='button';b.addEventListener('click',()=>runTask(async()=>{const value=await api.command(action,run.id);if(['undo','details'].includes(action)&&!value.canceled){lastResult=value;await refresh();report(value);}return value;}));if(action==='undo'&&run.status==='restored')b.hidden=true;row.append(b);}$('history').append(row);}
  if(lastResult){const failures=lastResult.rows.filter(r=>r.error),list=node('ul'),results=failures.length?failures:lastResult.rows;const title=node('p',(failures.length?'未完成／衝突 '+failures.length+' 個':'更新結果 '+results.length+' 個')+(results.length>100?'（先顯示 100 個，完整記錄可從「備份／記錄」開啟）':''));for(const r of results.slice(0,100))list.append(node('li',({applied:'已套用',restored:'已還原',failed:'失敗',pending:'未執行',writing:'需核對','backed-up':'已備份'}[r.state]||r.state)+' · '+r.relative+(r.error?'：'+r.error:'')));const block=node('section');block.append(title,list);$('history').prepend(block);}
  controls();
 }
 async function refresh(){sync(await api.command('state'));}
 function report(value){status(`${labels[value.status]||value.status}：已套用 ${value.applied} 個，已還原 ${value.restored} 個。${value.rows.some(r=>r.error)?'請查看下方未完成項目。':''}`,value.rows.some(r=>r.error));}
 async function runTask(task){if(busy)return;busy=true;status('處理中…');controls();try{return await task();}catch(e){status(e.message||String(e),true);}finally{busy=false;render();}}
 function on(id,task){$(id).addEventListener('click',()=>runTask(task));}
 on('choose',async()=>{invalidate();const value=await api.command('choose-zip');if(!value.canceled){$('root').value='';sync(value);status('ZIP 已讀取；選擇目標並比較檔案。');}});
 on('add-source',async()=>{const value=await api.command('choose-source-folder');if(!value.canceled){sync(value);status('已記住常用 ZIP 來源資料夾。');}});
 on('target',async()=>{invalidate();const value=await api.command('choose-target');if(!value.canceled){sync(value);status('目標已設定，請比較檔案。');}});
 $('sources').addEventListener('change',()=>{if($('sources').value!=='')void runTask(async()=>{invalidate();const value=await api.command('choose-zip',Number($('sources').value));if(!value.canceled){$('root').value='';sync(value);status('已從常用位置讀取 ZIP。');}});});
 $('targets').addEventListener('change',()=>{if($('targets').value!=='')void runTask(async()=>{invalidate();sync(await api.command('select-target',Number($('targets').value)));status('目標已設定，請重新比較。');});});
 $('root').addEventListener('change',()=>{invalidate();render();status('來源層級已變更，請重新比較。');});
 on('preview',async()=>{invalidate();plan=await api.command('preview',$('root').value);selected=new Set(plan.rows.filter(r=>['added','changed'].includes(r.status)).map(r=>r.id));page=0;status('比較完成，請核對完整目標路徑與勾選項目。');});
 on('apply',async()=>{const value=await api.command('apply',{token:plan.token,ids:[...selected]});if(!value.canceled){invalidate();lastResult=value;await refresh();report(value);}});
 on('open-target',()=>api.command('open-target'));on('select-all',()=>{for(const row of currentRows())if(['added','changed'].includes(row.status))selected.add(row.id);});on('select-none',()=>selected.clear());
 $('cancel').addEventListener('click',async()=>{try{await api.command('cancel');status('已要求停止後續項目；正在完成中的檔案會先安全結束。');}catch(e){status(e.message,true);}});
 for(const id of ['filter','query'])$(id).addEventListener(id==='query'?'input':'change',()=>{page=0;render();});
 $('prev').addEventListener('click',()=>{if(page){page--;render();}});$('next').addEventListener('click',()=>{page++;render();});
 const close=()=>{if(!busy)dialog.close();};$('close').addEventListener('click',close);dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 const open=()=>{document.getElementById('nav-files').open=false;if(!dialog.open)dialog.showModal();void runTask(refresh);};document.getElementById('btn-zip-update').addEventListener('click',open);
 $('drop').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('choose').click();}});
 for(const type of ['dragover','drop'])$('drop').addEventListener(type,event=>{event.preventDefault();event.stopPropagation();if(type==='drop'&&!busy){const files=[...(event.dataTransfer?.files||[])];if(files.length!==1||!/\.zip$/i.test(files[0].name)){status('請拖入一個 ZIP 檔案。',true);return;}void runTask(async()=>{invalidate();$('root').value='';sync(await api.drop(files[0]));status('ZIP 已讀取，請比較檔案。');});}});
 api.onProgress?.(value=>{if(busy)status(({extract:'讀取 ZIP',compare:'比較內容',apply:'套用更新',undo:'還原更新'}[value.phase]||'處理中')+` ${value.current}／${value.total}：${value.name}`);});
 window.zipUpdateUI={open,isBusy:()=>busy};
})();
