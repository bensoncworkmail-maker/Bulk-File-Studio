'use strict';
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
    {label:'顯示浮動收藏',click:()=>this.showFloating()},
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
  const result=this.app.getLoginItemSettings(this.loginOptions());
  return {supported:true,enabled:result.openAtLogin===true,disabledBySystem:result.openAtLogin===true&&result.executableWillLaunchAtLogin===false};
 }
 setLogin(enabled){
  if(typeof enabled!=='boolean'||!this.loginSupported())throw new Error('請使用 Windows 安裝版設定開機啟動');
  this.app.setLoginItemSettings({...this.loginOptions(),openAtLogin:enabled});
  const result=this.loginStatus();if(result.enabled!==enabled)throw new Error('Windows 未套用開機啟動設定，請檢查系統的啟動應用程式設定');return result;
 }
 destroy(){this.globalShortcut.unregisterAll();this.tray?.destroy();this.tray=null;}
}
// Embedded local PNG; no network or external icon dependency.
const TRAY_ICON='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAOUlEQVR4nO3OwQkAIAwEwXRtIzaaCvQvCAYfgszCvW8iJC31luN0AP8BKuc3AwAAAAAAAADYAqQXTdZrqM7gF0lGAAAAAElFTkSuQmCC';
module.exports={DesktopShell};
