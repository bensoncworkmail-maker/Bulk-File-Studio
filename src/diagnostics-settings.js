'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.desktopAPI;
 function init({showFailure}){
  if(!api?.diagnosticsStatus)return;
  let busy=false,generation=0,signature='';
  function render(result){
   $('diagnostics-folder').value=result.folder;
   $('diagnostics-status').textContent=(result.enabled?'紀錄已開啟':'紀錄已關閉')+' · '+result.files.length+' 個檔案 · '+(result.bytes/1024).toFixed(1)+' KiB'+(result.suppressed?' · 本次已合併／略過 '+result.suppressed+' 次重複或過量錯誤':'')+(result.error?' · 紀錄功能發生問題：'+result.error:'');
   if(!result.recent)return;
   const list=$('diagnostics-list');list.replaceChildren();
   for(const entry of result.recent){const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre');summary.textContent=entry.at+' · '+entry.source+' / '+entry.action+' · '+entry.message.slice(0,100);body.textContent=[entry.message,entry.code&&'代碼：'+entry.code,entry.stack].filter(Boolean).join('\n');body.className='diagnostics-entry';details.append(summary,body);list.append(details);}
   if(!result.recent.length){const empty=document.createElement('p');empty.textContent='目前沒有錯誤紀錄。';list.append(empty);}
  }
  async function refresh(){const current=++generation;try{const result=await api.diagnosticsStatus($('diagnostics-recent').open);if(current===generation)render(result);}catch(error){if(current===generation)$('diagnostics-status').textContent='無法讀取紀錄：'+String(error.message||error);}}
  async function run(task){if(busy)return;busy=true;const buttons=['refresh','open','export','clear'].map(id=>$('diagnostics-'+id));buttons.forEach(button=>button.disabled=true);try{const result=await task();await refresh();if(result?.canceled)$('diagnostics-status').textContent+=' · 已取消';else if(result?.path)$('diagnostics-status').textContent+=' · 已匯出 '+result.count+' 筆：'+result.path;}catch(error){showFailure('無法處理錯誤紀錄',error);}finally{busy=false;buttons.forEach(button=>button.disabled=false);}}
  $('diagnostics-refresh').addEventListener('click',()=>run(()=>refresh()));
  $('diagnostics-open').addEventListener('click',()=>run(()=>api.openDiagnostics()));
  $('diagnostics-export').addEventListener('click',()=>run(()=>api.exportDiagnostics()));
  $('diagnostics-clear').addEventListener('click',()=>run(()=>api.clearDiagnostics()));
  $('diagnostics-recent').addEventListener('toggle',()=>{if($('diagnostics-recent').open)refresh();});
  api.onChanged(payload=>{if(!payload.settings)return;const next=JSON.stringify(['diagnosticsEnabled','diagnosticsIncludeStack','diagnosticsIncludePaths','diagnosticsRetentionDays'].map(key=>payload.settings[key]));if(signature!==next){signature=next;refresh();}});
  refresh();
 }
 window.diagnosticsSettingsUI=Object.freeze({init});
})();
