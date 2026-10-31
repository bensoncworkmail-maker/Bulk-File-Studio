'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('captureAPI',Object.freeze({get:()=>ipcRenderer.invoke('floating-capture-get'),preview:input=>ipcRenderer.invoke('floating-capture-preview',input),commit:token=>ipcRenderer.invoke('floating-capture-commit',token),close:()=>ipcRenderer.invoke('floating-capture-close')}));
