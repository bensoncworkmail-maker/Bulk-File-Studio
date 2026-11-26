'use strict';

const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('logSticker',Object.freeze({
 get:()=>ipcRenderer.invoke('log-sticker-get'),
 toggle:point=>ipcRenderer.invoke('log-sticker-toggle',point),
 drag:(phase,dx,dy)=>ipcRenderer.invoke('log-sticker-drag',phase,dx,dy),
 close:()=>ipcRenderer.invoke('log-sticker-close'),
 visit:()=>ipcRenderer.invoke('log-sticker-visit'),
 openItem:()=>ipcRenderer.invoke('log-sticker-open-item'),
 locate:()=>ipcRenderer.invoke('log-sticker-locate'),
 openLink:(index,version,action,location)=>ipcRenderer.invoke('log-sticker-open-link',index,version,action,location),
 onChanged:callback=>ipcRenderer.on('log-sticker-changed',(_,data)=>callback(data)),
 onError:callback=>ipcRenderer.on('log-sticker-error',(_,message)=>callback(message))
}));
