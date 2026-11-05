'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('draft-'+name,...args);
contextBridge.exposeInMainWorld('draftAPI',{
 data:()=>invoke('data'),
 read:id=>invoke('read',id),
 newDraft:()=>invoke('new'),
 save:(id,version,text)=>invoke('save',id,version,text),
 attach:(id,version,paths)=>invoke('attach',id,version,paths),
 paste:(id,version,bytes)=>invoke('paste',id,version,bytes),
 image:(id,index)=>invoke('image',id,index),
 remove:(id,version,index)=>invoke('remove',id,version,index),
 deleteDraft:(id,version)=>invoke('delete',id,version),
 masters:sheetId=>invoke('masters',sheetId),
 send:(id,version,sheetId,masterId,withReminder)=>invoke('send',id,version,sheetId,masterId,withReminder),
 close:()=>invoke('close'),
 cancelClose:()=>invoke('cancel-close'),
 onClose:callback=>ipcRenderer.on('draft-close-request',()=>callback()),
 pathForFile:file=>webUtils.getPathForFile(file)
});
