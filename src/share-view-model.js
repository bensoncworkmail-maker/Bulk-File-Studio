'use strict';
(() => {
 const labels={added:'新增',updated:'更新內容',unchanged:'內容相同',skipped:'略過',removed:'將移除'};
 function identity(name){const match=/^BFS-Workspace-([0-9a-f-]{36})-([0-9]+)-[0-9a-f-]{36}\.json$/i.exec(name||'');if(!match)return null;const published=Number(match[2]);return Number.isSafeInteger(published)&&published>=0&&published<=8640000000000000?{source:match[1],published}:null;}
 const short=value=>value?String(value).slice(0,8)+'…':'未提供';
 function packageInfo(file,deviceId,followSource){const parsed=identity(file.name),source=parsed?.source||'',own=Boolean(source&&source===deviceId),followed=Boolean(source&&source===followSource);return {source,own,followed,title:own?'本機發布':followed?'跟隨來源 '+short(source):source?'來源 '+short(source):file.name,time:parsed?new Date(parsed.published).toLocaleString():file.modifiedAt?new Date(file.modifiedAt).toLocaleString():'時間未提供',name:file.name};}
 function changed(record){return ['added','updated','removed'].includes(record.status)||record.status==='skipped'&&record.changeCount>0;}
 function filterRecords(records,filter,query=''){const text=String(query).trim().toLocaleLowerCase();return records.filter(record=>(filter==='changes'?changed(record):filter==='all'||record.status===filter)&&(record.title+' '+record.sheet+' '+(labels[record.status]||'')).toLocaleLowerCase().includes(text));}
 const api={labels,identity,short,packageInfo,changed,filterRecords};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.shareViewModel=Object.freeze(api);
})();
