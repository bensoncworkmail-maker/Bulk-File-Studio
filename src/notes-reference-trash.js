'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {deletionPlan} = require('./notes-model');
const {assertLocalPath} = require('./offline-policy');

const fileKey = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function under(root, file) {
 const relative = path.relative(fileKey(root), fileKey(file));
 return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function snapshot(file) {
 assertLocalPath(file);
 const stat = fs.lstatSync(file, {bigint:true});
 if(!stat.isFile() || stat.nlink !== 1n) throw Error('只回收一般檔案，不包含連結或資料夾');
 return [stat.dev, stat.ino, stat.birthtimeNs, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':');
}

async function trashReferences({store, entries, includeDetails, revision, profileRoot, favorites, confirm, trash}) {
 const state = store.get();
 if(revision !== state.revision) throw Error('紀錄已變更，請重新確認');
 const plan = deletionPlan(state.document, entries, includeDetails);
 const ids = new Set(plan.ids);
 const protectedPaths = () => new Set(favorites().map(item => fileKey(item.path)));
 const protectedBefore = protectedPaths();
 for(const record of state.document.records) {
  if(!ids.has(record.id)) for(const link of record.fileLinks) protectedBefore.add(fileKey(link.path));
 }
 const seen = new Set(), targets = [];
 let skipped = 0;
 for(const record of state.document.records) {
  if(!ids.has(record.id)) continue;
  for(const link of record.fileLinks) {
   const key = fileKey(link.path);
   if(seen.has(key)) continue;
   seen.add(key);
   try {
    if(link.type !== 'file' || protectedBefore.has(key)) throw Error('共用位置');
    if(under(profileRoot, link.path) && !under(path.join(profileRoot, 'workspace-images'), link.path)) throw Error('應用程式資料');
    const file=path.normalize(link.path);
    targets.push({path:file, signature:snapshot(file)});
   } catch {
    skipped++;
   }
  }
 }
 if(!targets.length) throw Error('沒有可一併回收的本機檔案。共用、收藏、資料夾、網路或無法存取的位置會保留。請取消勾選檔案回收，或重新選擇紀錄。');
 if(targets.length > 30) throw Error('一次最多確認 30 個實際檔案，請分批選擇紀錄');
 if(!await confirm({paths:targets.map(item=>item.path), records:ids.size, skipped})) return {canceled:true};
 if(store.get().revision !== revision) throw Error('紀錄已變更，請重新確認');
 const currentFavorites = protectedPaths();
 for(const target of targets){
  try {
   if(currentFavorites.has(fileKey(target.path)) || snapshot(target.path) !== target.signature) throw Error();
  } catch {
   throw Error('確認後檔案或收藏已變更，請重新確認：' + target.path);
  }
 }
 const result = store.batchTrash(entries, includeDetails, revision);
 const trashedPaths = [], failures = [];
 for(const target of targets) {
  try {
   if(store.get().revision !== result.revision || protectedPaths().has(fileKey(target.path)) || snapshot(target.path) !== target.signature) {
    throw Error('確認後資料或檔案已變更');
   }
   await trash(target.path);
   trashedPaths.push(target.path);
  } catch(error) {
   failures.push(target.path + '：' + error.message);
  }
 }
 return {...store.get(), result:{...result.result, trashedPaths, skipped, failures}};
}
module.exports = {trashReferences};
