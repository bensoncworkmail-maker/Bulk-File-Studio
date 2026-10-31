'use strict';
(() => {
 const $=id=>document.getElementById(id);
 let original=[],paths=[],plan=[],folder='',callbacks,busy=false,previewing=false,sourceLabel='目前選取';
 const options=()=>({conflict:$('move-conflict').value,scope:$('move-scope').value});
 function controls(){
  for(const id of ['btn-move-cancel','btn-move-target','move-conflict','move-scope'])$(id).disabled=busy||previewing;
  $('btn-move-target').disabled=busy||previewing||!paths.length;
  $('btn-move-confirm').disabled=busy||previewing||!plan.length;
 }
 function sourceSummary(){
  const whole=$('move-scope').value==='folders';
  $('move-source-summary').textContent=(whole?'完整來源資料夾':sourceLabel)+' · '+paths.length+' 個來源';
  $('move-source-list').textContent=paths.join('\n');
  $('move-scope-note').textContent=whole
   ? '將搬移下列完整來源資料夾，包含未勾選、未載入的子檔案及空資料夾；保留原有層級。'
   : '只使用原來選取的項目。檔案會直接放入目標；已選資料夾仍包含全部子項目。';
 }
 async function preview(){
  $('move-preview-list').textContent='正在檢查來源及子檔案…';
  plan=await window.renameAPI.movePreview(original,folder,options());
  const folders=plan.filter(m=>m.kind==='folder').length;
  $('move-count').textContent=`預覽：${plan.length-folders} 個檔案、${folders} 個資料夾。確認後才會執行搬移。`;
  $('move-preview-list').textContent=plan.map(m=>(m.kind==='folder'?'[資料夾] ':'')+m.source+' → '+m.destination).join('\n');
 }
 async function refreshSources(){
  if(busy||previewing)return;
  previewing=true;plan=[];paths=[];sourceSummary();$('move-source-summary').textContent='正在核對來源…';$('move-preview-list').textContent='';controls();
  try{
   paths=await window.renameAPI.moveSources(original,$('move-scope').value);sourceSummary();
   $('move-count').textContent=`已使用 ${paths.length} 個來源項目，接著只需選擇目標位置。`;
   if(folder)await preview();
  }catch(error){
   plan=[];if(paths.length){$('move-count').textContent='目標預覽未完成，請調整目標或同名處理方式。';$('move-preview-list').textContent=String(error.message||error);}
   else{$('move-count').textContent='來源範圍未能確認，請調整搬移方式。';$('move-source-list').textContent=String(error.message||error);$('move-source-summary').textContent='來源未能確認';$('move-preview-list').textContent='';}
  }finally{previewing=false;controls();}
 }
 async function start(selected,{sourceLabel:label='目前選取',scope='selected'}={}){
  if(busy||previewing||callbacks.isBusy?.()||!selected.length||$('move-dialog').open)return;
  original=[...new Set(selected)];sourceLabel=label;plan=[];paths=[];folder='';
  $('move-scope').value=scope==='folders'?'folders':'selected';$('move-conflict').value='stop';
  $('move-target').textContent='尚未選取';$('move-source-summary').textContent='正在核對來源…';$('move-source-list').textContent='';$('move-preview-list').textContent='';
  $('move-dialog').showModal();await refreshSources();
 }
 async function chooseSources(){
  if(busy||previewing||callbacks.isBusy?.())return;
  try{const selected=await window.renameAPI.chooseMoveSources();if(selected.length)await start(selected,{sourceLabel:'另外選取的完整資料夾',scope:'folders'});}
  catch(error){callbacks.showFailure('無法選取來源',error);}
 }
 async function choose(reuse=false){
  if(busy||previewing||!paths.length)return;
  previewing=true;plan=[];controls();
  try{
   const selected=reuse?folder:await window.renameAPI.chooseMoveFolder();if(!selected)return;
   folder=selected;$('move-target').textContent=folder;await preview();
  }catch(error){plan=[];$('move-preview-list').textContent=String(error.message||error);}
  finally{previewing=false;controls();}
 }
 async function execute(){
  if(busy||previewing||!plan.length)return;
  busy=true;controls();$('move-count').textContent='正在搬移及校驗，請保持來源與目標磁碟連接…';
  try{
   const result=await window.renameAPI.moveFiles(original,folder,plan,options());$('move-dialog').close();await callbacks.onMoved(result);
   if(result.warning)callbacks.showFailure('搬移完成，請留意',result.warning);
  }catch(error){callbacks.showFailure('搬移未完成',error);$('move-count').textContent='搬移未完成，請核對錯誤訊息後重新預覽。';}
  finally{plan=[];busy=false;controls();}
 }
 window.movingUI=Object.freeze({start,chooseSources,hasOpenDialog:()=>$('move-dialog').open,init:config=>{
  callbacks=config;$('move-scope').addEventListener('change',refreshSources);
  $('move-conflict').addEventListener('change',()=>{if(busy||previewing)return;plan=[];controls();if(folder)return choose(true);});
  $('btn-move-target').addEventListener('click',()=>choose());$('btn-move-cancel').addEventListener('click',()=>$('move-dialog').close());
  $('btn-move-confirm').addEventListener('click',execute);$('move-dialog').addEventListener('cancel',event=>{if(busy||previewing)event.preventDefault();});
 }});
})();
