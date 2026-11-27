'use strict';
const itemId='bulk-file-studio-save-snippet';
chrome.runtime.onInstalled.addListener(()=>{
 chrome.contextMenus.create({id:itemId,title:'加入 Bulk File Studio 常用文字片段…',contexts:['selection']});
});
chrome.contextMenus.onClicked.addListener((info)=>{
 if(info.menuItemId!==itemId)return;
 const text=info.selectionText;
 const showConnectionHelp=()=>chrome.tabs.create({url:chrome.runtime.getURL('connection.html')});
 if(typeof text!=='string'||!text.trim()||text.length>20000||text.includes('\0')){
  void showConnectionHelp();
  return;
 }
 chrome.runtime.sendNativeMessage('com.bulkfilestudio.snippets',{action:'capture-snippet',text},response=>{
  if(chrome.runtime.lastError||!response?.ok)void showConnectionHelp();
 });
});
