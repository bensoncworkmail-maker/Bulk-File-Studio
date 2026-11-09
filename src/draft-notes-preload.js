'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('draft-'+name,...args);
contextBridge.exposeInMainWorld('draftAPI',{
 data:()=>invoke('data'),configure:patch=>invoke('configure',patch),export:(id,version,extension)=>invoke('export',id,version,extension),preview:(id,index)=>invoke('preview',id,index),remind:(id,version,input)=>invoke('remind',id,version,input),
 read:id=>invoke('read',id),
 newDraft:()=>invoke('new'),
 save:(id,version,text)=>invoke('save',id,version,text),
 attach:(id,version,paths)=>invoke('attach',id,version,paths),
 paste:(id,version,bytes)=>invoke('paste',id,version,bytes),
 image:(id,index)=>invoke('image',id,index),
 remove:(id,version,index)=>invoke('remove',id,version,index),
 deleteDraft:(id,version)=>invoke('delete',id,version),
 masters:sheetId=>invoke('masters',sheetId),
 send:(id,version,sheetId,masterId,withReminder,mapping)=>invoke('send',id,version,sheetId,masterId,withReminder,mapping),
 close:()=>invoke('close'),
 cancelClose:()=>invoke('cancel-close'),
 onClose:callback=>ipcRenderer.on('draft-close-request',()=>callback()),onSettings:callback=>ipcRenderer.on('draft-settings-changed',(_,settings)=>callback(settings)),
 pathForFile:file=>webUtils.getPathForFile(file)
});
