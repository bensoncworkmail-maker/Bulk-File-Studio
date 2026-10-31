'use strict';
const path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const M=require('./notes-model'),{inspectPath,sameIdentity,cleanTags}=require('./favorites-store');
const {previewPathImport,importPathList}=require('./path-import-core'),{fitBounds}=require('./desktop-state');
const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
function captureBounds(anchor,displays){
 const defaults={width:480,height:650,minWidth:340,minHeight:280},area=displays.map(d=>d.workArea).find(a=>anchor.x<a.x+a.width&&anchor.x+anchor.width>a.x&&anchor.y<a.y+a.height&&anchor.y+anchor.height>a.y)||displays[0]?.workArea;
 const width=Math.min(480,area?.width||480),x=area&&anchor.x+anchor.width+width+8>area.x+area.width?anchor.x-width-8:anchor.x+anchor.width+8;
 return fitBounds({x,y:anchor.y,width,height:650},displays,defaults);
}
function checkedPaths(inputs){
 if(!Array.isArray(inputs)||!inputs.length||inputs.length>100)throw new Error('每次請拖放 1–100 個檔案或資料夾');
 const seen=new Set(),items=[];for(const input of inputs){const actual=inspectPath(input),filepath=path.resolve(input),id=key(filepath);if(seen.has(id))continue;seen.add(id);items.push({path:filepath,...actual});}return items;
}
class FloatingCapture{
 constructor(options){Object.assign(this,options);this.window=null;this.request=null;this.pending=null;this.busy=false;}
 owns(event){return this.window&&!this.window.isDestroyed()&&event?.sender===this.window.webContents&&event?.senderFrame?.url===pathToFileURL(path.join(__dirname,'floating-capture.html')).href;}
 assertAvailable(){if(this.window&&!this.window.isDestroyed()){this.window.show();this.window.focus();throw new Error('請先完成或取消目前的浮動表單；原有輸入已保留');}}
 open(request){
  this.assertAvailable();const action=request.resolve();if(!['import-paths','new-record'].includes(action.type))throw new Error('此操作需使用主視窗');
  const items=request.paths?checkedPaths(request.paths):[];this.request={...request,action:JSON.parse(JSON.stringify(action)),items};this.pending=null;
  try{this.target();const parent=this.parent(),settings=this.settings();this.window=new this.BrowserWindow({...captureBounds(parent.getNormalBounds(),this.screen.getAllDisplays()),parent,modal:false,show:true,skipTaskbar:true,alwaysOnTop:settings.floatingOnTop,autoHideMenuBar:true,title:'浮動快捷 · '+action.label,backgroundColor:settings.theme==='light'?'#f7f9fe':'#0c1221',webPreferences:{preload:path.join(__dirname,'floating-capture-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false}});
   const current=this.window;this.secureWindow(current);current.on('close',event=>{if(this.busy)event.preventDefault();});current.on('closed',()=>{if(this.window===current){this.window=null;this.request=null;this.pending=null;}});current.loadFile(path.join(__dirname,'floating-capture.html'));current.show();current.focus();return {opened:true,popup:true};
  }catch(error){this.destroy();throw error;}
 }
 target(){
  if(!this.request)throw new Error('浮動表單已關閉');const action=this.request.resolve();
  if(JSON.stringify(action)!==JSON.stringify(this.request.action))throw new Error('快捷或拖放設定已變更，請關閉後重新開啟');
  if(action.type==='import-paths')return {action};const state=this.notesStore().get(),sheet=state.document.sheets.find(s=>s.id===action.sheetId&&!s.deletedAt);if(!sheet)throw new Error('目標表格已移除，請更改快捷動作設定');
  const parent=M.parentField(state.document,sheet);if(action.masterId&&!state.document.records.some(r=>r.id===action.masterId&&r.sheetId===parent?.targetSheetId&&M.live(state.document,r)))throw new Error('預設主紀錄已變更，請更改快捷動作設定');return {action,state,sheet,parent};
 }
 data(){
  const {action,state,sheet,parent}=this.target(),settings=this.settings();return {label:action.label,kind:action.type==='import-paths'?'import-paths':this.request.items.length?'drop-records':'new-record',text:this.request.text||'',tags:action.tags||[],theme:settings.theme,fontSize:settings.fontSize,sheet:sheet?{id:sheet.id,name:sheet.name,fields:sheet.fields}:null,parentId:parent?.id||null,masterId:action.masterId||'',relations:sheet?Object.fromEntries(sheet.fields.filter(f=>f.type==='relation').map(f=>[f.id,state.document.records.filter(r=>r.sheetId===f.targetSheetId&&M.live(state.document,r)).map(r=>({id:r.id,title:r.title}))])):{},paths:this.request.items.map(item=>({path:item.path,type:item.type,name:path.basename(item.path)}))};
 }
 pathsUnchanged(){for(const item of this.request.items){const actual=inspectPath(item.path);if(actual.type!==item.type||!sameIdentity(item.identity,actual.identity))throw new Error('拖放來源已被替換，請關閉表單後重新拖放');}}
 preview(input){
  this.pending=null;if(this.busy)throw new Error('正在儲存，請稍候');const {action,state,sheet,parent}=this.target();if(!input||typeof input!=='object')throw new Error('表單內容無效');
  const token=crypto.randomUUID(),expires=Date.now()+600000;
  if(action.type==='import-paths'){const preview=previewPathImport(this.favorites,input.text,input.tags),count=preview.counts.new+preview.counts.existing;if(!count)throw new Error('沒有可匯入的位置，請檢查完整路徑');this.pending={token,expires,kind:'import-paths',text:input.text,tags:preview.tags,importToken:preview.token};return {token,count,summary:`新增 ${preview.counts.new} 個收藏、合併 ${preview.counts.existing} 個既有收藏、略過 ${preview.counts.error} 個無效位置及 ${preview.counts.duplicate} 行重複`,rows:preview.rows.slice(0,100).map(row=>({title:row.path,detail:row.message}))};}
  this.pathsUnchanged();if(!input.values||typeof input.values!=='object'||Array.isArray(input.values))throw new Error('欄位資料無效');
  if(parent){const ids=input.values[parent.id];if(!Array.isArray(ids)||ids.length!==1||!state.document.records.some(r=>r.id===ids[0]&&r.sheetId===parent.targetSheetId&&M.live(state.document,r)))throw new Error('請選擇一筆可用的所屬主紀錄');}
  const items=this.request.items,tags=cleanTags(input.tags),now=new Date().toISOString(),catalog=this.favorites.read().items;
  let pathPreview;if(items.length){pathPreview=previewPathImport(this.favorites,items.map(i=>'"'+i.path+'"').join('\n'),[]);if(pathPreview.counts.error)throw new Error('部分來源不可建立收藏連結，請重新拖放：'+pathPreview.rows.filter(r=>r.status==='error').map(r=>r.message).join('；'));}
  if(typeof input.title!=='string'||input.title.length>200)throw new Error('標題最多 200 字元');
  const records=(items.length?items:[null]).map(item=>({id:crypto.randomUUID(),sheetId:sheet.id,title:item?((input.title.trim()?input.title.trim()+' ':'')+path.basename(item.path)).slice(0,200):input.title,notes:input.notes,tags,values:JSON.parse(JSON.stringify(input.values)),fileLinks:item?[{favoriteId:catalog.find(f=>key(f.path)===key(item.path))?.id||crypto.randomUUID(),path:item.path,label:'',type:item.type}]:[],favoriteTagLinks:[],version:1,createdAt:now,updatedAt:now,deletedAt:null}));
  const candidate=M.clone(state.document);candidate.records.push(...records);const normalized=M.normalizeDocument(candidate);if(Buffer.byteLength(JSON.stringify(normalized))>M.LIMITS.bytes)throw new Error('工作區超過 20 MB 上限');
  this.pending={token,expires,kind:'records',revision:state.revision,records:normalized.records.slice(-records.length),pathToken:pathPreview?.token};return {token,count:records.length,summary:`將在「${sheet.name}」建立 ${records.length} 筆紀錄`+(items.length?'，並加入收藏以建立可開啟的位置連結；資料夾不展開子項目。':'。'),rows:records.map(record=>({title:record.title,detail:record.fileLinks[0]?.path||'新增紀錄'}))};
 }
 commit(token){
  if(this.busy)throw new Error('正在儲存，請稍候');const pending=this.pending;if(!pending||typeof token!=='string'||pending.token!==token||pending.expires<Date.now())throw new Error('預覽已失效，請重新預覽');this.target();this.busy=true;let favoritesAdded=false;
  try{
   if(pending.kind==='import-paths'){const result=importPathList(this.favorites,pending.text,pending.tags,pending.importToken);this.pending=null;this.notifyFavorites();return {message:`已新增 ${result.added} 個收藏、已收藏 ${result.existing} 個；略過 ${result.skipped} 個位置。`,issues:result.issues};}
   const store=this.notesStore();if(store.get().revision!==pending.revision)throw new Error('工作區已變更，請重新預覽');this.pathsUnchanged();let backup;
   if(this.request.items.length){const text=this.request.items.map(i=>'"'+i.path+'"').join('\n');if(previewPathImport(this.favorites,text,[]).token!==pending.pathToken)throw new Error('收藏或來源已變更，請重新預覽');backup=store.backup('before-capture');const result=importPathList(this.favorites,text,[],pending.pathToken);favoritesAdded=true;if(result.issues.length)throw new Error(result.issues.join('\n'));const catalog=this.favorites.read().items;for(const record of pending.records)for(const link of record.fileLinks){const found=catalog.find(item=>key(item.path)===key(link.path));if(!found)throw new Error('來源收藏未完成');link.favoriteId=found.id;}}
   const result=store.change(doc=>{doc.records.push(...pending.records);return {count:pending.records.length,backup};},pending.revision);this.pending=null;this.notesChanged(result);if(favoritesAdded)this.notifyFavorites();return {message:`已在表格建立 ${pending.records.length} 筆紀錄。`,count:pending.records.length,backup};
  }catch(error){this.pending=null;if(favoritesAdded){this.notifyFavorites();throw new Error('收藏連結已儲存，但表格紀錄未建立；請重新預覽後再試。'+error.message);}throw error;}finally{this.busy=false;}
 }
 close(){if(this.busy)throw new Error('正在儲存，請稍候');this.destroy();}
 destroy(){if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;this.request=null;this.pending=null;}
}
module.exports={FloatingCapture,captureBounds,checkedPaths};
