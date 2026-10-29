'use strict';
const path=require('node:path');
const crypto=require('node:crypto');
const {inspectPath,cleanTags,sameIdentity,MAX_FAVORITES}=require('./favorites-store');
function parsePathList(text){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>2*1024*1024)throw new Error('路徑清單需為文字，最多 2 MB');
 const rows=[];
 text.split(/\r\n|\n|\r/).forEach((raw,index)=>{let value=raw.trim();if(!value)return;let error='';if(value.startsWith('"')||value.endsWith('"')){if(value.length>1&&value.startsWith('"')&&value.endsWith('"'))value=value.slice(1,-1);else error='路徑前後的雙引號不完整';}if(!value)error='路徑不可為空白';if(value.length>32767)error='單一路徑超過 32,767 字元';if(rows.length>=MAX_FAVORITES)throw new Error(`每次最多匯入 ${MAX_FAVORITES} 行路徑`);rows.push({line:index+1,path:value,error});});
 if(!rows.length)throw new Error('請貼上至少一個完整路徑，每行一項');
 if(rows.length>MAX_FAVORITES)throw new Error(`每次最多匯入 ${MAX_FAVORITES} 行路徑`);
 return rows;
}
const pathKey=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
function previewPathImport(store,text,tags=[]){
 const normalizedTags=cleanTags(tags),catalog=store.read().items,known=new Map();
 for(const item of catalog){const key=pathKey(item.path),list=known.get(key)||[];list.push(item);known.set(key,list);}
 const seen=new Set(),counts={new:0,existing:0,error:0,duplicate:0};
 const rows=parsePathList(text).map(input=>{
  const row={line:input.line,path:input.path,status:'error',message:input.error};
  try{
   if(input.error)throw new Error(input.error);
   const actual=inspectPath(input.path),filepath=path.resolve(input.path),key=pathKey(filepath);row.path=filepath;
   if(seen.has(key)){row.status='duplicate';row.message='重複路徑，略過此行';return row;}
   seen.add(key);const candidates=known.get(key)||[],existing=candidates.find(item=>sameIdentity(item.identity,actual.identity))||candidates[0];
   if(existing&&(!sameIdentity(existing.identity,actual.identity)||existing.type!==actual.type))throw new Error('此位置已收藏，但項目被替換；請先重新連結');
   if(!existing&&catalog.length+counts.new>=MAX_FAVORITES)throw new Error(`收藏上限為 ${MAX_FAVORITES} 項`);
   row.status=existing?'existing':'new';row.message=existing?'已收藏；合併標籤':'可新增收藏';row.identity=actual.identity;row.type=actual.type;row.id=existing?.id||null;row.tags=cleanTags([...(existing?.tags||[]),...normalizedTags]);return row;
  }catch(e){row.status='error';row.message=e.message;return row;}
  finally {counts[row.status]++;}
 });
 const token=crypto.createHash('sha256').update(JSON.stringify({rows,tags:normalizedTags})).digest('hex');
 return {rows,counts,tags:normalizedTags,token};
}
function importPathList(store,text,tags,expectedToken){
 const preview=previewPathImport(store,text,tags);
 if(typeof expectedToken!=='string'||preview.token!==expectedToken)throw new Error('匯入預覽已變更，請重新檢查路徑後再確認');
 const paths=preview.rows.filter(row=>row.status==='new'||row.status==='existing').map(row=>row.path);
 if(!paths.length)throw new Error('沒有可匯入的有效路徑');
 return {...store.addPaths(paths,preview.tags),skipped:preview.counts.error,duplicates:preview.counts.duplicate};
}
module.exports={parsePathList,previewPathImport,importPathList};
