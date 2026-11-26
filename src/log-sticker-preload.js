'use strict';

const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('logSticker',Object.freeze({
 get:()=>ipcRenderer.invoke('log-sticker-get'),
 toggle:()=>ipcRenderer.invoke('log-sticker-toggle'),
 close:()=>ipcRenderer.invoke('log-sticker-close'),
 visit:()=>ipcRenderer.invoke('log-sticker-visit'),
 locate:()=>ipcRenderer.invoke('log-sticker-locate'),
 openLink:(index,version)=>ipcRenderer.invoke('log-sticker-open-link',index,version),
 onChanged:callback=>ipcRenderer.on('log-sticker-changed',(_,data)=>callback(data)),
 onError:callback=>ipcRenderer.on('log-sticker-error',(_,message)=>callback(message))
}));
