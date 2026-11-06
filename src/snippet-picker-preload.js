'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('snippetPicker',Object.freeze({get:()=>ipcRenderer.invoke('snippet-picker-get'),select:id=>ipcRenderer.invoke('snippet-picker-select',id),close:()=>ipcRenderer.invoke('snippet-picker-close'),groups:changes=>ipcRenderer.invoke('snippet-picker-groups',changes)}));
