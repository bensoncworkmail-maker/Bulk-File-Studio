'use strict';
const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('toolOverlayAPI',Object.freeze({
 control:(action,value)=>ipcRenderer.invoke('tool-overlay-control',action,value),
 workspace:(action,value)=>ipcRenderer.invoke('floating-workspace',action,value),
 toolData:(kind,filters)=>ipcRenderer.invoke('floating-tool-data',kind,filters),toolAction:(kind,action,value)=>ipcRenderer.invoke('floating-tool-action',kind,action,value),
 get:()=>ipcRenderer.invoke('tool-overlay-get'),
 data:(kind,filters)=>ipcRenderer.invoke('tool-overlay-data',kind,filters),
 action:(kind,action,value,customer)=>ipcRenderer.invoke('tool-overlay-action',kind,action,value,customer),
 saveLogFilters:(context,filters)=>ipcRenderer.invoke('tool-overlay-log-filters',context,filters),
 logRecord:(context,action,id,pinned)=>ipcRenderer.invoke('tool-overlay-log-record',context,action,id,pinned),
 pinLogWindow:(context,pinned)=>ipcRenderer.invoke('tool-overlay-log-window',context,pinned),
 switchTab:kind=>ipcRenderer.invoke('tool-overlay-switch',kind),
 close:()=>ipcRenderer.invoke('tool-overlay-close'),
 stickers:action=>ipcRenderer.invoke('tool-overlay-sticker-control',action),
 onRefresh:callback=>ipcRenderer.on('tool-overlay-refresh',(_,config)=>callback(config))
}));
