'use strict';

const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('logSticker',Object.freeze({
 get:()=>ipcRenderer.invoke('log-sticker-get'),
 toggle:()=>ipcRenderer.invoke('log-sticker-toggle'),
 close:()=>ipcRenderer.invoke('log-sticker-close'),
 visit:()=>ipcRenderer.invoke('log-sticker-visit'),
 onChanged:callback=>ipcRenderer.on('log-sticker-changed',(_,data)=>callback(data)),
 onError:callback=>ipcRenderer.on('log-sticker-error',(_,message)=>callback(message))
}));
