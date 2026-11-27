'use strict';
const messages=new Map([
 ['invalid-selection','請選取 1 至 20,000 字元的非空白文字。'],
 ['host-unavailable','瀏覽器無法連線至本機橋接程式。'],
 ['transfer-failed','橋接程式無法在本機建立傳送請求。'],
 ['launch-failed','橋接程式未能啟動 Bulk File Studio。'],
 ['window-not-opened','已請求開啟 Bulk File Studio，等待視窗顯示逾時。']
]);
const message=messages.get(new URLSearchParams(location.search).get('reason'));
if(message)document.getElementById('reason').textContent=message;
