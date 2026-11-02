'use strict';
(() => {
 const $=id=>document.getElementById(id),prefixes=['notes-share','settings-share'];let api,callbacks,lastNotice='',lastReceived='';
 function render(value){
  for(const prefix of prefixes){
   const mode=$(prefix+'-receive'),source=$(prefix+'-source');mode.value=value.receiveMode||'remind';mode.disabled=Boolean(value.busy);
   const sources=new Map();for(const file of value.files||[]){const match=/^BFS-Workspace-([0-9a-f-]{36})-/i.exec(file.name);if(match&&match[1]!==value.deviceId)sources.set(match[1],match[1]);}if(value.followSource)sources.set(value.followSource,value.followSource);
   source.replaceChildren();const any=document.createElement('option');any.value='';any.textContent='所有其他來源（只提醒）';source.append(any);for(const id of sources.keys()){const option=document.createElement('option');option.value=id;option.textContent=id;source.append(option);}source.value=value.followSource||'';source.disabled=Boolean(value.busy);
   const notice=$(prefix+'-incoming');notice.textContent=value.notice?value.notice.reason+'\n'+value.notice.name:value.lastReceivedAt?'上次自動接收：'+new Date(value.lastReceivedAt).toLocaleString()+(value.lastAutoBackup?'；備份：'+value.lastAutoBackup:''):'沒有待處理的更新。';
   $(prefix+'-preview-new').hidden=!value.notice;$(prefix+'-ignore-new').hidden=!value.notice;for(const suffix of ['preview-new','ignore-new'])$(prefix+'-'+suffix).disabled=Boolean(value.busy);
   $(prefix+'-preview-new').onclick=()=>callbacks.preview(value.notice.name);$(prefix+'-ignore-new').onclick=()=>api.shareIgnore(value.notice.name).then(render).catch(error=>callbacks.showFailure('無法忽略更新',error));
  }
  if(value.enabled&&value.notice){const key=value.notice.name+'|'+value.notice.reason;if(key!==lastNotice){lastNotice=key;callbacks?.showToast?.('共享資料包有更新：'+value.notice.reason);}}
  if(value.lastReceivedAt&&value.lastReceivedAt!==lastReceived){lastReceived=value.lastReceivedAt;callbacks?.showToast?.('已自動接收共享資料包，並建立本機備份。');}
 }
 function init(bridge,options){api=bridge;callbacks=options;for(const prefix of prefixes)for(const [suffix,key] of [['receive','receiveMode'],['source','followSource']])$(prefix+'-'+suffix).addEventListener('change',()=>api.shareConfigure({[key]:$(prefix+'-'+suffix).value}).then(render).catch(async error=>{callbacks.showFailure('分享接收設定未完成',error);try{render(await api.shareStatus());}catch{}}));}
 window.shareReceiveUI=Object.freeze({init,render});
})();
