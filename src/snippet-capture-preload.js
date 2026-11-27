'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('snippetCaptureAPI',Object.freeze({
 get:()=>ipcRenderer.invoke('snippet-capture-get'),
 save:input=>ipcRenderer.invoke('snippet-capture-save',input),
 close:()=>ipcRenderer.invoke('snippet-capture-close')
}));
