'use strict';
const path=require('node:path'),fs=require('node:fs'),{ZipUpdate}=require('./zip-update'),{assertLocalPath,assertSafeOpen}=require('./offline-policy');
function existing(filepath){
 try{return fs.lstatSync(filepath);}catch(error){if(error.code!=='ENOENT')throw error;return null;}
}
function register({handle,root,downloads,dialog,parent,fileOperation,progress,openPath,locate,pickMenu}){
 const service=new ZipUpdate(path.join(root,'zip-updates'),{progress}),{FolderBrowser}=require('./zip-update-browser'),browsers={source:new FolderBrowser('source'),target:new FolderBrowser('target',{forbiddenRoot:service.root})};
 const state=()=>({...service.state(),browsers:{source:browsers.source.snapshot(),target:browsers.target.snapshot()}});
 async function readLocation(kind,folder,keepRoot){
  const next=new FolderBrowser(kind,{forbiddenRoot:browsers[kind].forbiddenRoot});
  next.root=browsers[kind].root;
  next.select(folder,{keepRoot});
  await next.read();
  return next;
 }
 async function loadZip(filename,listing){
  const next=listing||await readLocation('source',path.dirname(filename),true);
  await service.openZip(filename);
  browsers.source=next;
  return state();
 }
 async function target(folder,keepRoot=false){
  const next=await readLocation('target',folder,keepRoot);
  service.setTarget(folder);
  browsers.target=next;
  return state();
 }
 const index=(rows,value)=>{if(!Number.isInteger(value)||value<0||value>=rows.length)throw Error('常用位置已變更，請重新選擇');const folder=rows[value];assertLocalPath(folder);if(!fs.statSync(folder).isDirectory())throw Error('常用資料夾已不存在，請重新選擇');return folder;};
 const choose=async options=>dialog.showOpenDialog(parent(),options);
 const open=async filepath=>{const error=await openPath(filepath);if(error)throw Error(error);return {opened:true};};
 function menuEntry(value){
  const {panel,id,kind,folder,sourceRoot='',target:expectedTarget}=value||{};
  let file,category=kind;
  if(panel==='source'||panel==='target'){
   if(!['file','folder','zip'].includes(kind))throw Error('位置類型無效');
   file=browsers[panel].resolve(id,kind);
  }else if(panel==='compare'){
   const row=service.files.find(item=>item.id===id);
   if(!row||expectedTarget!==(service.selected.target||'')||typeof sourceRoot!=='string'||sourceRoot&&(!service.roots.includes(sourceRoot)||!row.name.startsWith(sourceRoot+'/')))throw Error('ZIP 或目標已變更，請重新選擇項目');
   if(expectedTarget){
    const relative=sourceRoot?row.name.slice(sourceRoot.length+1):row.name;
    if(folder!==undefined&&(typeof folder!=='string'||!folder||!relative.startsWith(folder+'/')))throw Error('ZIP 資料夾項目無效');
    category=folder?'folder':'file';file=service.destination(folder||relative);
   }else{category='zip';file=service.selected.zipPath;}
  }else throw Error('ZIP 清單無效');
  assertLocalPath(file);
  const stat=existing(file);
  let canOpen=category==='folder'?Boolean(stat?.isDirectory()):Boolean(stat?.isFile());
  if(canOpen&&category!=='folder')try{assertSafeOpen(file);}catch{canOpen=false;}
  let parentFolder=path.dirname(file);
  if(!stat){
   if(panel!=='compare'||!expectedTarget)throw Error('檔案或資料夾已移除，請重新整理');
   while(parentFolder!==service.selected.target&&!existing(parentFolder)?.isDirectory())parentFolder=path.dirname(parentFolder);
   if(!existing(parentFolder)?.isDirectory())throw Error('目標資料夾已不存在');
  }
  return {file,category,stat,canOpen,parentFolder};
 }
 async function refreshLocations(){
  // Re-read the open listings on entry. Invalid remembered paths fall back to
  // the next accessible location without changing an already selected target.
  const source=browsers.source;
  if(source.folder){
   try{await source.read();}catch{source.clear();}
  }
  if(!source.folder){
   for(const folder of new Set([...service.history.sourceFolders,downloads].filter(Boolean))){
    try{source.select(folder);await source.read();break;}catch{source.clear();}
   }
  }
  const destination=browsers.target;
  if(destination.folder){
   try{await destination.read();}catch{destination.clear();}
  }
  if(!destination.folder&&!service.selected.target){
   for(const folder of service.history.targetFolders){
    try{await target(folder);break;}catch{destination.clear();}
   }
  }
  return state();
 }

 handle('zip-update',async(_,action,value)=>{
  if(action==='state')return state();
  if(action==='cancel')return service.cancel();
  if(service.busy)throw Error('ZIP 操作仍在執行，請稍候或取消');
  if(action==='refresh-locations')return refreshLocations();
  if(action==='choose-latest'){
   const source=browsers.source;
   const latestBrowser=await readLocation('source',source.folder,true),listing=latestBrowser.snapshot();
   if(listing.truncated)throw Error('來源清單已達上限，請直接指定 ZIP，以免選錯檔案');
   const latest=listing.rows.filter(row=>row.kind==='zip').sort((a,b)=>b.modified.localeCompare(a.modified)||a.name.localeCompare(b.name))[0];
   if(!latest)throw Error('目前來源資料夾沒有 ZIP，請選擇其他位置');
   return loadZip(latestBrowser.resolve(latest.id,'zip'),latestBrowser);
  }
  if(action==='choose-zip'){
   const defaultPath=value===undefined?(browsers.source.folder||service.history.sourceFolders[0]||downloads):index(service.history.sourceFolders,value),r=await choose({title:'選擇要更新的 ZIP',defaultPath,properties:['openFile'],filters:[{name:'ZIP 壓縮檔',extensions:['zip']}]});return r.canceled?{canceled:true}:loadZip(r.filePaths[0]);
  }
  if(action==='drop-zip')return loadZip(value);
  if(action==='choose-source-folder'){const r=await choose({title:'加入常用 ZIP 來源資料夾',defaultPath:service.history.sourceFolders[0],properties:['openDirectory']});if(r.canceled)return {canceled:true};const next=await readLocation('source',r.filePaths[0]);service.rememberSource(r.filePaths[0]);browsers.source=next;return state();}
  if(action==='choose-target'){const r=await choose({title:'選擇接收更新的資料夾',defaultPath:service.selected.target||service.history.targetFolders[0],properties:['openDirectory']});return r.canceled?{canceled:true}:target(r.filePaths[0]);}
  if(action==='save-target'){service.saveTarget();return state();}
  if(action==='forget-target'){service.forgetTarget(value?.kind,value?.index);return state();}
  if(action==='select-saved-target')return target(index(service.history.savedTargets,value));
  if(action==='select-target')return target(index(service.history.targetFolders,value));
  if(action==='browse-source'){browsers.source=await readLocation('source',index(service.history.sourceFolders,value));return state();}
  if(action==='source-open')return loadZip(browsers.source.resolve(value,'zip'));
  if(action==='source-enter'){browsers.source=await readLocation('source',browsers.source.resolve(value,'folder'),true);return state();}
  if(action==='source-up'){browsers.source=await readLocation('source',browsers.source.parent(),true);return state();}
  if(action==='target-enter')return target(browsers.target.resolve(value,'folder'),true);
  if(action==='target-up')return target(browsers.target.parent(),true);
  if(action==='refresh-browser'){if(!['source','target'].includes(value))throw Error('瀏覽位置無效');await browsers[value].read();return state();}
  if(action==='entry-menu'){
   const entry=menuEntry(value);
   const choice=await pickMenu([
    {id:'open',label:entry.category==='folder'?'開啟資料夾':entry.category==='zip'?'開啟 ZIP':'開啟檔案',enabled:entry.canOpen},
    {id:'locate',label:entry.stat?'開啟所在位置':'開啟已存在的上層資料夾'}
   ]);
   if(!choice)return {canceled:true};
   const current=menuEntry(value);
   if(choice==='open'&&current.canOpen)return open(current.file);
   if(choice==='locate'){
    if(!current.stat)return open(current.parentFolder);
    locate(current.file);return {opened:true};
   }
   throw Error('項目已變更或不可直接開啟');
  }
  if(action==='preview')return service.preview(value);
  if(action==='apply')return fileOperation(async()=>{
   const {plan,rows}=service.getPlan(value?.token,value?.ids);
   const warning=plan.structureWarning;
   const detail=[
    '目標資料夾：'+plan.target,
    'ZIP 來源層級：'+(plan.sourceRoot?plan.sourceRoot+'/':'保留 ZIP 完整層級'),
    warning,
    '新增 '+rows.filter(row=>row.status==='added').length+' 個，覆寫 '+rows.filter(row=>row.status==='changed').length+' 個。覆寫前會備份原檔，ZIP 以外的目標檔案會保留。',
    rows.slice(0,15).map(row=>row.destination).join('\n')+(rows.length>15?'\n…其餘項目已列於預覽。':'')
   ].filter(Boolean).join('\n\n');
   const choice=await dialog.showMessageBox(parent(),{
    type:warning?'warning':'question',title:'確認 ZIP 更新',message:`套用 ${rows.length} 個檔案至所選資料夾？`,detail,
    buttons:[warning?'仍要套用':'確認套用','取消'],defaultId:1,cancelId:1,noLink:true
   });
   return choice.response===0?service.apply(value.token,value.ids):{canceled:true};
  });
  if(action==='undo')return fileOperation(async()=>{const {run}=service.readRun(value),choice=await dialog.showMessageBox(parent(),{type:'warning',title:'還原 ZIP 更新',message:'還原這次更新？',detail:run.target+'\n覆寫檔案會還原備份；這次新增的檔案會移除。更新後再次修改的檔案會保留並列為衝突。',buttons:['確認還原','取消'],defaultId:1,cancelId:1,noLink:true});return choice.response===0?service.undo(value):{canceled:true};});
  if(action==='open-target'){const folder=value?service.readRun(value).run.target:service.selected.target;assertLocalPath(folder);const error=await openPath(folder);if(error)throw Error(error);return {opened:true};}
  if(action==='details'){const {dir,run}=service.readRun(value);return service.result(run,dir);}
  if(action==='open-backup'){const {dir}=service.readRun(value);assertLocalPath(dir);const error=await openPath(dir);if(error)throw Error(error);return {opened:true};}
  throw Error('ZIP 更新操作無效');
 });return service;
}
module.exports={register};
