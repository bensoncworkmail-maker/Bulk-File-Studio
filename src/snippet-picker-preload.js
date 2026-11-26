'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('snippetPicker',Object.freeze({onKey:callback=>ipcRenderer.on('snippet-picker-key',(_,key)=>callback(key)),get:()=>ipcRenderer.invoke('snippet-picker-get'),select:id=>ipcRenderer.invoke('snippet-picker-select',id),close:()=>ipcRenderer.invoke('snippet-picker-close'),groups:changes=>ipcRenderer.invoke('snippet-picker-groups',changes)}));
