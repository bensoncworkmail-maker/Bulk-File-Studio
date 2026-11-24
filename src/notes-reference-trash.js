'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {deletionPlan, ID} = require('./notes-model');
const {assertLocalPath} = require('./offline-policy');
const {workspaceFilesRoot} = require('./workspace-images');

const fileKey = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function under(root, file) {
 const relative = path.relative(fileKey(root), fileKey(file));
 return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function managedAttachmentFolder(root, file) {
 const folder = path.dirname(file);
 return fileKey(path.dirname(folder)) === fileKey(root) && ID.test(path.basename(folder)) ? folder : null;
}
function isLegacyDraftImage(root, file) {
 // Older pasted images were stored directly in draft-images.
 if(fileKey(path.dirname(file)) !== fileKey(root)) return false;
 const {name, ext} = path.parse(file);
 return ext.toLowerCase() === '.png' && (ID.test(name.replace(/-\d{6}$/, '')) || /^貼上的圖片 [1-9]\d{0,5}$/.test(name));
}
function cleanDraftFolders(folders, store, records, references) {
 const activeDrafts = new Set(store.draftList().map(draft => draft.id.toLowerCase()));
 for(const record of records) {
  for(const link of record.fileLinks) if(link.type === 'folder') references.add(fileKey(link.path));
 }
 for(const folder of folders) {
  if(activeDrafts.has(path.basename(folder).toLowerCase()) || references.has(fileKey(folder))) continue;
  try {
   assertLocalPath(folder);
   fs.rmdirSync(folder);
  } catch {
   // Keep folders that still contain entries, changed on disk, or cannot be removed.
  }
 }
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
 const favoritePaths = protectedPaths();
 const draftPaths = () => new Set(store.draftAttachmentPaths().map(fileKey));
 const draftReferences = draftPaths();
 const recordReferences = new Set();
 for(const record of state.document.records) {
  if(!ids.has(record.id)) for(const link of record.fileLinks) recordReferences.add(fileKey(link.path));
 }
 const seen = new Set(), targets = [], skipped = [];
 const workspaceImages = path.join(profileRoot, 'workspace-images');
 const workspaceFiles = workspaceFilesRoot(profileRoot);
 const draftAssets = path.join(profileRoot, 'draft-images');
 const restoredAssets = path.join(profileRoot, 'restored-assets');
 for(const record of state.document.records) {
  if(!ids.has(record.id)) continue;
  for(const link of record.fileLinks) {
   const key = fileKey(link.path);
   if(seen.has(key)) continue;
   seen.add(key);
   const file = path.normalize(link.path);
   try {
    if(link.type !== 'file') throw Error('資料夾連結');
    if(recordReferences.has(key)) throw Error('其他紀錄仍有引用（包含工作區回收筒）');
    if(draftReferences.has(key)) throw Error('草稿仍有引用');
    if(favoritePaths.has(key)) throw Error('仍在「我的收藏」');
    const restoredFile = fileKey(path.dirname(file)) === fileKey(restoredAssets) && ID.test(path.parse(file).name);
    const managedWorkspaceFile = managedAttachmentFolder(workspaceFiles, file);
    const draftFolder = managedAttachmentFolder(draftAssets, file);
    if(under(profileRoot, file) && !under(workspaceImages, file) && !managedWorkspaceFile && !restoredFile && !draftFolder && !isLegacyDraftImage(draftAssets, file)) throw Error('受保護的應用程式資料');
    targets.push({path:file, signature:snapshot(file), draftFolder});
   } catch(error) {
    const reason = error.code === 'ENOENT' ? '找不到檔案' : error.code === 'EACCES' || error.code === 'EPERM' ? '沒有存取權限' : error.message;
    skipped.push({path:link.path, reason});
   }
  }
 }
 if(targets.length > 30) throw Error('一次最多確認 30 個實際檔案，請分批選擇紀錄');
 if(!await confirm({paths:targets.map(item=>item.path), records:ids.size, skipped, hasDraftAttachments:targets.some(item=>item.draftFolder)})) return {canceled:true};
 if(store.get().revision !== revision) throw Error('紀錄已變更，請重新確認');
 const currentFavorites = protectedPaths(), currentDrafts = draftPaths();
 for(const target of targets){
  try {
   if(currentFavorites.has(fileKey(target.path)) || currentDrafts.has(fileKey(target.path)) || snapshot(target.path) !== target.signature) throw Error();
  } catch {
   throw Error('確認後檔案或收藏已變更，請重新確認：' + target.path);
  }
 }
 const result = store.batchTrash(entries, includeDetails, revision);
 const trashedPaths = [], failures = [];
 const draftFolders = new Set();
 for(const target of targets) {
  try {
   if(store.get().revision !== result.revision || protectedPaths().has(fileKey(target.path)) || draftPaths().has(fileKey(target.path)) || snapshot(target.path) !== target.signature) {
    throw Error('確認後資料或檔案已變更');
   }
   await trash(target.path);
   trashedPaths.push(target.path);
   if(target.draftFolder) draftFolders.add(target.draftFolder);
  } catch(error) {
   failures.push(target.path + '：' + error.message);
  }
 }
 const finalState = store.get();
 if(draftFolders.size) {
  try {
   cleanDraftFolders(draftFolders, store, finalState.document.records, new Set([...protectedPaths(), ...draftPaths()]));
  } catch {
   // If reference checks fail, retain the empty folders and report the completed recycle operation.
  }
 }
 return {...finalState, result:{...result.result, trashedPaths, skipped:skipped.length, failures}};
}
module.exports = {trashReferences};
