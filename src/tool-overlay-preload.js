'use strict';
const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('toolOverlayAPI',Object.freeze({
 get:()=>ipcRenderer.invoke('tool-overlay-get'),
 data:filters=>ipcRenderer.invoke('tool-overlay-data',filters),
 action:(action,value,customer)=>ipcRenderer.invoke('tool-overlay-action',action,value,customer),
 close:()=>ipcRenderer.invoke('tool-overlay-close'),
 onRefresh:callback=>ipcRenderer.on('tool-overlay-refresh',(_,config)=>callback(config))
}));
