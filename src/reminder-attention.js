'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url'),{fitBounds}=require('./desktop-state');
const key=item=>item.id+':'+item.at;
class ReminderAttention{
 constructor({BrowserWindow,screen,secureWindow,settings,list,act,blocked,beep,onError,now=Date.now,setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
  Object.assign(this,{BrowserWindow,screen,secureWindow,settings,list,act,blocked,beep,onError,now,clearIntervalFn});this.window=null;this.dismissed=new Set();this.visibleKeys=[];this.signature='';this.lastBeep=0;this.ready=false;this.presented=false;
  this.timer=setIntervalFn(()=>{try{this.sync();}catch(error){onError(error);}},5000);this.timer?.unref?.();
 }
 due(){const prefs=this.settings();return prefs.remindersEnabled?this.list().items.filter(item=>item.available&&item.status==='fired'&&(item.delivery==='default'?prefs.reminderDelivery:item.delivery)==='attention'):[];}
 data(){const prefs=this.settings();return {items:this.due().filter(item=>!this.dismissed.has(key(item))).map(({id,title,sheet,at,messageContent})=>({id,title,sheet,at,messageContent})),snoozeMinutes:prefs.reminderSnoozeMinutes,theme:prefs.theme,fontSize:prefs.fontSize,sound:prefs.reminderAttentionSound,repeatMinutes:prefs.reminderAttentionRepeatMinutes};}
 owns(event){return this.window&&!this.window.isDestroyed()&&event?.sender===this.window.webContents&&event?.senderFrame?.url===pathToFileURL(path.join(__dirname,'reminder-attention.html')).href;}
 suppress(){for(const value of this.visibleKeys)this.dismissed.add(value);}
 dismiss(){this.suppress();this.destroyWindow();}
 destroyWindow(){const win=this.window;this.window=null;this.ready=false;this.presented=false;this.signature='';this.visibleKeys=[];if(win&&!win.isDestroyed()){win.flashFrame(false);win.destroy();}}
 pulse(){if(!this.window||this.window.isDestroyed())return;this.lastBeep=this.now();if(!this.window.isFocused())this.window.flashFrame(true);if(this.settings().reminderAttentionSound)try{this.beep();}catch(error){this.onError(error);}}
 present(){if(!this.ready||this.blocked()||!this.data().items.length)return;this.window.showInactive();if(this.settings().reminderBringToFront){this.window.show();this.window.focus();}this.presented=true;this.pulse();}
 sync(){try{this.refresh();}catch(error){this.onError(error);}}
 refresh(){
  const active=new Set(this.due().map(key));this.dismissed=new Set([...this.dismissed].filter(value=>active.has(value)));const data=this.data();if(!data.items.length){this.destroyWindow();return;}if(this.blocked())return;
  const nextKeys=data.items.map(key),newItem=nextKeys.some(value=>!this.visibleKeys.includes(value));this.visibleKeys=nextKeys;
  if(!this.window||this.window.isDestroyed()){
   const prefs=this.settings(),win=new this.BrowserWindow({...fitBounds(null,this.screen.getAllDisplays(),{width:520,height:440,minWidth:340,minHeight:260}),show:false,alwaysOnTop:true,skipTaskbar:false,autoHideMenuBar:true,title:'Bulk File Studio · 到期強提醒',backgroundColor:prefs.theme==='light'?'#f7f9fe':'#11192a',webPreferences:{preload:path.join(__dirname,'reminder-attention-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,devTools:false}});
   this.window=win;try{this.secureWindow(win);win.on('ready-to-show',()=>{if(this.window===win){this.ready=true;this.sync();}});win.on('focus',()=>win.flashFrame(false));win.on('close',()=>{if(this.window===win)this.suppress();});win.on('closed',()=>{if(this.window===win){this.window=null;this.ready=false;this.presented=false;this.signature='';}});win.loadFile(path.join(__dirname,'reminder-attention.html'));}catch(error){this.destroyWindow();throw error;}
  }
  const signature=JSON.stringify(data);if(signature!==this.signature){this.signature=signature;this.window.webContents.send('reminder-attention-changed',data);}if(!this.ready)return;
  if(!this.presented){this.present();return;}if(newItem){this.pulse();return;}
  const minutes=this.settings().reminderAttentionRepeatMinutes;if(this.settings().reminderAttentionSound&&minutes>0&&this.now()-this.lastBeep>=minutes*60000)this.pulse();
 }
 action(kind,id){if(!['ack','snooze'].includes(kind)||!this.data().items.some(item=>item.id===id))throw new Error('此提醒已變更，請重新查看');this.act(kind,id);this.sync();return this.data();}
 close(){this.clearIntervalFn(this.timer);this.destroyWindow();}
}
module.exports={ReminderAttention};
