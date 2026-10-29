'use strict';
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const ROOTS=['HKCU\\Software\\Classes\\*\\shell\\BulkRenameStudio.Favorite','HKCU\\Software\\Classes\\Directory\\shell\\BulkRenameStudio.Favorite'];
function validFavoritePaths(paths) {
  if(!Array.isArray(paths))return [];
  return paths.filter(value=>typeof value==='string' && (path.isAbsolute(value)||path.win32.isAbsolute(value)) && !value.includes('\0')).slice(0,10000);
}
function favoriteArguments(argv) {
  if(!Array.isArray(argv))return [];
  const marker=argv.indexOf('--favorite');
  if(marker<0 || argv[marker+1]!=='--')return [];
  return validFavoritePaths(argv.slice(marker+2));
}
class WindowsContextMenu {
  constructor({platform=process.platform,executable=process.execPath,packaged=false,portable=false,run=spawnSync}={}) {
    this.platform=platform;this.executable=executable;this.packaged=packaged;this.portable=portable;this.run=run;
  }
  supported() { return this.platform==='win32' && this.packaged && !this.portable; }
  command() {
    if(!path.win32.isAbsolute(this.executable)||this.executable.includes('"'))throw new Error('應用程式安裝路徑無效');
    return `"${this.executable}" --favorite -- "%1"`;
  }
  invoke(args,allowFailure=false) {
    const result=this.run('reg.exe',args,{encoding:'utf8',windowsHide:true,shell:false,timeout:10000});
    if(result.error||(!allowFailure&&result.status!==0))throw new Error(`無法更新 Windows 右鍵選單：${result.error?.message||result.stderr||'登錄操作失敗'}`);
    return result;
  }
  status() {
    if(!this.supported())return {supported:false,enabled:false,reason:'右鍵整合只適用於 Windows 安裝版；原始碼及可攜版仍可使用程式內收藏。'};
    const states=ROOTS.map(root=>this.invoke(['query',root+'\\command','/ve'],true));
    // Registry console output can use the local Windows codepage. Match the ASCII
    // command marker rather than decoding a possibly non-ASCII installation path.
    return {supported:true,enabled:states.every(result=>result.status===0&&String(result.stdout).replace(/\0/g,'').includes('--favorite -- "%1"')),reason:'Windows 11 可能需要按「顯示更多選項」。傳統選單單次多選通常最多 15 項；大量項目請在程式內加入。安裝位置變動後請停用再啟用。'};
  }
  setEnabled(enabled) {
    if(typeof enabled!=='boolean'||!this.supported())throw new Error('請使用 Windows 安裝版設定右鍵選單');
    if(enabled) {
      try {
        for(const root of ROOTS) {
          for(const [name,value] of [['MUIVerb','收藏到 Bulk File Studio'],['Icon',`"${this.executable}",0`],['MultiSelectModel','Document']])this.invoke(['add',root,'/v',name,'/t','REG_SZ','/d',value,'/f']);
          this.invoke(['add',root+'\\command','/ve','/t','REG_SZ','/d',this.command(),'/f']);
        }
      } catch(error) { for(const root of ROOTS)this.invoke(['delete',root,'/f'],true);throw error; }
    } else {
      for(const root of ROOTS)this.invoke(['delete',root,'/f'],true);
      if(ROOTS.some(root=>this.invoke(['query',root],true).status===0))throw new Error('右鍵選單未完全移除，請重試');
    }
    return this.status();
  }
}
module.exports={WindowsContextMenu,favoriteArguments,validFavoritePaths,ROOTS};
