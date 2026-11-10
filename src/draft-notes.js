'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const M=require('./notes-model');
const {locationPath,inspectLinks}=require('./notes-location-links');
const {withIntranetPaths}=require('./intranet-path');
const {assertLocalPath}=require('./offline-policy');
const {readStableBytes}=require('./bounded-file-read');
const toolPreferences=require('./tool-preferences');
const MAX_IMAGE=5*1024*1024,MAX_ATTACHMENTS=48,MAX_IMAGES=8;
const fileKey=value=>process.platform==='win32'?value.toLowerCase():value;
const html=path.join(__dirname,'draft-notes.html');
const textField=field=>['text','longtext'].includes(field.type);
const extraField=field=>!['relation','multiselect'].includes(field.type)&&!M.structured.isType(field.type);

function draftText(draft,{includeBody=true,includeItems=true}={}){
 const rows=includeItems&&M.structured.isType(draft.type)?M.structured.format(draft.type,draft.items):'';
 return [includeBody?draft.body:'',rows].filter(Boolean).join('\n\n');
}

function pngBytes(input){
 if(!ArrayBuffer.isView(input)||input.byteLength<33||input.byteLength>MAX_IMAGE)throw new Error('請貼上 5 MB 以下的 PNG 圖片');
 const bytes=Buffer.from(input.buffer,input.byteOffset,input.byteLength);
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR'||
  [16,20].some(offset=>bytes.readUInt32BE(offset)<1||bytes.readUInt32BE(offset)>4096)){
  throw new Error('圖片必須為 PNG，寬高各不得超過 4096 像素');
 }
 return bytes;
}

class DraftNotes{
 constructor(options){Object.assign(this,options);this.window=null;this.ready=false;this.allowClose=false;this.quitAfterClose=false;}
 get active(){return this.window&&!this.window.isDestroyed();}
 owns(event){
  return this.active&&event?.sender===this.window.webContents&&event?.senderFrame?.url===pathToFileURL(html).href;
 }
 open(){
  if(this.active){this.window.show();this.window.focus();return {opened:true,popup:true};}
  this.ready=false;this.allowClose=false;this.quitAfterClose=false;
  const {draftWindowWidth:width,draftWindowHeight:height}=this.settings();
  const bounds=this.desktop.bounds('draft',this.screen.getAllDisplays(),{width,height,minWidth:460,minHeight:460});
  const win=new this.BrowserWindow({...bounds,autoHideMenuBar:true,title:'草稿筆記 · Bulk File Studio',
   webPreferences:{preload:path.join(__dirname,'draft-notes-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false}});
  this.window=win;
  this.secureWindow(win);
  this.desktop.attach('draft',win,this.onError);
  win.on('close',event=>{if(this.ready&&!this.allowClose){event.preventDefault();this.requestClose();}});
  win.on('closed',()=>{if(this.window!==win)return;const quit=this.quitAfterClose;this.window=null;this.ready=false;this.quitAfterClose=false;if(quit)setImmediate(this.quit);});
  win.webContents.on('render-process-gone',()=>{this.ready=false;});
  Promise.resolve(win.loadFile(html)).catch(error=>{this.onError(error);if(!win.isDestroyed())win.destroy();});
  win.focus();
  return {opened:true,popup:true};
 }
 requestClose(quit=false){
  if(!this.active||!this.ready||this.allowClose)return false;
  if(quit)this.quitAfterClose=true;
  this.window.webContents.send('draft-close-request');
  return true;
 }
 cancelClose(){this.quitAfterClose=false;}
 updateSettings(){if(this.active)this.window.webContents.send('draft-settings-changed',this.settings());}
 close(){
  this.allowClose=true;
  this.window.close();
 }
 destroy(){if(this.active)this.window.destroy();}
 data(){
  const {theme,fontSize}=this.settings(),store=this.store(),drafts=store.draftList();
  const doc=store.get().document;
  const sheets=doc.sheets.filter(sheet=>!sheet.deletedAt).map(sheet=>({id:sheet.id,name:sheet.name,
   group:doc.areas.find(area=>area.id===sheet.areaId)?.name||'',parentSheetId:M.parentField(doc,sheet)?.targetSheetId||null,
   fields:sheet.fields.filter(field=>extraField(field)||M.structured.isType(field.type)).map(({id,label,type,options})=>({id,label,type,options}))}));
  this.ready=true;
  return {theme,fontSize,drafts,sheets,preferences:require('./desktop-state').normalize(this.settings())};
 }
 configure(patch){
  const allowed=['draftListWidth','draftBodyHeight'];
  if(!patch||Object.keys(patch).some(key=>!allowed.includes(key)))throw new Error('草稿版面設定無效');
  return this.desktop.update(patch);
 }
 save(id,version,patch){return this.store().saveDraft(id,version,{title:patch?.title,body:patch?.body,...(patch?.type===undefined?{}:{type:patch.type,items:patch.items})},this.settings().draftBodyLimit??100000);}
 async export(id,version,extension='txt'){
  extension=require('./draft-export-types').extension(extension);
  const draft=this.store().draft(id);if(draft.version!==version)throw new Error('草稿已變更，請重試');
  const ext=extension.replace(/^\./,'').toLowerCase(),name=(draft.title.trim()||'草稿筆記').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
  const result=await this.dialog.showSaveDialog(this.window,{title:'另存草稿（UTF-8 文字）',defaultPath:name+'.'+ext,filters:require('./draft-export-types').filters(ext)});
  if(result.canceled||!result.filePath)return {canceled:true};
  const dest=assertLocalPath(result.filePath),relative=path.relative(path.dirname(this.imageDir),dest);if(relative===''||!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative))throw new Error('請選擇程式資料目錄以外的位置');if(!path.extname(dest))throw new Error('請為檔名加上副檔名，例如 .'+ext);require('./draft-export-types').extension(path.extname(dest).slice(1));
  // User-selected extension controls the filename; this remains plain UTF-8, not binary Word/PDF.
  fs.writeFileSync(dest,draftText(draft),{encoding:'utf8'});return {path:dest};
 }
 async preview(id,index){
  const item=this.store().draft(id).attachments[index];if(!Number.isSafeInteger(index)||!item)throw new Error('附件已移除');
  return this.onPreview(item.path,this.settings().draftPreviewMode||'inline',this.window);
 }
 remind(id,version,input){
  if(this.settings().draftReminders===false)throw new Error('請先在草稿筆記設定啟用提醒');
  const draft=this.store().draft(id);if(draft.version!==version)throw new Error('草稿已變更，請重試');
  return this.onStandaloneReminder({recordId:null,standalone:{title:draft.title.trim()||'未命名草稿',body:draftText(draft).slice(0,4000)},at:input?.at,repeat:input?.repeat||'none',delivery:input?.delivery||'default',fieldIds:[],includeNotes:false,message:''});
 }
 masters(sheetId){
  const doc=this.store().get().document,sheet=doc.sheets.find(sheet=>sheet.id===sheetId&&!sheet.deletedAt);
  if(!sheet)throw new Error('目標表格已移除，請重新整理');
  const parent=M.parentField(doc,sheet);
  return parent?doc.records.filter(record=>record.sheetId===parent.targetSheetId&&M.live(doc,record))
   .map(({id,title})=>({id,title})).sort((a,b)=>a.title.localeCompare(b.title,'zh-Hant')):null;
 }
 async attach(id,version,paths){
  if(!Array.isArray(paths)||!paths.length||paths.length>MAX_ATTACHMENTS)throw new Error('請拖放 1–48 個檔案或資料夾');
  const normalized=paths.map(locationPath);
  return withIntranetPaths(normalized,()=>{
   const store=this.store(),draft=store.draft(id);
   const additions=inspectLinks(normalized).map(({path,type})=>({path,type}));
   const existing=new Map(draft.attachments.map(item=>[fileKey(item.path),item]));
   for(const item of additions)if(!existing.has(fileKey(item.path)))existing.set(fileKey(item.path),item);
   if(existing.size>MAX_ATTACHMENTS)throw new Error('每份草稿最多 48 個附件');
   return store.saveDraft(id,version,{attachments:[...existing.values()]});
  });
 }
 paste(id,version,input){
  const bytes=pngBytes(input),store=this.store(),draft=store.draft(id);
  if(draft.version!==version)throw new Error('草稿已變更，請重新開啟');
  if(draft.attachments.length>=MAX_ATTACHMENTS||draft.attachments.filter(item=>item.image).length>=MAX_IMAGES){
   throw new Error('每份草稿最多 48 個附件，其中最多 8 張貼上的圖片');
  }
  const image=this.nativeImage.createFromBuffer(bytes);
  if(image.isEmpty())throw new Error('無法讀取 PNG 圖片');
  const png=pngBytes(image.toPNG());
  const folder=assertLocalPath(path.join(this.imageDir,draft.id));
  fs.mkdirSync(folder,{recursive:true});
  const filepath=assertLocalPath(path.join(folder,randomUUID()+'.png'));
  fs.writeFileSync(filepath,png,{flag:'wx',mode:0o600});
  try{return store.saveDraft(id,version,{attachments:[...draft.attachments,{path:filepath,type:'file',image:true}]});}
  catch(error){fs.rmSync(filepath,{force:true});throw error;}
 }
 image(id,index){
  const draft=this.store().draft(id),item=draft.attachments[index];
  if(!Number.isSafeInteger(index)||!item?.image||path.extname(item.path)!=='.png'||!M.ID.test(path.basename(item.path,'.png'))||
   ![this.imageDir,path.join(this.imageDir,draft.id)].includes(path.dirname(item.path)))throw new Error('圖片附件不存在');
  assertLocalPath(item.path);
  const bytes=pngBytes(readStableBytes(item.path,{maxBytes:MAX_IMAGE,label:'草稿圖片'}));
  return 'data:image/png;base64,'+bytes.toString('base64');
 }
 removeAttachment(id,version,index){
  const store=this.store(),draft=store.draft(id);
  if(!Number.isSafeInteger(index)||!draft.attachments[index])throw new Error('附件已移除');
  return store.saveDraft(id,version,{attachments:draft.attachments.filter((_,position)=>position!==index)});
 }
 async send(id,version,sheetId,masterId,withReminder=false,mapping={}){
  if(typeof withReminder!=='boolean')throw new Error('提醒選項無效');
  const store=this.store(),draft=store.draft(id);
  if(version!==draft.version)throw new Error('草稿已變更，請重新開啟');
  if(!draft.title.trim()&&!draft.body.trim()&&!draft.items?.length&&!draft.attachments.length)throw new Error('請先輸入內容或加入附件');
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping)||
   Object.entries(mapping).some(([key,value])=>typeof value!=='string'||(key==='extraValue'?
    value.length>20000||value.includes('\0'):!['title','body','items','extraField'].includes(key)||value&&!M.ID.test(value))))throw new Error('草稿欄位對應無效');
  const paths=draft.attachments.map(item=>item.path);
  const afterTransfer=toolPreferences.value('draftAfterTransfer',this.settings().draftAfterTransfer);
  const saved=await withIntranetPaths(paths,()=>{
   if(store.draft(id).version!==version)throw new Error('草稿已變更，請重新開啟');
   const doc=store.get().document,sheet=doc.sheets.find(sheet=>sheet.id===sheetId&&!sheet.deletedAt);
   if(!sheet)throw new Error('請選擇可用表格');
   const parent=M.parentField(doc,sheet);
   const fileLinks=paths.length?inspectLinks(paths).map(({path,type})=>({path,type,favoriteId:null,label:''})):[];
   const values=parent?{[parent.id]:[masterId]}:{};
   const targets=sheet.fields.filter(field=>field.type===draft.type);
   const target=Object.hasOwn(mapping,'items')?mapping.items:targets.length===1?targets[0].id:'';
   if(target&&!targets.some(field=>field.id===target))throw new Error('清單對應的欄位已變更，請更新表格');
   const structured=Boolean(draft.items?.length&&target);
   if(structured)values[target]=draft.items;
   const title=draft.title.trim()||draft.body.split(/\r?\n/).find(line=>line.trim())?.trim().slice(0,200)||draft.items?.[0]?.label||'草稿筆記';
   if(mapping.title&&mapping.title===mapping.body)throw new Error('標題與正文請對應不同欄位');
   for(const [fieldId,value] of [[mapping.title,title],[mapping.body,draft.body]]){
    if(!fieldId)continue;
    const field=sheet.fields.find(item=>item.id===fieldId&&textField(item));
    if(!field)throw new Error('文字對應的欄位已變更，請更新表格');
    const limit=field.type==='longtext'?20000:2000;
    if(value.length>limit)throw new Error('「'+field.label+'」最多 '+limit+' 字，請選擇其他欄位或保留在紀錄筆記');
    values[field.id]=value;
   }
   if(mapping.extraField){
    const field=sheet.fields.find(item=>item.id===mapping.extraField&&extraField(item));
    if(!field)throw new Error('另填值的欄位已變更，請更新表格');
    if(Object.hasOwn(values,field.id))throw new Error('另填值請選擇尚未對應的欄位');
    if(mapping.extraValue!==undefined&&mapping.extraValue!=='')values[field.id]=M.gridValue(field,mapping.extraValue);
   }
   const result=store.saveRecord({sheetId,title,notes:draftText(draft,{includeBody:!mapping.body,includeItems:!structured}),tags:[],values,fileLinks},
    {operation:'草稿轉入工作區'},afterTransfer==='delete'?{id,version}:undefined);
   try{this.onSent(result);}catch(error){this.onError(error);}
   return {id:result.result.id,sheet:sheet.name};
  });
  let draftDeleted=afterTransfer==='delete',draftWarning='';
  if(afterTransfer==='ask'){
   try{
    const {response}=await this.dialog.showMessageBox(this.window,{
     type:'question',title:'處理原草稿',message:'紀錄已建立。要刪除原草稿嗎？',
     buttons:['保留草稿','刪除草稿'],defaultId:0,cancelId:0,noLink:true
    });
    if(response===1){store.deleteDraft(id,version);draftDeleted=true;}
   }catch(error){
    draftWarning='未能刪除原草稿，可在草稿清單中處理。';
    this.onError(error);
   }
  }
  let reminderRequested=false;
  if(withReminder){
   try{this.onRemind(saved.id);reminderRequested=true;}catch(error){this.onError(error);}
  }
  return {...saved,draftDeleted,draftWarning,reminderRequested};
 }
}

module.exports={DraftNotes,pngBytes};
