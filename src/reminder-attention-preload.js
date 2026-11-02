'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('attentionAPI',Object.freeze({get:()=>ipcRenderer.invoke('reminder-attention-get'),complete:id=>ipcRenderer.invoke('reminder-attention-ack',id),snooze:id=>ipcRenderer.invoke('reminder-attention-snooze',id),dismiss:()=>ipcRenderer.invoke('reminder-attention-dismiss'),onChanged:callback=>{const listener=(_,value)=>callback(value);ipcRenderer.on('reminder-attention-changed',listener);return ()=>ipcRenderer.removeListener('reminder-attention-changed',listener);}}));
contextBridge.exposeInMainWorld('diagnosticsAPI',Object.freeze({report:entry=>ipcRenderer.invoke('diagnostics-report',entry)}));
