'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,callback)=>{const listener=(_,value)=>callback(value);ipcRenderer.on(channel,listener);return ()=>ipcRenderer.removeListener(channel,listener);};
contextBridge.exposeInMainWorld('floatingSearchAPI',Object.freeze({get:()=>ipcRenderer.invoke('floating-search-get'),search:(query,options)=>ipcRenderer.invoke('floating-search-run',query,options),action:(token,section,index,action)=>ipcRenderer.invoke('floating-search-action',token,section,index,action),close:()=>ipcRenderer.invoke('floating-search-close'),onQuery:callback=>listen('floating-search-query',callback),onChanged:callback=>listen('floating-search-invalidated',callback),onTheme:callback=>listen('floating-search-theme',callback)}));
contextBridge.exposeInMainWorld('diagnosticsAPI',Object.freeze({report:entry=>ipcRenderer.invoke('diagnostics-report',entry)}));
