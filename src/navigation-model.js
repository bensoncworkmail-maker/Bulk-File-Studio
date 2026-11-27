'use strict';
(()=>{
 const PAGES=Object.freeze({home:'首頁',notes:'資料工作區',favorites:'我的收藏',tracking:'Everything 追蹤',planning:'日曆／看板',snippets:'常用文字片段',zip:'ZIP 更新助手',rename:'檔案工具',search:'全域搜尋',logs:'查看紀錄',productivity:'工具箱'});
 const ORDER=Object.freeze(Object.keys(PAGES)),COLLAPSED=Object.freeze(['zip','rename','search','logs','productivity']);
 function normalize(value){const object=value&&typeof value==='object'&&!Array.isArray(value)?value:{},known=key=>Object.hasOwn(PAGES,key),order=Array.isArray(object.order)?object.order.filter(known):[];return {order:[...new Set([...order,...ORDER])],collapsed:Array.isArray(object.collapsed)?[...new Set(object.collapsed.filter(known))]:[...COLLAPSED]};}
 const api={PAGES,ORDER,COLLAPSED,normalize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.studioNavigationModel=api;
})();
