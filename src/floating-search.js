'use strict';
const path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{captureBounds}=require('./floating-capture');
class FloatingSearch{
 constructor(options){Object.assign(this,options);this.window=null;this.current=null;this.query='';}
 owns(event){return this.window&&!this.window.isDestroyed()&&event?.sender===this.window.webContents&&event?.senderFrame?.url===pathToFileURL(path.join(__dirname,'floating-search.html')).href;}
 open(query=''){
  if(!this.settings().floatingGlobalSearch)throw new Error('浮動全域搜尋已停用，請至設定啟用');if(typeof query!=='string'||query.length>256)throw new Error('搜尋文字最多 256 字元');this.query=query;this.current=null;
  if(this.window&&!this.window.isDestroyed()){this.window.webContents.send('floating-search-query',query);this.window.show();this.window.focus();return {opened:true};}
  const prefs=this.settings(),parent=this.parent(),win=new this.BrowserWindow({...captureBounds(parent.getNormalBounds(),this.screen.getAllDisplays(),{width:prefs.floatingSearchWidth,height:prefs.floatingSearchHeight}),parent,modal:false,show:true,skipTaskbar:true,alwaysOnTop:prefs.floatingOnTop,autoHideMenuBar:true,title:'Bulk File Studio · 全域搜尋',backgroundColor:prefs.theme==='light'?'#f7f9fe':'#11192a',webPreferences:{preload:path.join(__dirname,'floating-search-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false}});this.window=win;
  try{this.secureWindow(win);win.on('closed',()=>{if(this.window===win){this.window=null;this.current=null;}});win.loadFile(path.join(__dirname,'floating-search.html'));win.show();win.focus();return {opened:true};}catch(error){this.destroy();throw error;}
 }
 data(){const prefs=this.settings();return {query:this.query,theme:prefs.theme,fontSize:prefs.fontSize};}
 search(query,options={}){
  this.current=null;if(!this.settings().floatingGlobalSearch)throw new Error('浮動全域搜尋已停用');if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('搜尋選項無效');
  const sources=['records','paths','favorites','tags','structure'],kind=sources.includes(options.kind)?options.kind:null,offset=Number.isSafeInteger(options.offset)&&options.offset>=0?options.offset:0;
  const result=this.run(query,{sources:kind?[kind]:sources,limit:25,offsets:kind?{[kind]:offset}:{},includeRelated:options.includeRelated===true,includeAreas:false,showEmpty:false,snippetLength:120});this.query=query;const token=crypto.randomUUID();this.current={token,result,expires:Date.now()+600000};return {...result,token,limit:25};
 }
 async action(token,section,index,action){
  const current=this.current;if(!this.settings().floatingGlobalSearch||!current||token!==current.token||current.expires<Date.now())throw new Error('搜尋結果已更新，請重新搜尋');if(!Number.isSafeInteger(index)||index<0)throw new Error('搜尋項目無效');const item=current.result.sections.find(value=>value.kind===section)?.items[index];if(!item)throw new Error('搜尋項目無效');
  if(action==='visit'&&['record','sheet','favorite','tag'].includes(item.kind)){this.visit(item);return {message:'已要求主視窗開啟；若有未儲存內容，請先完成或取消編輯。'};}
  if(action==='copy'&&['path','favorite'].includes(item.kind)){this.copy(item.path);return {message:'已複製路徑。'};}
  if(!['open','show'].includes(action)||!['favorite','path'].includes(item.kind))throw new Error('此結果不支援這個操作');const id=item.kind==='favorite'?item.id:item.favoriteId;if(!id)throw new Error('文字位置須先連結收藏，才能開啟或定位');
  const favorite=this.favorites.get(id,true);if(favorite.path!==item.path)throw new Error('收藏位置已變更，請重新搜尋');await this.fileAction(action,favorite);return {message:action==='open'?'已開啟。':'已定位。'};
 }
 invalidate(){this.current=null;if(this.window&&!this.window.isDestroyed())this.window.webContents.send('floating-search-invalidated',{});}
 updateSettings(){if(!this.settings().floatingGlobalSearch){this.destroy();return;}if(this.window&&!this.window.isDestroyed()){this.window.setAlwaysOnTop(this.settings().floatingOnTop);this.window.webContents.send('floating-search-theme',this.data());}}
 destroy(){const win=this.window;this.window=null;this.current=null;if(win&&!win.isDestroyed())win.destroy();}
}
module.exports={FloatingSearch};
