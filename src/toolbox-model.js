'use strict';
(() => {
 const primary=Object.freeze([
  {id:'worksets',title:'工作集',hint:'一次開啟同一工作的資源',panel:'worksets'},
  {id:'parameters',title:'參數範本',hint:'填寫、預覽與複製文字',workflow:'snippets',steps:['選文字範本','填寫參數','預覽後複製']},
  {id:'tracking',title:'追蹤變更',hint:'查看文件清單的變化',workflow:'tracking',steps:['選追蹤搜尋','檢查變更','核對後標示已讀']},
  {id:'ocr',title:'離線 OCR',hint:'圖片文字轉成草稿',workflow:'ocr',steps:['選一張圖片','辨識並校正','存成草稿']},
  {id:'backup',title:'備份',hint:'保存與還原資料',panel:'backup',steps:['建立備份','試還原核對','需要時預覽並還原']}
 ].map(Object.freeze));
 const extra=Object.freeze([
  {id:'repair',title:'批次修復路徑',panel:'repair'},
  {id:'rules',title:'檔案整理規則',panel:'rules'},
  {id:'preview',title:'文件預覽',panel:'preview'},
 ].map(Object.freeze));
 const secondary=Object.freeze([
  {id:'conditions',title:'條件與衝突',workflow:'rules',parent:'rules'}
 ].map(Object.freeze));
 const routes=Object.freeze(Object.fromEntries([...primary,...extra,...secondary].map(item=>[item.id,item])));
 const workflowRoutes=Object.freeze({snippets:'parameters',tracking:'tracking',ocr:'ocr',backup:'backup',rules:'conditions'});
 const tools=Object.freeze(Object.fromEntries(Object.values(routes).map(item=>[item.id,item.title])));
 const get=id=>routes[id]||null,fromWorkflow=id=>workflowRoutes[id]||'parameters',parent=id=>get(id)?.parent||id;
 const api=Object.freeze({primary,extra,secondary,routes,workflowRoutes,tools,get,fromWorkflow,parent});if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.toolboxModel=api;
})();
