'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const M=require('./notes-model');
const {locationPath,inspectLinks}=require('./notes-location-links');
const {withIntranetPaths}=require('./intranet-path');
const {assertLocalPath}=require('./offline-policy');
const {readStableBytes}=require('./bounded-file-read');
const {fitBounds}=require('./desktop-state');
const MAX_IMAGE=5*1024*1024,MAX_ATTACHMENTS=48,MAX_IMAGES=8;
const fileKey=value=>process.platform==='win32'?value.toLowerCase():value;
const html=path.join(__dirname,'draft-notes.html');

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
  const bounds=fitBounds(null,this.screen.getAllDisplays(),{width:700,height:720,minWidth:460,minHeight:460});
  const win=new this.BrowserWindow({...bounds,minWidth:460,minHeight:460,autoHideMenuBar:true,title:'草稿筆記 · Bulk File Studio',
   webPreferences:{preload:path.join(__dirname,'draft-notes-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false}});
  this.window=win;
  this.secureWindow(win);
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
 close(){
  this.allowClose=true;
  this.window.close();
 }
 destroy(){if(this.active)this.window.destroy();}
 data(){
  const {theme,fontSize}=this.settings(),store=this.store(),drafts=store.draftList();
  const doc=store.get().document;
  const sheets=doc.sheets.filter(sheet=>!sheet.deletedAt).map(sheet=>({id:sheet.id,name:sheet.name,
   group:doc.areas.find(area=>area.id===sheet.areaId)?.name||'',parentSheetId:M.parentField(doc,sheet)?.targetSheetId||null}));
  this.ready=true;
  return {theme,fontSize,drafts,sheets};
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
  if(draft.attachments.length>=MAX_ATTACHMENTS||draft.attachments.filter(item=>item.image).length>=MAX_IMAGES){
   throw new Error('每份草稿最多 48 個附件，其中最多 8 張貼上的圖片');
  }
  const image=this.nativeImage.createFromBuffer(bytes);
  if(image.isEmpty())throw new Error('無法讀取 PNG 圖片');
  const png=pngBytes(image.toPNG());
  assertLocalPath(this.imageDir);
  fs.mkdirSync(this.imageDir,{recursive:true});
  const filepath=path.join(this.imageDir,randomUUID()+'.png');
  fs.writeFileSync(filepath,png,{flag:'wx',mode:0o600});
  try{return store.saveDraft(id,version,{attachments:[...draft.attachments,{path:filepath,type:'file',image:true}]});}
  catch(error){fs.rmSync(filepath,{force:true});throw error;}
 }
 image(id,index){
  const item=this.store().draft(id).attachments[index];
  if(!Number.isSafeInteger(index)||!item?.image||path.dirname(item.path)!==this.imageDir||!M.ID.test(path.basename(item.path,'.png')))throw new Error('圖片附件不存在');
  assertLocalPath(item.path);
  const bytes=pngBytes(readStableBytes(item.path,{maxBytes:MAX_IMAGE,label:'草稿圖片'}));
  return 'data:image/png;base64,'+bytes.toString('base64');
 }
 removeAttachment(id,version,index){
  const store=this.store(),draft=store.draft(id);
  if(!Number.isSafeInteger(index)||!draft.attachments[index])throw new Error('附件已移除');
  return store.saveDraft(id,version,{attachments:draft.attachments.filter((_,position)=>position!==index)});
 }
 async send(id,version,sheetId,masterId){
  const store=this.store(),draft=store.draft(id);
  if(version!==draft.version)throw new Error('草稿已變更，請重新開啟');
  if(!draft.title.trim()&&!draft.body.trim()&&!draft.attachments.length)throw new Error('請先輸入內容或加入附件');
  const paths=draft.attachments.map(item=>item.path);
  return withIntranetPaths(paths,()=>{
   const doc=store.get().document,sheet=doc.sheets.find(sheet=>sheet.id===sheetId&&!sheet.deletedAt);
   if(!sheet)throw new Error('請選擇可用表格');
   const parent=M.parentField(doc,sheet);
   const fileLinks=paths.length?inspectLinks(paths).map(({path,type})=>({path,type,favoriteId:null,label:''})):[];
   const title=draft.title.trim()||draft.body.split(/\r?\n/).find(line=>line.trim())?.trim().slice(0,200)||'草稿筆記';
   const result=store.saveRecord({sheetId,title,notes:draft.body,tags:[],values:parent?{[parent.id]:[masterId]}:{},fileLinks},
    {operation:'草稿轉入工作區'},{id,version});
   try{this.onSent(result);}catch(error){this.onError(error);}
   return {id:result.result.id,sheet:sheet.name};
  });
 }
}

module.exports={DraftNotes,pngBytes};
