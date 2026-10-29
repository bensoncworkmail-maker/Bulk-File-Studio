'use strict';
(() => {
 const $=id=>document.getElementById(id);let callbacks,preview=null,busy=false,pendingRequest=null,requestTimer;
 const tags=()=>$('path-import-tags').value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean);
 function lock(value){busy=value;for(const id of ['path-import-text','path-import-tags','btn-path-import-check','btn-path-import-cancel'])$(id).disabled=value;$('btn-path-import-confirm').disabled=value||!preview||preview.counts.new+preview.counts.existing===0;}
 function invalidate(){preview=null;$('path-import-preview').replaceChildren();$('path-import-status').textContent='先檢查路徑，再確認匯入。';$('btn-path-import-confirm').disabled=true;}
 function open(initialTags=[]){if(busy||callbacks.isBusy())return;$('path-import-text').value='';$('path-import-tags').value=initialTags.join(', ');invalidate();$('path-import-dialog').showModal();$('path-import-text').focus();}
 function queue(request){pendingRequest=request;clearTimeout(requestTimer);const attempt=()=>{if(document.querySelector('dialog[open]')||callbacks.isBusy()){requestTimer=setTimeout(attempt,350);return;}const value=pendingRequest;pendingRequest=null;open(value.tags||[]);};requestTimer=setTimeout(attempt,100);}
 function showPreview(result){
  const labels={new:'新增',existing:'已收藏',error:'略過',duplicate:'重複'};const container=$('path-import-preview');container.replaceChildren();
  for(const row of result.rows.slice(0,100)){const item=document.createElement('div');item.className='path-import-row '+row.status;const line=document.createElement('strong');line.textContent=`第 ${row.line} 行 · ${labels[row.status]}`;const filepath=document.createElement('span');filepath.textContent=row.path.length>1000?row.path.slice(0,1000)+'…':row.path;if(row.path.length<=32767)filepath.title=row.path;const message=document.createElement('small');message.textContent=row.message;item.append(line,filepath,message);container.appendChild(item);}
  $('path-import-status').textContent=`可新增 ${result.counts.new} 項 · 已收藏 ${result.counts.existing} 項 · 略過 ${result.counts.error} 項 · 重複 ${result.counts.duplicate} 行${result.rows.length>100?'（預覽前 100 行；匯入會處理全部有效路徑）':''}`;
 }
 async function check(){if(busy)return;preview=null;lock(true);try{preview=await window.favoritesAPI.previewImport($('path-import-text').value,tags());showPreview(preview);}catch(e){$('path-import-preview').replaceChildren();$('path-import-status').textContent=String(e.message||e);}finally{lock(false);}}
 async function commit(){if(busy||!preview)return;lock(true);try{const result=await window.favoritesAPI.importPaths($('path-import-text').value,tags(),preview.token);$('path-import-dialog').close();await callbacks.onImported();callbacks.showToast(`已新增 ${result.added} 項；已收藏 ${result.existing} 項；略過 ${result.skipped} 項及 ${result.duplicates} 行重複路徑`,'success');if(result.issues.length)callbacks.showFailure('部分路徑未能匯入',result.issues.join('\n'));}catch(e){preview=null;$('path-import-status').textContent=String(e.message||e);}finally{lock(false);}}
 function init(options){callbacks=options;$('btn-path-import-check').addEventListener('click',check);$('btn-path-import-confirm').addEventListener('click',commit);$('btn-path-import-cancel').addEventListener('click',()=>{if(!busy)$('path-import-dialog').close();});for(const id of ['path-import-text','path-import-tags'])$(id).addEventListener('input',invalidate);$('path-import-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});}
 window.pathImportUI=Object.freeze({init,open,queue,hasOpenDialog:()=>$('path-import-dialog').open});
})();
