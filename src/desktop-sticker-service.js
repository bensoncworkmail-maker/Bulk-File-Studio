'use strict';

const crypto=require('node:crypto');
const M=require('./notes-model');
const model=require('./desktop-sticker-model');
const network=require('./intranet-path');
const {inspectPath,sameIdentity}=require('./favorites-store');
const {assertOpenableLocation,inspectLocation,openRecordLink}=require('./notes-location-links');
const {workspaceBookmarks}=require('./workspace-bookmark-model');
const {LogStickers}=require('./log-stickers');
const {FloatingMenu}=require('./floating-menu');
const {readSelectedPreview}=require('./document-preview');

function register({handle,ipcMain,Menu,onMenuSettled,invokeOwned,notes,tools,favorites,tracking,preferences,changed,visitRecord,visitTag,visitDraft,onDraftBodySaved,visitFavorite,visitTracking,openFavorite,showImage,shell,clipboard,...windowOptions}){
 const document=()=>notes().get().document;
 const config=()=>preferences().desktopStickers;
 const filePinByKey=(list,key)=>list.find(pin=>model.fileKey(pin.kind,pin.id)===key);
 const sourceEnabled=source=>{if(config().sources[source]!==true)throw Error('此來源的桌面便條已在設定停用');};
 const manager=new LogStickers({...windowOptions,linkRef,appearance:()=>{
  const {background,headerBackground,opacity,showGrip,size,openClick,locationClick,showAttachmentHint}=config();
  return {background,foreground:model.colorText(background),headerBackground,headerForeground:model.colorText(headerBackground),opacity,showGrip,size,openClick,locationClick,showAttachmentHint};
 },read,pinnedIds:()=>{
  const {logPins=[],fileStickerPins=[]}=tools().get();
  return new Set([...logPins,...fileStickerPins.map(pin=>model.fileKey(pin.kind,pin.id))]);
 }});

 function linkRef(link){
  if(!['file','url'].includes(link.kind))return crypto.createHash('sha256').update(JSON.stringify(link)).digest('hex');
 }
 function* tagAttachments(scope,items,records,favoritesById){
  for(const item of items){
   if(scope==='favorites'){
    yield {...model.attachmentRow('tag-favorite',item.path),id:item.id};
   }else if(scope==='workspace'){
    const record=item.kind==='record'&&item.available?records.get(item.id):null;
    for(const [index,link] of (record?.fileLinks||[]).entries()){
     const filepath=favoritesById.get(link.favoriteId)?.path||link.path;
     yield {...model.attachmentRow('tag-record',filepath),id:record.id,version:record.version,index};
    }
   }else{
    const snapshot=tracking().snapshot(item);
    for(const [index,row] of (snapshot?.rows||[]).entries()){
     yield {...model.attachmentRow('tag-tracking',row.path),id:item.id,token:snapshot.token,index};
    }
   }
  }
 }
 function tagPreview(pin,items,records,catalog){
  const links=[],seen=new Set();
  for(const link of tagAttachments(pin.scope,items,records,catalog)){
   const key=process.platform==='win32'?link.path.toLowerCase():link.path;
   if(seen.has(key))continue;
   if(links.length===100)return model.tagDetail(pin,items,links,true);
   seen.add(key);links.push(link);
  }
  return model.tagDetail(pin,items,links,false);
 }
 function tagItems(scope,catalog,doc,saved){
  if(scope==='favorites')return catalog;
  if(scope==='workspace')return workspaceBookmarks(doc,saved);
  return tracking().read().queries;
 }
 function matchingTag(items,tag){
  const key=tag.toLocaleLowerCase();
  return items.filter(item=>item.tags.some(value=>value.toLocaleLowerCase()===key));
 }
 function pinTag(scope,value){
  if(!model.TAG_SCOPES.includes(scope))throw Error('便條標籤來源無效');
  sourceEnabled(scope==='tracking'?'tracking':'favorites');
  const tag=model.tagName(value),store=tools().get();
  const items=tagItems(scope,scope==='favorites'?favorites.read().items:[],scope==='workspace'?document():null,store);
  const found=matchingTag(items,tag);
  if(!found.length)throw Error('標籤已移除或沒有項目');
  const label=found[0].tags.find(name=>name.toLocaleLowerCase()===tag.toLocaleLowerCase());
  const existing=(store.fileStickerPins||[]).find(pin=>pin.kind==='tag'&&pin.scope===scope&&pin.tag.toLocaleLowerCase()===tag.toLocaleLowerCase());
  return pinFile(existing||{kind:'tag',id:crypto.randomUUID(),scope,tag:label});
 }
 function read(ids){
  const selected=ids?new Set(ids):null,wanted=id=>!selected||selected.has(id),saved=tools().get(),prefs=config(),result=new Map();
  const targets=new Set((saved.logPins||[]).filter(wanted));
  const files=(saved.fileStickerPins||[]).filter(pin=>wanted(model.fileKey(pin.kind,pin.id)));
  const doc=targets.size||files.some(pin=>pin.scope==='workspace')?document():null;
  const catalog=targets.size||files.some(pin=>pin.kind==='favorite'||['favorites','workspace'].includes(pin.scope))?favorites.read().items:[];
  const favoritesById=new Map(catalog.map(item=>[item.id,item]));
  const records=new Map(doc?.records.map(record=>[record.id,record]));
  if(targets.size){
   const sheets=new Map(doc.sheets.map(sheet=>[sheet.id,sheet]));
   for(const id of targets){
    const record=records.get(id);
    if(record&&M.live(doc,record))result.set(id,model.recordDetail(doc,record,prefs,records,sheets,favoritesById));
   }
  }
  const tagged=new Map();
  const draftIds=files.some(pin=>pin.kind==='draft')?new Set(notes().draftList().map(item=>item.id)):null;
  for(const pin of files){
   const key=model.fileKey(pin.kind,pin.id);
   if(pin.kind==='tag'){
    if(!tagged.has(pin.scope))tagged.set(pin.scope,tagItems(pin.scope,catalog,doc,saved));
    result.set(key,tagPreview(pin,matchingTag(tagged.get(pin.scope),pin.tag),records,favoritesById));
   }else if(pin.kind==='draft'){
    if(draftIds.has(pin.id))result.set(key,model.draftDetail(notes().draft(pin.id),preferences().draftBodyLimit??100000));
   }else result.set(key,model.locationDetail(pin,pin.kind==='favorite'?favoritesById.get(pin.id):pin,prefs));
  }
  return result;
 }

 function changedPins(){changed();return counts();}
 function counts(){
  const saved=tools().get();
  return {records:(saved.logPins||[]).length,files:(saved.fileStickerPins||[]).length,visible:manager.visibleCount(),hidden:manager.hidden};
 }
 function changeRecord(doc,id,pinned){
  tools().setLogPin(doc,id,pinned);
  if(pinned)manager.open(id);else manager.remove(id,{forget:true});
  changedPins();
 }
 function remove(key){
  if(!key.includes(':'))return changeRecord(document(),key,false);
  const store=tools();
  store.setFileStickerPin(filePinByKey(store.get().fileStickerPins||[],key),false);
  manager.remove(key,{forget:true});
  changedPins();
 }

 function pinFile(pin){
  const valid=model.filePins([pin])[0];
  tools().setFileStickerPin(valid,true);
  manager.open(model.fileKey(valid.kind,valid.id));
  return changedPins();
 }

 function draftPins(){return (tools().get().fileStickerPins||[]).filter(pin=>pin.kind==='draft').map(pin=>pin.id);}
 function changeDraft(id,version,pinned){
  if(typeof pinned!=='boolean')throw Error('釘選狀態無效');
  if(notes().draft(id).version!==version)throw Error('草稿已變更，請重新開啟');
  if(!pinned)return remove(model.fileKey('draft',id));
  sourceEnabled('draft');
  return pinFile({kind:'draft',id});
 }
 function draftChanged(id,deleted){
  const key=model.fileKey('draft',id);
  if(deleted){if(draftPins().includes(id))remove(key);}
  else if(manager.windows.has(key))manager.refresh([key]);
 }
 function trackingRefreshed(){
  const ids=[...manager.windows].filter(([,entry])=>entry.detail.kind==='tag'&&entry.detail.scope==='tracking').map(([id])=>id);
  if(ids.length)manager.refresh(ids);
 }
 function control(action){
  if(action==='show'){manager.restore();manager.setHidden(false);}
  else if(action==='hide')manager.setHidden(true);
  else if(action==='expand'||action==='collapse'){manager.restore();manager.setAllCollapsed(action==='collapse');}
  else if(action==='clear'){tools().clearStickerPins();manager.clear();}
  else throw Error('便條操作無效');
  return changedPins();
 }

 function recordFor(id){
  const doc=document(),record=doc.records.find(row=>row.id===id&&M.live(doc,row));
  if(!record)throw Error('紀錄已移除');
  return {doc,record};
 }
 function editableDraft(entry){
  if(entry.detail.kind!=='draft')throw Error('只有草稿筆記便條可以編輯正文');
  const pin=filePinByKey(tools().get().fileStickerPins||[],entry.id);
  if(!pin||pin.kind!=='draft')throw Error('便條已取消釘選');
  return pin.id;
 }
 function readDraftBody(entry){
  const {body,version}=notes().draft(editableDraft(entry));
  const limit=preferences().draftBodyLimit??100000;
  return {body,version,maxLength:limit?Math.max(limit,body.length):null};
 }
 function saveDraftBody(entry,version,body){
  const id=editableDraft(entry);
  if(!Number.isSafeInteger(version)||typeof body!=='string')throw Error('草稿正文無效');
  const saved=notes().saveDraft(id,version,{body},preferences().draftBodyLimit??100000);
  if(saved.version!==version){
   draftChanged(id,false);
   onDraftBodySaved?.({id,version:saved.version,previousVersion:version,body:saved.body,
    title:saved.title,summary:(saved.body.trim()||saved.items[0]?.label||'').slice(0,80)});
  }
  return manager.payload(entry);
 }
 async function openTitle(entry){
  if(entry.detail.kind==='record'){recordFor(entry.id);return visitRecord(entry.id);}
  const pin=filePinByKey(tools().get().fileStickerPins||[],entry.id);
  if(!pin)throw Error('便條已取消釘選');
  if(pin.kind==='tag')return visitTag(pin.scope,pin.tag.toLocaleLowerCase());
  if(pin.kind==='draft'){notes().draft(pin.id);return visitDraft(pin.id);}
  if(pin.kind==='favorite'){favorites.get(pin.id);return visitFavorite(pin.id);}
  tracking().query(pin.queryId);
  return visitTracking(pin.queryId);
 }
 function showHeaderMenu(entry,anchor){
  const {window,id}=entry;
  if(manager.hidden||!window.isVisible())return;
  entry.menu??=new FloatingMenu({Menu,getWindow:()=>window,showWindow:()=>{},settings:preferences,
   onError:windowOptions.onError,onSettled:onMenuSettled});
  const command=(action,task)=>async()=>{
   if(manager.hidden||manager.windows.get(id)!==entry||window.isDestroyed()||!window.isVisible())return;
   try{await invokeOwned(action,task);}
   catch(error){if(!window.isDestroyed())window.webContents.send('log-sticker-error',error.message);}
  };
  const collapsed=entry.collapsed;
  entry.menu.popup([
   {label:'在程式內開啟原項目',enabled:Boolean(entry.detail.visit),click:command('visit',()=>openTitle(entry))},
   {label:'複製內文標題',click:command('copy-title',()=>clipboard.writeText(entry.detail.title))},
   {type:'separator'},
   {label:collapsed?'展開這張便條':'收合這張便條',click:command('toggle',()=>{
    window.webContents.send('log-sticker-changed',manager.setCollapsed(entry,!collapsed));
   })},
   {label:'暫時隱藏這張便條',click:command('hide',()=>window.close())},
   {type:'separator'},
   {label:'取消釘選這張便條',click:command('close',()=>remove(id))}
  ],{allowCollapsed:true,anchor});
 }
 async function previewImage(filepath,type){
  if(type!=='file')throw Error('只支援預覽圖片檔案');
  return readSelectedPreview(filepath,{imageOnly:true});
 }
 async function previewFavorite(id,expectedPath){
  return network.withIntranetPaths([expectedPath],()=>{
   const item=favorites.get(id,true);
   if(item.path!==expectedPath)throw Error('收藏位置已變更');
   return previewImage(item.path,item.type);
  });
 }
 async function openLocation(entry,action='open',expectedPath){
  const pin=filePinByKey(tools().get().fileStickerPins||[],entry.id);
  if(!pin)throw Error('便條已取消釘選');
  if(!['favorite','tracking'].includes(pin.kind))throw Error('便條沒有單一檔案位置');
  if(pin.kind==='favorite')return action==='preview'?previewFavorite(pin.id,expectedPath):openFavorite(pin.id,action);
  if(action==='preview'&&pin.path!==expectedPath)throw Error('追蹤位置已變更');
  return network.withIntranetPaths([pin.path],async()=>{
   const current=inspectPath(pin.path);
   if(current.type!==pin.type||!sameIdentity(current.identity,pin.identity))throw Error('追蹤位置已變更，請回 Everything 重新釘選');
   if(action==='open'&&pin.type==='folder')assertOpenableLocation(pin.path);
   return openPathAction(pin.path,pin.type,action);
  });
 }
 async function openPathAction(filepath,type,action){
  if(action==='preview')return previewImage(filepath,type);
  if(action==='show'){shell.showItemInFolder(filepath);return;}
  if(type==='file')assertOpenableLocation(filepath);
  const error=await shell.openPath(filepath);
  if(error)throw Error(error);
 }
 async function openAttachment(entry,link,action){
  if(link.kind==='item')return openLocation(entry,action,link.path);
  if(link.kind==='tag-favorite'){
   if(favorites.get(link.id).path!==link.path)throw Error('收藏位置已變更');
   return action==='preview'?previewFavorite(link.id,link.path):openFavorite(link.id,action);
  }
  if(link.kind==='tag-tracking'){
   const service=tracking(),indices=[link.index],selection=service.entries(link.id,link.token,indices);
   if(selection.paths[0]!==link.path)throw Error('追蹤結果已更新，請重新選取');
   return network.withIntranetPaths(selection.paths,()=>{
    const row=service.selection(link.id,link.token,indices).rows[0];
    return openPathAction(row.path,row.type,action);
   });
  }
  if(link.kind==='draft-file'){
   const draft=notes().draft(entry.id.slice('draft:'.length)),item=draft.attachments[link.index];
   if(draft.version!==link.version||item?.path!==link.path)throw Error('草稿附件已變更，請重新選取');
   return network.withIntranetPaths([item.path],()=>{
    const current=inspectLocation(item.path);
    if(current.type!==item.type)throw Error('附件位置類型已變更');
    return openPathAction(item.path,item.type,action);
   });
  }
  return openRecordAttachment(link.id,link,link.version,action);
 }
 async function openRecordAttachment(id,link,version,action){
  const {doc,record}=recordFor(id);
  const current=record.fileLinks[link.index],favorite=current?.favoriteId&&favorites.read().items.find(row=>row.id===current.favoriteId);
  if(record.version!==version||link.path!==(favorite?.path||current?.path))throw Error('連結位置已更新，請重新選取');
  if(action==='preview'){
   if(current?.type!=='file')throw Error('只支援預覽圖片檔案');
   return favorite?previewFavorite(favorite.id,link.path):previewImage(link.path,current.type);
  }
  return openRecordLink({document:doc,recordId:id,index:link.index,action,favorites,shell,clipboard});
 }
 async function openLink(entry,index,version,action='open',displayedLocation){
  if(!['preview','enlarge'].includes(action))return resolveLink(entry,index,version,action,displayedLocation);
  const image=await resolveLink(entry,index,version,'preview',displayedLocation);
  if(action==='preview')return image.data;
  const {window}=entry;
  if(manager.windows.get(entry.id)!==entry||window.isDestroyed()||manager.hidden||!window.isVisible())return;
  await showImage(image,window);
 }
 async function resolveLink(entry,index,version,action,displayedLocation){
  if(!Number.isSafeInteger(index)||index<0||!['open','show','preview'].includes(action))throw Error('位置無效');
  const link=entry.detail.links[index];
  const ref=link&&linkRef(link);
  if(ref){
   if(version!==ref||displayedLocation!==link.location)throw Error('附件清單已更新，請重新選取');
   return openAttachment(entry,link,action);
  }
  if(entry.detail.kind!=='record')throw Error('位置無效');
  const {record}=recordFor(entry.id);
  if(!link||version!==entry.detail.version||version!==record.version)throw Error('紀錄已更新，請重新選取連結');
  if(link.kind==='file'){
   if(displayedLocation!==undefined&&displayedLocation!==link.location)throw Error('連結位置已更新，請重新選取');
   return openRecordAttachment(entry.id,link,version,action);
  }
  if(action!=='open')throw Error('網址沒有檔案位置');
  return shell.openExternal(link.url);
 }

 handle('desktop-stickers-get',()=>({preferences:config(),tables:model.tableOptions(document()),counts:counts()}));
 handle('desktop-stickers-control',(_,action)=>control(action));
 handle('desktop-stickers-pin',async(_,source,input)=>{
  if(input?.kind==='tag'){
   if(source!==(input.scope==='tracking'?'tracking':'favorites'))throw Error('便條標籤來源不符');
   return pinTag(input.scope,input.tag);
  }
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
  ['menu',showHeaderMenu],
  ['draft-read',readDraftBody],
  ['draft-save',saveDraftBody],
  ['toggle',(entry,point)=>manager.toggle(entry,point)],
  ['drag',(entry,...args)=>manager.drag(entry,...args)],
  ['close',entry=>remove(entry.id)],
  ['visit',openTitle],
  ['open-item',entry=>openLocation(entry)],
  ['locate',entry=>openLocation(entry,'show')],
  ['open-link',openLink]
 ])ipcMain.handle('log-sticker-'+action,(event,...args)=>invokeOwned(action,()=>{
  const entry=manager.owner(event);
  if(!entry)throw Error('不受信任的便條操作來源');
  return task(entry,...args);
 }));

 return {manager,changeRecord,changeDraft,draftPins,draftChanged,trackingRefreshed,control,counts,pinTag};
}

module.exports={register};
