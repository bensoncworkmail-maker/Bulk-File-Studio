'use strict';

const crypto=require('node:crypto');
const M=require('./notes-model');
const model=require('./desktop-sticker-model');
const network=require('./intranet-path');
const {inspectPath,sameIdentity}=require('./favorites-store');
const {assertOpenableLocation,openRecordLink}=require('./notes-location-links');
const {LogStickers}=require('./log-stickers');

function register({handle,ipcMain,invokeOwned,notes,tools,favorites,tracking,preferences,changed,visitRecord,openFavorite,shell,clipboard,...windowOptions}){
 const document=()=>notes().get().document;
 const config=()=>preferences().desktopStickers;
 const filePinByKey=(list,key)=>list.find(pin=>model.fileKey(pin.kind,pin.id)===key);
 const sourceEnabled=source=>{if(config().sources[source]!==true)throw Error('此來源的桌面便條已在設定停用');};
 const manager=new LogStickers({...windowOptions,appearance:()=>{
  const background=config().background;
  return {background,foreground:model.colorText(background)};
 },read,unpin:remove});

 function read(ids){
  const selected=ids?new Set(ids):null,wanted=id=>!selected||selected.has(id),saved=tools().get(),prefs=config(),result=new Map();
  const targets=new Set((saved.logPins||[]).filter(wanted));
  if(targets.size){
   const doc=document(),records=new Map(doc.records.map(record=>[record.id,record])),sheets=new Map(doc.sheets.map(sheet=>[sheet.id,sheet]));
   for(const id of targets){
    const record=records.get(id);
    if(record&&M.live(doc,record))result.set(id,model.recordDetail(doc,record,prefs,records,sheets));
   }
  }
  const files=(saved.fileStickerPins||[]).filter(pin=>wanted(model.fileKey(pin.kind,pin.id)));
  const catalog=new Map(files.some(pin=>pin.kind==='favorite')?favorites.read().items.map(item=>[item.id,item]):[]);
  for(const pin of files)result.set(model.fileKey(pin.kind,pin.id),model.locationDetail(pin,pin.kind==='favorite'?catalog.get(pin.id):pin,prefs));
  return result;
 }

 function changedPins(){changed();return counts();}
 function counts(){
  const saved=tools().get();
  return {records:(saved.logPins||[]).length,files:(saved.fileStickerPins||[]).length,visible:manager.windows.size};
 }
 function changeRecord(doc,id,pinned){
  tools().setLogPin(doc,id,pinned);
  if(pinned)manager.open(id);else manager.remove(id);
  changedPins();
 }
 function remove(key){
  if(!key.includes(':'))return changeRecord(document(),key,false);
  const store=tools();
  store.setFileStickerPin(filePinByKey(store.get().fileStickerPins||[],key),false);
  manager.remove(key);
  changedPins();
 }

 function pinFile(pin){
  const valid=model.filePins([pin])[0];
  tools().setFileStickerPin(valid,true);
  manager.open(model.fileKey(valid.kind,valid.id));
  return changedPins();
 }

 function control(action){
  if(action==='expand'){manager.restore();manager.setAllCollapsed(false);}
  else if(action==='collapse')manager.setAllCollapsed(true);
  else if(action==='clear'){tools().clearStickerPins();manager.close();return changedPins();}
  else throw Error('便條操作無效');
  return counts();
 }

 function recordFor(id){
  const doc=document(),record=doc.records.find(row=>row.id===id&&M.live(doc,row));
  if(!record)throw Error('紀錄已移除');
  return {doc,record};
 }
 async function openLocation(entry,locate=false){
  if(entry.detail.kind==='record'){
   recordFor(entry.id);
   return visitRecord(entry.id);
  }
  const pin=filePinByKey(tools().get().fileStickerPins||[],entry.id);
  if(!pin)throw Error('便條已取消釘選');
  if(pin.kind==='favorite')return openFavorite(pin.id,locate?'show':'open');
  return network.withIntranetPaths([pin.path],async()=>{
   const current=inspectPath(pin.path);
   if(current.type!==pin.type||!sameIdentity(current.identity,pin.identity))throw Error('追蹤位置已變更，請回 Everything 重新釘選');
   if(locate){shell.showItemInFolder(pin.path);return;}
   assertOpenableLocation(pin.path);
   const error=await shell.openPath(pin.path);
   if(error)throw Error(error);
  });
 }
 async function openLink(entry,index,version){
  if(entry.detail.kind!=='record'||!Number.isSafeInteger(index)||index<0)throw Error('位置無效');
  const link=entry.detail.links[index],{doc,record}=recordFor(entry.id);
  if(!link||version!==entry.detail.version||version!==record.version)throw Error('紀錄已更新，請重新選取連結');
  if(link.kind==='file')return openRecordLink({document:doc,recordId:entry.id,index:link.index,action:'open',favorites,shell,clipboard});
  return shell.openExternal(link.url);
 }

 handle('desktop-stickers-get',()=>({preferences:config(),tables:model.tableOptions(document()),counts:counts()}));
 handle('desktop-stickers-control',(_,action)=>control(action));
 handle('desktop-stickers-pin',async(_,source,input)=>{
  sourceEnabled(source);
  if(source==='workspace'||source==='favorites'&&input?.kind==='record'){
   const id=M.id(input?.id);
   changeRecord(document(),id,true);
   return counts();
  }
  if(source==='favorites'){
   const id=M.id(input?.id);
   favorites.get(id);
   return pinFile({kind:'favorite',id});
  }
  const service=tracking(),{id,token,index}=input||{},indices=[index];
  const selection=service.entries(id,token,indices);
  return network.withIntranetPaths(selection.paths,()=>{
   sourceEnabled(source);
   const row=service.selection(id,token,indices).rows[0],query=service.query(id);
   const existing=(tools().get().fileStickerPins||[]).find(pin=>pin.kind==='tracking'&&pin.path===row.path&&sameIdentity(pin.identity,row.identity));
   return pinFile(existing||{kind:'tracking',id:crypto.randomUUID(),path:row.path,identity:row.identity,type:row.type,queryId:id,queryName:query.name});
  });
 });

 for(const [action,task] of [
  ['get',entry=>manager.payload(entry)],
  ['toggle',entry=>manager.toggle(entry)],
  ['close',entry=>remove(entry.id)],
  ['visit',entry=>openLocation(entry)],
  ['locate',entry=>openLocation(entry,true)],
  ['open-link',openLink]
 ])ipcMain.handle('log-sticker-'+action,(event,...args)=>invokeOwned(action,()=>{
  const entry=manager.owner(event);
  if(!entry)throw Error('不受信任的便條操作來源');
  return task(entry,...args);
 }));

 return {manager,changeRecord,control,counts};
}

module.exports={register};
