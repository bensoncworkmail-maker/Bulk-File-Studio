'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('captureAPI',Object.freeze({get:()=>ipcRenderer.invoke('floating-capture-get'),preview:input=>ipcRenderer.invoke('floating-capture-preview',input),save:input=>ipcRenderer.invoke('floating-capture-save',input),choose:kind=>ipcRenderer.invoke('floating-capture-choose',kind),clearAttachments:()=>ipcRenderer.invoke('floating-capture-clear'),commit:token=>ipcRenderer.invoke('floating-capture-commit',token),close:()=>ipcRenderer.invoke('floating-capture-close')}));

contextBridge.exposeInMainWorld('diagnosticsAPI',Object.freeze({report:entry=>ipcRenderer.invoke('diagnostics-report',entry)}));
