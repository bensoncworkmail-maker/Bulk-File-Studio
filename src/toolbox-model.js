'use strict';
(() => {
 const primary=Object.freeze([
  {id:'inbox',title:'收件匣',hint:'先記下，稍後整理',workflow:'inbox',steps:['記下文字','加入附件（選填）','存成草稿或轉入紀錄']},
  {id:'contexts',title:'情境包',hint:'集中客戶與專案資源',workflow:'contexts',steps:['選主紀錄','加入資源（選填）','儲存並啟用']},
  {id:'parameters',title:'參數範本',hint:'填寫、預覽與複製文字',workflow:'snippets',steps:['選文字範本','填寫參數','預覽後複製']},
  {id:'tracking',title:'追蹤變更',hint:'查看文件清單的變化',workflow:'tracking',steps:['選追蹤搜尋','檢查變更','核對後標示已讀']},
  {id:'ocr',title:'離線 OCR',hint:'圖片文字轉成草稿',workflow:'ocr',steps:['選一張圖片','辨識並校正','存入收件匣']},
  {id:'automations',title:'自動流程',hint:'先試跑，再啟用規則',workflow:'automations',steps:['建立規則','手動預覽與試跑','需要時啟用事件']},
  {id:'backup',title:'備份',hint:'保存與還原資料',panel:'backup',steps:['建立備份','試還原核對','需要時預覽並還原']}
 ].map(Object.freeze));
 const extra=Object.freeze([
  {id:'repair',title:'批次修復路徑',panel:'repair'},
  {id:'rules',title:'檔案整理規則',panel:'rules'},
  {id:'preview',title:'文件預覽',panel:'preview'},
  {id:'operations',title:'作業中心',workflow:'operations'},
  {id:'duplicates',title:'重複檔分析',workflow:'duplicates'},
  {id:'compare',title:'檔案比較',workflow:'compare'},
  {id:'formulas',title:'主表彙總',workflow:'formulas'}
 ].map(Object.freeze));
 const secondary=Object.freeze([
  {id:'worksets',title:'工作集管理',panel:'worksets',parent:'contexts'},
  {id:'snippets',title:'文字範本管理',panel:'snippets',parent:'parameters'},
  {id:'conditions',title:'條件與衝突',workflow:'rules',parent:'rules'}
 ].map(Object.freeze));
 const routes=Object.freeze(Object.fromEntries([...primary,...extra,...secondary].map(item=>[item.id,item])));
 const workflowRoutes=Object.freeze({actions:'inbox',inbox:'inbox',contexts:'contexts',snippets:'parameters',tracking:'tracking',ocr:'ocr',automations:'automations',backup:'backup',folders:'operations',rules:'conditions',formulas:'formulas',operations:'operations',duplicates:'duplicates',compare:'compare'});
 const tools=Object.freeze(Object.fromEntries(Object.values(routes).map(item=>[item.id,item.title])));
 const get=id=>routes[id]||null,fromWorkflow=id=>workflowRoutes[id]||'inbox',parent=id=>get(id)?.parent||id;
 const api=Object.freeze({primary,extra,secondary,routes,workflowRoutes,tools,get,fromWorkflow,parent});if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.toolboxModel=api;
})();
