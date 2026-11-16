'use strict';
(() => {
 // User tasks and their canonical entry points; shared by the homepage and its tests.
 const entries=Object.freeze([
  {group:'檔案與收藏',title:'檔案／資料夾收藏',description:'位置收藏、標籤、批次開啟、複製路徑、圖示／清單、遺失位置',page:'favorites',favorite:'files'},
  {group:'檔案與收藏',title:'工作區紀錄與表格收藏',description:'單筆／整表同步收藏、標籤繼承、紀錄詳情、釘選',page:'favorites',favorite:'workspace'},
  {group:'檔案與收藏',title:'Everything 追蹤',description:'本機索引、搜尋預設、自訂副檔名、日期／大小、排序、右鍵選單',tracking:true},
  {group:'檔案與收藏',title:'檔案工具',description:'批次重新命名、規則、預覽、搬移、復原、排序、來源清單',page:'rename'},
  {group:'資料工作區',title:'主表、明細與紀錄',description:'主從關聯、自訂欄位、清單／卡片／表格、範本、批次建立與編輯、回收筒',page:'notes'},
  {group:'資料工作區',title:'工作區匯入與匯出',description:'JSON、Excel、表格文字、合併差異、欄位對應、資料檢查',page:'notes'},
  {group:'資料工作區',title:'共享來源與更新',description:'來源授權、發佈／接收資料包、範圍、差異合併、衝突處理',settings:'sharing'},
  {group:'搜尋與規劃',title:'全域搜尋',description:'紀錄、檔案連結、收藏、標籤、結構、儲存檢視與來源',page:'search'},
  {group:'搜尋與規劃',title:'日曆／看板',description:'日期範圍、紀錄排程、狀態分組、月曆、速覽',page:'planning'},
  {group:'搜尋與規劃',title:'查看紀錄',description:'指定表格、按主紀錄分組、日期與狀態篩選、浮動速覽',page:'logs'},
  {group:'搜尋與規劃',title:'提醒排程',description:'紀錄提醒、到期通知、延後、提醒清單',reminders:true},
  {group:'快捷與工具',title:'草稿筆記',description:'隨手記錄、自動儲存、附件、PNG 預覽、轉工作區紀錄',draft:true},
  {group:'快捷與工具',title:'常用文字片段',description:'分類、複製、匯入、立即貼上、外部分類選擇窗',tool:'snippets'},
  {group:'快捷與工具',title:'情境工作集',description:'集中開啟檔案／資料夾及連結紀錄、外部選單',tool:'worksets'},
  {group:'快捷與工具',title:'批次修復路徑',description:'前綴替換、磁碟／UNC、收藏、紀錄連結與路徑欄位、修復預覽',tool:'repair'},
  {group:'快捷與工具',title:'檔案整理規則',description:'依條件分類、整理預覽、檔案搬移',tool:'rules'},
  {group:'快捷與工具',title:'文件預覽',description:'本機文件與內容預覽',tool:'preview'},
  {group:'設定與資料',title:'備份／還原',description:'整體資料備份、設定匯入匯出、本機備份、還原與版本',tool:'backup'},
  {group:'設定與資料',title:'浮動工具與快捷動作',description:'按鈕、目標表格、Everything 追蹤、搜尋、收合列、外部選單',settings:'floating'},
  {group:'設定與資料',title:'快捷鍵與專注模式',description:'全域與視窗快捷鍵、衝突檢查、專注保留、切換狀態',settings:'shortcuts'},
  {group:'設定與資料',title:'外觀與版面',description:'主題、字級、密度、拖曳編輯、尺寸與面板',settings:'appearance'},
  {group:'設定與資料',title:'啟動與 Everything 整合',description:'啟動頁、es.exe、本機索引、啟用與停用',settings:'system'},
  {group:'設定與資料',title:'我的收藏啟動設定',description:'初始分頁、上次分頁、預設追蹤搜尋、同步與顯示偏好',settings:'favorites'},
  {group:'設定與資料',title:'資訊與更新紀錄',description:'版本、功能更新、應用程式資訊',page:'info'}
 ].map(Object.freeze));
 function search(text=''){const words=text.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return entries.filter(item=>words.every(word=>(item.group+' '+item.title+' '+item.description).toLocaleLowerCase().includes(word)));}
 const api={entries,search};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.studioFunctionDirectory=Object.freeze(api);
})();
