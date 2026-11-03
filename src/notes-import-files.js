'use strict';
// Manual, user-selected JSON reads have a separate filesystem path policy.
// This does not change browser requests or paths allowed by file mutations.
const fs=require('node:fs'),path=require('node:path'),{TextDecoder}=require('node:util');
const {LIMITS}=require('./notes-model');
const VOLUME=/^Volume\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}\\/i;
function packageImportPath(input,platform=process.platform){
 if(typeof input!=='string'||!input||input.length>32767||/[\x00-\x1f]/.test(input))throw new Error('請選取有效的完整資料包路徑');
 if(platform!=='win32'&&!/^(?:[a-z]:[\\/]|[\\/]{2})/i.test(input)){if(!path.posix.isAbsolute(input))throw new Error('請選取完整資料包路徑');return path.posix.normalize(input);}
 const filename=input.replace(/\//g,'\\');let base=filename,prefix='',volume=false;
 if(/^\\\\[?.]\\/.test(filename)){
  const tail=filename.slice(4);prefix='\\\\?\\';
  if(/^UNC\\/i.test(tail))base='\\\\'+tail.slice(4);
  else if(/^[a-z]:\\/i.test(tail))base=tail;
  else if(VOLUME.test(tail)){base=tail;volume=true;}
  else throw new Error('請選取磁碟、共享或磁碟區內的一般 JSON 資料包；不接受硬體裝置或管道');
 }
 if(/[<>"|?*]/.test(base)||base.slice(/^[a-z]:/i.test(base)?2:0).includes(':'))throw new Error('資料包路徑包含不支援的字元或替代資料串流');
 if(!volume&&!/^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(base))throw new Error('請選取磁碟完整路徑或完整 UNC 共享路徑');
 const parts=base.split('\\');if(parts.some(part=>part&&part!=='.'&&part!=='..'&&(/[. ]$/.test(part)||/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))))throw new Error('請選取一般檔案路徑，不能使用保留裝置名稱');
 if(prefix&&parts.some(part=>part==='.'||part==='..'))throw new Error('延伸資料包路徑不能包含相對目錄');
 if(volume)return prefix+base;
 base=path.win32.normalize(base);return prefix?(base.startsWith('\\\\')?prefix+'UNC\\'+base.slice(2):prefix+base):base;
}
function packageImportName(filename){return /^(?:[a-z]:[\\/]|[\\/]{2})/i.test(filename)?path.win32.basename(filename):path.basename(filename);}
async function readImportPackageFile(input){
 const filename=packageImportPath(input),windows=/^(?:[a-z]:\\|\\\\)/i.test(filename),p=windows?path.win32:path.posix;
 try{
  let initial,current=filename;
  while(true){const stat=await fs.promises.lstat(current);if(stat.isSymbolicLink())throw new Error('資料包路徑不支援符號連結或重新解析連結');if(current===filename){initial=stat;if(!stat.isFile()||!Number.isSafeInteger(stat.size)||stat.size<0||stat.size>LIMITS.bytes)throw new Error('資料包必須是 20 MB 以內的一般 JSON 檔案');}else if(!stat.isDirectory())throw new Error('資料包的上層位置不是資料夾');const parent=p.dirname(current);if(parent===current)break;current=parent;}
  const handle=await fs.promises.open(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));
  try{
   const before=await handle.stat();if(!before.isFile()||before.size!==initial.size||before.dev!==initial.dev||before.ino!==initial.ino||before.mtimeMs!==initial.mtimeMs)throw new Error('資料包已被替換或正在更新，請稍後重新選取');
   const buffer=Buffer.allocUnsafe(before.size+1);let size=0;while(size<buffer.length){const {bytesRead}=await handle.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
   const after=await handle.stat();if(size!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.dev!==before.dev||after.ino!==before.ino)throw new Error('資料包讀取期間正在更新，請稍後重試');
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size)));
  }finally{await handle.close();}
 }catch(error){if(['ENOENT','ENOTDIR','EACCES','EPERM','ENETUNREACH','EHOSTUNREACH','ENOTCONN','EIO'].includes(error.code))throw new Error('無法讀取資料包，請確認網路共享已連線、檔案存在且具備讀取權限。'+String(error.message||error));throw error;}
}
module.exports={packageImportPath,packageImportName,readImportPackageFile};
