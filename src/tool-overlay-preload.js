'use strict';
const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('toolOverlayAPI',Object.freeze({
 get:()=>ipcRenderer.invoke('tool-overlay-get'),
 data:(kind,filters)=>ipcRenderer.invoke('tool-overlay-data',kind,filters),
 action:(kind,action,value,customer)=>ipcRenderer.invoke('tool-overlay-action',kind,action,value,customer),
 switchTab:kind=>ipcRenderer.invoke('tool-overlay-switch',kind),
 close:()=>ipcRenderer.invoke('tool-overlay-close'),
 onRefresh:callback=>ipcRenderer.on('tool-overlay-refresh',(_,config)=>callback(config))
}));
