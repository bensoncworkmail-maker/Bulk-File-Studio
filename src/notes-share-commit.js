'use strict';

const crypto=require('node:crypto');
const M=require('./notes-model');
const LIMIT=128;
const validHash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const scopeKey=scope=>JSON.stringify([scope.mode,[...scope.masterIds].sort()]);
function validHead(commit){
 return Boolean(commit&&validHash(commit.id)&&Array.isArray(commit.ancestors)&&commit.ancestors.length<=LIMIT&&
  commit.ancestors.every(id=>validHash(id)&&id!==commit.id)&&new Set(commit.ancestors).size===commit.ancestors.length);
}
function commitId(sharing,{parentCommitId,ancestors,snapshotHash}){
 return hash({source:sharing.source,version:sharing.version,revision:sharing.revision,
  scope:scopeKey(sharing.scope),parentCommitId,ancestors,snapshotHash});
}
function create(sharing,document,tombstones,previous){
 const ancestors=validHead(previous)?[previous.id,...previous.ancestors].slice(0,LIMIT):[];
 const commit={parentCommitId:ancestors[0]||null,ancestors,snapshotHash:hash({document,tombstones})};
 return {...commit,id:commitId(sharing,commit)};
}
function validate(input,document,scope){
 const sharing=input.sharing,commit=sharing?.commit,tombstones=input.tombstones;
 if(!validHead(commit)||!sharing.scope||!M.ID.test(sharing.source)||!Number.isSafeInteger(sharing.version)||sharing.version<1||
  !Number.isSafeInteger(sharing.revision)||sharing.revision<0||commit.parentCommitId!==(commit.ancestors[0]||null)||
  !Array.isArray(tombstones)||tombstones.length>M.LIMITS.records)throw new Error('共享提交資料無效');
 const records=new Set(document.records.map(record=>record.id)),sheets=new Set(document.sheets.map(sheet=>sheet.id)),seen=new Set();
 for(const item of tombstones){
  if(!item||!M.ID.test(item.id)||!sheets.has(item.sheetId)||records.has(item.id)||seen.has(item.id)||
   typeof item.deletedAt!=='string'||item.deletedAt.length>40||!Number.isFinite(Date.parse(item.deletedAt)))throw new Error('共享回收標記無效');
  seen.add(item.id);
 }
 if(commit.snapshotHash!==hash({document,tombstones})||commit.id!==commitId({...sharing,scope},commit))throw new Error('共享提交內容與雜湊不符');
 return commit;
}
module.exports={create,validate,validHead,scopeKey};
