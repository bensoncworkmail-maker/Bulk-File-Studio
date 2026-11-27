'use strict';
const itemId='bulk-file-studio-save-snippet';
const hostFailures=new Set(['invalid-selection','transfer-failed','launch-failed','window-not-opened']);
chrome.runtime.onInstalled.addListener(()=>{
 chrome.contextMenus.create({id:itemId,title:'加入 Bulk File Studio 常用文字片段…',contexts:['selection']});
});
chrome.contextMenus.onClicked.addListener((info)=>{
 if(info.menuItemId!==itemId)return;
 const text=info.selectionText;
 const showConnectionHelp=reason=>chrome.tabs.create({url:chrome.runtime.getURL('connection.html')+'?reason='+reason});
 if(typeof text!=='string'||!text.trim()||text.length>20000||text.includes('\0')){
  void showConnectionHelp('invalid-selection');
  return;
 }
 chrome.runtime.sendNativeMessage('com.bulkfilestudio.snippets',{action:'capture-snippet',text},response=>{
  const error=chrome.runtime.lastError;
  if(error)void showConnectionHelp('host-unavailable');
  else if(!response?.ok)void showConnectionHelp(hostFailures.has(response?.reason)?response.reason:'host-unavailable');
 });
});
