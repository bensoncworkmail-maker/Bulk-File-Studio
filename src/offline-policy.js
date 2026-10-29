'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {fileURLToPath}=require('node:url');
function assertLocalPath(value) {
  if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('\0')||/^[\\/]{2}/.test(value)||/^\\\\[?.]\\/.test(value))throw new Error('離線模式只允許本機完整路徑，不接受網路／裝置路徑');
  // Reject links in parent directories as well as the final component.
  let current=path.resolve(value);
  while(true){try{if(fs.lstatSync(current).isSymbolicLink())throw new Error('離線模式不接受符號連結或重新解析連結');}catch(e){if(e.code!=='ENOENT')throw e;}const parent=path.dirname(current);if(parent===current)break;current=parent;}
  return value;
}
function allowedRequest(url,root) {
  try {const parsed=new URL(url);if(parsed.protocol==='data:')return true;if(parsed.protocol!=='file:'||parsed.hostname)return false;
    const relative=path.relative(root,fileURLToPath(parsed));return relative!== '..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);
  }catch{return false;}
}
function installOfflinePolicy(session,root) {
  session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!allowedRequest(details.url,root)}));
  session.setPermissionRequestHandler((contents,permission,callback)=>callback(false));
  session.setPermissionCheckHandler(()=>false);
  session.on('will-download',event=>event.preventDefault());
}
function assertSafeOpen(filepath) {
  assertLocalPath(filepath);
  if(/\.(exe|com|bat|cmd|ps1|vbs|vbe|js|jse|wsf|wsh|msi|scr|lnk|url|website|hta|reg|appref-ms|scf|desktop|sh)$/i.test(filepath))throw new Error('為避免執行程式、腳本或網路捷徑，此類檔案請使用「定位」後自行開啟');
}
module.exports={assertLocalPath,allowedRequest,installOfflinePolicy,assertSafeOpen};
