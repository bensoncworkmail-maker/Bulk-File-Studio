'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{TextDecoder}=require('node:util'),{assertLocalPath,installOfflinePolicy}=require('./offline-policy'),{readStableBytes}=require('./bounded-file-read');
const TYPES={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp'};
const PDF_ORIGIN='chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai';
function allowedPreviewRequest(url,snapshot){try{const parsed=new URL(url);if(parsed.protocol==='data:')return true;if(parsed.protocol==='chrome-extension:')return parsed.hostname==='mhjfbmdgcfjbbpaeojofohoefgiehjai';if(parsed.protocol==='chrome:')return parsed.hostname==='resources';if(parsed.protocol==='blob:')return url.startsWith('blob:'+PDF_ORIGIN+'/');if(parsed.protocol!=='file:'||parsed.hostname)return false;parsed.hash='';parsed.search='';return parsed.href===pathToFileURL(snapshot).href;}catch{return false;}}
function previewType(filename){const extension=path.extname(filename).toLowerCase(),type=TYPES[extension]?'image':extension==='.pdf'?'pdf':['.txt','.html','.htm','.md','.csv','.log','.json','.xml','.yaml','.yml','.ini'].includes(extension)?'text':null;if(!type)throw new Error('預覽支援 PDF、PNG／JPG／GIF／WebP／BMP 及 UTF-8／UTF-16 文字檔');return type;}
function decodePreview(filename,type,bytes){const extension=path.extname(filename).toLowerCase();if(type==='pdf'&&!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('文件不是有效的 PDF');const out={type,name:path.basename(filename),path:filename,size:bytes.length};if(type==='image')return {...out,data:'data:'+TYPES[extension]+';base64,'+bytes.toString('base64')};if(type==='text'){const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';return {...out,text:new TextDecoder(encoding,{fatal:true}).decode(bytes)};}return {...out,bytes};}
function previewLimit(type){
 return {maxBytes:type==='text'?2*1024*1024:25*1024*1024,label:'預覽文件'};
}

function readPreview(filename){
 assertLocalPath(filename);
 const type=previewType(filename);
 return decodePreview(filename,type,readStableBytes(filename,previewLimit(type)));
}

async function readSelectedPreview(input){
 const filename=require('./notes-location-links').locationPath(input);
 await require('./intranet-path').withIntranetPaths([filename],()=>/^\\\\/.test(filename)?require('./notes-location-links').inspectIntranetLocation(filename):require('./notes-location-links').inspectLocation(filename));
 const selected=await fs.promises.lstat(filename);
 if(selected.isDirectory()&&!selected.isSymbolicLink()){const rows=[];const directory=await fs.promises.opendir(filename);let truncated=false;try{for await(const entry of directory){if(rows.length===200){truncated=true;break;}rows.push((entry.isDirectory()?'[資料夾] ':'[檔案] ')+entry.name);}}finally{/* for-await closes the directory even when truncated. */}return {type:'folder',name:path.basename(filename)||filename,path:filename,text:rows.sort((a,b)=>a.localeCompare(b,'zh-Hant')).join('\n')+(truncated?'\n…僅顯示前 200 項':'')||'空資料夾'};}
 const type=previewType(filename);
 const paths=/^(?:[a-z]:|\\\\)/i.test(filename)?path.win32:path;
 for(let current=filename;;){
  const stat=await fs.promises.lstat(current);
  if(stat.isSymbolicLink()||(current===filename?!stat.isFile():!stat.isDirectory())){
   throw new Error('預覽只支援一般文件及資料夾路徑');
  }
  const parent=paths.dirname(current);
  if(parent===current)break;
  current=parent;
 }
 return decodePreview(filename,type,await require('./bounded-file-read').readStableBytesAsync(filename,previewLimit(type)));
}

class DocumentPreview{
 constructor({BrowserWindow,root,parent,screen,size,remember}){Object.assign(this,{BrowserWindow,root,parent,screen,size,remember});this.windows=new Set();}
 async show(filename,mode='inline',parent=this.parent()){const data=await readSelectedPreview(filename);if(data.type!=='pdf')return mode==='window'?this.showContent(data,parent):data;const directory=path.join(this.root,crypto.randomUUID());assertLocalPath(directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});const pdf=path.join(directory,'document.pdf');fs.writeFileSync(pdf,data.bytes,{mode:0o600,flag:'wx'});let window;try{const defaults={width:980,height:760,...this.size?.(),minWidth:340,minHeight:280};const bounds=this.screen?require('./desktop-state').fitBounds(null,this.screen.getAllDisplays(),defaults):defaults;window=new this.BrowserWindow({...bounds,parent,title:data.name+' · 文件預覽',autoHideMenuBar:true,webPreferences:{partition:'bfs-pdf-'+crypto.randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,plugins:true,devTools:false}});installOfflinePolicy(window.webContents.session,directory);
// Chromium's bundled PDF viewer imports chrome://resources; these are local engine assets.
window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allowedPreviewRequest(details.url,pdf)}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());window.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.windows.add(window);this.remember?.(window);window.on('closed',()=>{this.windows.delete(window);fs.rmSync(directory,{recursive:true,force:true});});await window.loadURL(pathToFileURL(pdf).href);return {type:'pdf',name:data.name,path:data.path,opened:true};}catch(error){window?.destroy();fs.rmSync(directory,{recursive:true,force:true});throw error;}}
 async showContent(data,parent){
  const directory=path.join(this.root,crypto.randomUUID());assertLocalPath(directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const html=path.join(directory,'preview.html');
  const content=data.type==='image'?'<img alt="'+escape(data.name)+'" src="'+data.data+'">':'<pre>'+escape(data.text)+'</pre>';
  fs.writeFileSync(html,`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'self'; base-uri 'none'; form-action 'none'"><title>${escape(data.name)}</title><link rel="stylesheet" href="preview.css"><header><strong>${escape(data.name)}</strong><p>${escape(data.path)}</p></header><main>${content}</main></html>`,{flag:'wx'});
  fs.writeFileSync(path.join(directory,'preview.css'),'html{color-scheme:light dark;font:14px/1.6 system-ui}body{margin:20px}p{opacity:.7;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}header{border-bottom:1px solid #8885}');
  let window;try{const defaults={width:800,height:640,...this.size?.(),minWidth:340,minHeight:280};const bounds=this.screen?require('./desktop-state').fitBounds(null,this.screen.getAllDisplays(),defaults):defaults;
   window=new this.BrowserWindow({...bounds,parent,title:data.name+' · 文件預覽',autoHideMenuBar:true,webPreferences:{partition:'bfs-preview-'+crypto.randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,devTools:false}});
   installOfflinePolicy(window.webContents.session,directory);window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());window.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.windows.add(window);this.remember?.(window);window.on('closed',()=>{this.windows.delete(window);fs.rmSync(directory,{recursive:true,force:true});});await window.loadFile(html);return {type:data.type,name:data.name,path:data.path,opened:true};
  }catch(error){window?.destroy();fs.rmSync(directory,{recursive:true,force:true});throw error;}
 }
 close(){for(const window of this.windows)window.destroy();}
}
module.exports={readPreview,readSelectedPreview,DocumentPreview,allowedPreviewRequest};
