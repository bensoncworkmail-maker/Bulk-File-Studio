'use strict';
const path=require('node:path'),{writeJSON}=require('./productivity-store'),{readStableBytes}=require('./bounded-file-read');
const key=value=>/^[a-z]:|^\\\\/i.test(value)?path.win32.normalize(value).toLowerCase():path.normalize(value);
const identity=row=>row.identity?[row.identity.dev,row.identity.ino,row.identity.birthtimeNs].join(':'):null;
const signature=query=>JSON.stringify([query.text,query.type,query.mode,query.extensions||'']);
function compare(previous,current){
 const before=new Map(previous.map(row=>[key(row.path),row])),after=new Map(current.map(row=>[key(row.path),row]));
 const added=current.filter(row=>!before.has(key(row.path))),removed=previous.filter(row=>!after.has(key(row.path))),renamed=[],changed=[];
 const oldIds=new Map();for(const row of removed){const id=identity(row);if(id){if(!oldIds.has(id))oldIds.set(id,[]);oldIds.get(id).push(row);}}
 const newIds=new Map();for(const row of added){const id=identity(row);if(id){if(!newIds.has(id))newIds.set(id,[]);newIds.get(id).push(row);}}
 for(const [id,rows] of newIds)if(rows.length===1&&oldIds.get(id)?.length===1)renamed.push({from:oldIds.get(id)[0].path,to:rows[0].path});
 const from=new Set(renamed.map(row=>row.from)),to=new Set(renamed.map(row=>row.to));
 for(const row of current){const old=before.get(key(row.path));if(old&&(identity(old)!==identity(row)||old.size!==row.size||old.modifiedMs!==row.modifiedMs))changed.push(row.path);}
 return {added:added.filter(row=>!to.has(row.path)).map(row=>row.path),removed:removed.filter(row=>!from.has(row.path)).map(row=>row.path),renamed,changed};
}
class TrackingChanges{
 constructor(filename){this.filename=filename;}
 read(){try{const data=JSON.parse(readStableBytes(this.filename,{maxBytes:8*1024*1024,label:'追蹤變化'}));if(data.version!==1||!data.snapshots||typeof data.snapshots!=='object'||Array.isArray(data.snapshots)||Object.keys(data.snapshots).length>20||!Array.isArray(data.monitors)||data.monitors.length>20)throw Error('追蹤變化格式無效');const W=require('./workflow-model');for(const id of data.monitors)W.id(id);for(const [id,value]of Object.entries(data.snapshots)){W.id(id);if(!value||typeof value.signature!=='string'||!Array.isArray(value.rows)||value.rows.length>5000||!value.changes)throw Error('追蹤快照無效');for(const row of value.rows)if(typeof row.path!=='string'||row.path.length>4096||row.path.includes('\0'))throw Error('追蹤路徑無效');for(const event of [value.changes,...(value.events||[])])for(const key of ['added','removed','renamed','changed'])if(!Array.isArray(event[key])||event[key].length>5000)throw Error('追蹤差異無效');}return data;}catch(error){if(error.code==='ENOENT')return {version:1,snapshots:{},monitors:[]};throw error;}}
 write(data){while(Buffer.byteLength(JSON.stringify(data))>8*1024*1024){const value=Object.values(data.snapshots).find(item=>item.events?.length);if(!value)throw Error('追蹤快照超過 8 MB，請縮小搜尋範圍');value.events.shift();}writeJSON(this.filename,data);}
 remove(id){const data=this.read();delete data.snapshots[id];data.monitors=data.monitors.filter(value=>value!==id);this.write(data);}
 update(query,snapshot){const data=this.read(),old=data.snapshots[query.id],sig=signature(query),baseline=!old||old.signature!==sig;const changes=baseline?{added:[],removed:[],renamed:[],changed:[]}:compare(old.rows,snapshot.rows);const total=changes.added.length+changes.removed.length+changes.renamed.length+changes.changed.length;const value={signature:sig,rows:snapshot.rows.map(({path,size,modifiedMs,identity})=>({path,size,modifiedMs,identity})),changes:{...changes,at:snapshot.checkedAt,baseline,unread:total>0,partial:snapshot.truncated===true||old?.truncated===true||snapshot.skipped>0},truncated:snapshot.truncated===true};if(!baseline&&!total&&old.changes?.unread)value.changes=old.changes;if(!baseline&&total){value.events=[...(old.events||[]),value.changes].slice(-20);}else value.events=old?.events||[];data.snapshots[query.id]=value;this.write(data);return value.changes;}
 seen(id){const data=this.read();if(data.snapshots[id])data.snapshots[id].changes.unread=false;this.write(data);}
 monitor(id,enabled,queries){if(!queries.some(query=>query.id===id)||typeof enabled!=='boolean')throw Error('追蹤監控設定無效');const data=this.read();data.monitors=data.monitors.filter(value=>value!==id&&queries.some(query=>query.id===value));if(enabled)data.monitors.push(id);if(data.monitors.length>20)throw Error('最多監控 20 個追蹤搜尋');this.write(data);return data.monitors;}
}
module.exports={TrackingChanges,compare,signature};
