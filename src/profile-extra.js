'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('./notes-model');
const {readStableBytes}=require('./bounded-file-read'),{assertLocalPath}=require('./offline-policy');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function normalize(input){
 if(!input||!Array.isArray(input.drafts)||input.drafts.length>50||!Array.isArray(input.history)||input.history.length>50000)throw Error('草稿／歷史備份格式無效');
 const ids=new Set();
 const drafts=input.drafts.map(item=>{
  if(!item||!M.ID.test(item.id)||ids.has(item.id)||!Number.isSafeInteger(item.version)||item.version<1||!Number.isFinite(Date.parse(item.updatedAt)))throw Error('草稿備份識別無效');ids.add(item.id);
  const data=structuredClone(item.data);if(!data||typeof data.body!=='string'||data.body.includes('\0')||data.body.length>10000000||!Array.isArray(data.attachments)||data.attachments.length>48)throw Error('草稿備份內容無效');M.text(data.title,200,'草稿標題');
  if(data.type&&data.type!=='text')M.structured.normalize(data.type,data.items);
  for(const link of data.attachments){if(!link||!['file','folder'].includes(link.type))throw Error('草稿附件無效');require('./notes-location-links').locationPath(link.path);}
  return {id:item.id,version:item.version,updatedAt:item.updatedAt,data};
 });
 ids.clear();const history=input.history.map(item=>{
  if(!item||!M.ID.test(item.id)||!M.ID.test(item.recordId)||ids.has(item.id)||!Number.isFinite(Date.parse(item.savedAt))||item.document?.id!==item.recordId||typeof item.document.title!=='string'||typeof item.document.values!=='object')throw Error('紀錄歷史備份無效');ids.add(item.id);
  return {id:item.id,recordId:item.recordId,savedAt:item.savedAt,document:structuredClone(item.document),metadata:item.metadata?structuredClone(item.metadata):null};
 });
 const receipts=(input.receipts||[]).map(row=>{if(!M.ID.test(row.draftId)||!M.ID.test(row.recordId))throw Error('收件匣轉入紀錄無效');return {draftId:row.draftId,recordId:row.recordId};});if(receipts.length>5000)throw Error('收件匣轉入紀錄過多');
 if(Buffer.byteLength(JSON.stringify({drafts,history,receipts}))>32*1024*1024)throw Error('草稿／歷史備份超過 32 MB');return {drafts:drafts.sort((a,b)=>a.id.localeCompare(b.id)),history:history.sort((a,b)=>a.id.localeCompare(b.id)),receipts:receipts.sort((a,b)=>a.draftId.localeCompare(b.draftId))};
}
function exportAuxiliary(store,{history=true}={}){
 store.db.exec('CREATE TABLE IF NOT EXISTS workflow_receipts (draft_id TEXT PRIMARY KEY, record_id TEXT NOT NULL)');const recordIds=new Set(store.get().document.records.map(record=>record.id));return normalize({receipts:store.db.prepare('SELECT draft_id AS draftId,record_id AS recordId FROM workflow_receipts ORDER BY draft_id').all().filter(row=>recordIds.has(row.recordId)),drafts:store.db.prepare('SELECT id,version,updated_at AS updatedAt,data FROM note_drafts ORDER BY id').all().map(item=>({...item,data:JSON.parse(item.data)})),history:history?store.db.prepare('SELECT h.id,h.record_id AS recordId,h.saved_at AS savedAt,h.document,d.metadata FROM record_history h LEFT JOIN record_history_details d ON d.history_id=h.id ORDER BY h.id').all().map(item=>({...item,document:JSON.parse(item.document),metadata:item.metadata?JSON.parse(item.metadata):null})):[]});
}
function replaceAuxiliary(store,input){
 const data=normalize(input);store.db.exec('CREATE TABLE IF NOT EXISTS workflow_receipts (draft_id TEXT PRIMARY KEY, record_id TEXT NOT NULL)');store.db.exec('DELETE FROM workflow_receipts');for(const row of data.receipts)store.db.prepare('INSERT INTO workflow_receipts VALUES (?,?)').run(row.draftId,row.recordId);store.db.exec('DELETE FROM note_drafts; DELETE FROM record_history_details; DELETE FROM record_history;');
 for(const item of data.drafts)store.db.prepare('INSERT INTO note_drafts VALUES (?,?,?,?)').run(item.id,item.version,item.updatedAt,JSON.stringify(item.data));
 for(const item of data.history){store.db.prepare('INSERT INTO record_history VALUES (?,?,?,?)').run(item.id,item.recordId,item.savedAt,JSON.stringify(item.document));if(item.metadata)store.db.prepare('INSERT INTO record_history_details VALUES (?,?)').run(item.id,JSON.stringify(item.metadata));}
}
function packAssets(doc,auxiliary,includeDocuments=false){
 const paths=new Set(auxiliary.drafts.flatMap(draft=>draft.data.attachments.filter(item=>item.type==='file').map(item=>item.path)));
 for(const record of doc.records)for(const item of record.fileLinks)if(item.type==='file'&&(includeDocuments||item.label==='貼上的圖片'&&/[.]png$/i.test(item.path)))paths.add(item.path);
 const recordLinks=doc.records.flatMap(record=>record.fileLinks);const assets=[],omitted=[...recordLinks.filter(link=>link.type==='folder'||!includeDocuments&&!paths.has(link.path)).map(link=>({path:link.path,reason:link.type==='folder'?'資料夾內容未封裝':'未選擇封裝紀錄文件，保留連結'})),...auxiliary.drafts.flatMap(draft=>draft.data.attachments.filter(item=>item.type==='folder').map(item=>({path:item.path,reason:'資料夾保留為連結，未封裝資料夾內容'})))];let total=0;
 for(const originalPath of paths){try{
  if(assets.length>=128)throw Error('附件封裝最多 128 個檔案');assertLocalPath(originalPath);
  const bytes=readStableBytes(originalPath,{maxBytes:8*1024*1024,label:'備份附件'});if(total+bytes.length>24*1024*1024)throw Error('附件封裝超過 24 MB');total+=bytes.length;
  assets.push({originalPath,sha256:sha(bytes),data:bytes.toString('base64')});
 }catch(error){omitted.push({path:originalPath,reason:error.message});}}
 return {assets,omitted};
}
function normalizeAssets(input=[]){
 if(!Array.isArray(input)||input.length>128)throw Error('附件封裝無效');const seen=new Set();let total=0;
 return input.map(item=>{require('./notes-location-links').locationPath(item?.originalPath);if(seen.has(item.originalPath)||typeof item.data!=='string'||item.data.length>12*1024*1024||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.data))throw Error('附件封裝格式無效');seen.add(item.originalPath);const bytes=Buffer.from(item.data,'base64');total+=bytes.length;if(bytes.length>8*1024*1024||total>24*1024*1024||sha(bytes)!==item.sha256)throw Error('附件校驗失敗');return {originalPath:item.originalPath,sha256:item.sha256,data:item.data};});
}
function unpackAssets(root,data){
 const created=[],mapping=new Map();
 try{for(const item of normalizeAssets(data.assets)){
  const imageDraft=data.auxiliary?.drafts.find(draft=>draft.data.attachments.some(link=>link.path===item.originalPath&&link.image));
  const folder=assertLocalPath(imageDraft?path.join(root,'draft-images',imageDraft.id):path.join(root,'restored-assets'));
  fs.mkdirSync(folder,{recursive:true});const filename=assertLocalPath(path.join(folder,crypto.randomUUID()+(imageDraft?'.png':path.extname(item.originalPath).replace(/[^.a-z0-9]/gi,'').slice(0,12))));fs.writeFileSync(filename,Buffer.from(item.data,'base64'),{flag:'wx',mode:0o600});created.push(filename);mapping.set(item.originalPath,filename);
 }
 for(const record of data.workspace.records)for(const link of record.fileLinks)if(mapping.has(link.path)){link.path=mapping.get(link.path);link.favoriteId=null;}
 for(const draft of data.auxiliary?.drafts||[])for(const link of draft.data.attachments)if(mapping.has(link.path))link.path=mapping.get(link.path);
 return created;
 }catch(error){for(const filename of created)fs.rmSync(filename,{force:true});throw error;}
}
module.exports={normalize,exportAuxiliary,replaceAuxiliary,packAssets,normalizeAssets,unpackAssets,sha};
