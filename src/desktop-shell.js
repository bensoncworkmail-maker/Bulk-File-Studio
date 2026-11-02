'use strict';
const path=require('node:path');
// Native lifecycle only. No file operations or renderer-provided launch commands.
class DesktopShell {
 constructor(options){Object.assign(this,options);this.tray=null;this.quitting=false;}
 ensureTray(){
  if(this.tray)return true;
  try{
   if(!this.Tray||!this.Menu||!this.nativeImage)throw new Error('此環境無法使用系統匣');
   const image=this.nativeImage.createFromDataURL(TRAY_ICON);
   if(image.isEmpty())throw new Error('系統匣圖示無法載入');
   const tray=new this.Tray(image);this.tray=tray;
   tray.setToolTip('Bulk File Studio');
   tray.setContextMenu(this.Menu.buildFromTemplate([
    {label:'開啟 Bulk File Studio',click:()=>this.showMain()},
    {label:'顯示浮動工具',click:()=>this.showFloating()},
    {label:'隱藏至系統匣',click:()=>this.hideToTray()},
    {type:'separator'},
    {label:'結束程式',click:()=>{this.quitting=true;this.app.quit();}}
   ]));
   tray.on('click',()=>this.showMain());tray.on('double-click',()=>this.showMain());return true;
  }catch(e){this.tray?.destroy();this.tray=null;this.onWarning('無法建立系統匣，主視窗會保持可見：'+e.message);return false;}
 }
 hideFloatingForTray(){const settings=this.getSettings();if(!(settings.floatingKeepPinnedOnTray&&settings.floatingOnTop))this.hideFloating();}
 hideToTray(){if(!this.ensureTray())return false;this.hideMain();this.hideFloatingForTray();return true;}
 onClose(event){if(this.quitting||!this.getSettings().closeToTray)return false;if(!this.ensureTray())return false;event.preventDefault();this.hideMain();this.hideFloatingForTray();return true;}
 registerShortcuts(settings=this.getSettings()){
  this.globalShortcut.unregisterAll();const warnings=[];
  for(const [key,label,callback] of [['mainShortcut','主視窗',()=>this.showMain()],['floatingShortcut','浮動工具',()=>this.showFloating(true)],['collapseShortcut','收合／展開浮動工具',()=>this.toggleFloatingCollapse()]]){
   const accelerator=settings[key];if(!accelerator)continue;
   try{if(!this.globalShortcut.register(accelerator,callback))warnings.push(label+'快捷鍵已被其他程式使用，請在設定選擇另一組。');}
   catch(e){warnings.push('無法註冊'+label+'快捷鍵：'+e.message);}
  }return warnings.join('\n');
 }
 loginSupported(){return this.platform==='win32'&&this.packaged&&!this.portable;}
 loginOptions(){return {name:'BulkFileStudio',path:this.executable,args:['--login-startup']};}
 loginStatus(){
  if(!this.loginSupported())return {supported:false,enabled:false,reason:'開機啟動僅適用於 Windows 安裝版；可攜版及原始碼模式不會註冊。'};
  const options=this.loginOptions(),read=executable=>this.app.getLoginItemSettings({path:executable,args:options.args}),samePath=value=>typeof value==='string'&&path.win32.normalize(value.replace(/^"|"$/g,'')).toLowerCase()===path.win32.normalize(this.executable).toLowerCase();
  const matches=item=>item&&typeof item.name==='string'&&require('./startup-registration').NAMES.some(name=>name.toLowerCase()===item.name.toLowerCase())&&item.scope==='user'&&samePath(item.path)&&Array.isArray(item.args)&&item.args.length===options.args.length&&item.args.every((arg,index)=>arg===options.args[index]);
  let result;try{result=read(this.executable);}catch(error){if(!this.readLoginRegistration)throw error;result={};}let ownResult=result,own=Array.isArray(result.launchItems)?result.launchItems.find(matches):null;
  if(!own&&/\s/.test(this.executable)){try{const fallback=read('"'+this.executable+'"');own=Array.isArray(fallback.launchItems)?fallback.launchItems.find(matches):null;if(own)ownResult=fallback;}catch(error){if(!this.readLoginRegistration)throw error;}}
  // openAtLogin reads Electron's default AppUserModelId; our named Run entry is in launchItems.
  let registry=null;if(!own&&this.readLoginRegistration)registry=this.readLoginRegistration(this.executable);
  const registered=own?true:registry?registry.registered:Array.isArray(result.launchItems)?false:result.openAtLogin===true,disabledBySystem=registered&&(own?ownResult.launchItems.filter(matches).every(item=>item.enabled===false):registry?registry.disabledBySystem===true:result.executableWillLaunchAtLogin===false);
  return {supported:true,registered,enabled:registered,disabledBySystem,willLaunch:registry?.approvalUnknown?null:registered&&!disabledBySystem,verifiedBy:registry?'registry':'electron',entryNames:registry?.entryNames||(Array.isArray(ownResult.launchItems)?ownResult.launchItems.filter(matches).map(item=>item.name):[]),...(registry?.otherLocation&&!registry.registered?{reason:'啟動項指向另一個安裝位置，請重新勾選以登記目前版本。'}:{}),...(registry?.approvalUnknown?{reason:'本程式已登記啟動，但無法判定 Windows 核准狀態；請查看系統啟動設定。'}:{})};
 }
 setLogin(enabled){
  if(typeof enabled!=='boolean'||!this.loginSupported())throw new Error('請使用 Windows 安裝版設定開機啟動');
  const before=this.loginStatus();for(const name of before.entryNames||[])if(name!=='BulkFileStudio')this.app.setLoginItemSettings({...this.loginOptions(),name,openAtLogin:false,enabled:false});this.app.setLoginItemSettings({...this.loginOptions(),openAtLogin:enabled,enabled});
  const result=this.loginStatus();if(result.enabled!==enabled){const error=new Error('無法驗證 Windows 啟動項，請按重新檢查，或查看 Windows 的啟動應用程式設定');error.code='STARTUP_VERIFY_FAILED';throw error;}return result;
 }
 openLoginSettings(){if(this.platform!=='win32'||typeof this.openStartupSettings!=='function')throw new Error('此環境無法開啟 Windows 啟動設定');return this.openStartupSettings();}
 destroy(){this.globalShortcut.unregisterAll();this.tray?.destroy();this.tray=null;}
}
// Embedded local PNG; no network or external icon dependency.
const TRAY_ICON='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOUlEQVR4nO3OwQkAIAwEwXRtIzaaCvQvCAYfgszCvW8iJC31luN0AP8BKuc3AwAAAAAAAADYAqQXTdZrqM7gF0lGAAAAAElFTkSuQmCC';
module.exports={DesktopShell};
