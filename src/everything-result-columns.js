'use strict';
(() => {
 const COLUMNS=Object.freeze({
  name:{label:'檔案名稱',width:280},location:{label:'所在位置',width:400},size:{label:'大小',width:120,number:true},modified:{label:'修改日期',width:190,number:true,date:true},
  extension:{label:'副檔名',width:100},type:{label:'類型',width:100},created:{label:'建立日期',width:190,number:true,date:true},accessed:{label:'存取日期',width:190,number:true,date:true},
  attributes:{label:'屬性',width:120},recentlyChanged:{label:'最近更改日期',width:190,number:true,date:true},runCount:{label:'執行次數',width:100,number:true},dateRun:{label:'執行日期',width:190,number:true,date:true},fileList:{label:'檔案清單檔案名稱',width:320},fullPath:{label:'完整路徑',width:440}
 });
 const DEFAULT_COLUMNS=Object.freeze(['name','location','size','modified']);
 function normalizeColumns(input){if(!Array.isArray(input))return [...DEFAULT_COLUMNS];return ['name',...Object.keys(COLUMNS).filter(key=>key!=='name'&&input.includes(key))];}
 function widths(input){return Object.fromEntries(Object.entries(COLUMNS).map(([key,column])=>[key,Number.isFinite(input?.[key])?Math.round(Math.max(80,Math.min(1200,input[key]))):column.width]));}
 function location(item){const value=item.path,index=Math.max(value.lastIndexOf('\\'),value.lastIndexOf('/'));return index===0?value.slice(0,1):index===2&&value[1]===':'?value.slice(0,3):index<0?'':value.slice(0,index);}
 function value(item,key){
  if(key==='location')return location(item);if(key==='fullPath')return item.path;if(key==='type'){if(item.type==='folder')return '資料夾';const ext=value(item,'extension');return ext?ext.toUpperCase()+' 檔案':'檔案';}
  if(key==='extension'){if(item.type==='folder')return '';const name=item.name||'',index=name.lastIndexOf('.');return index>0?name.slice(index+1).toLowerCase():'';}
  if(key==='size')return item.type==='folder'?null:item.size;if(COLUMNS[key]?.date)return item[key+'Ms'];return item[key];
 }
 function display(item,key){const result=value(item,key);if(COLUMNS[key]?.date)return Number.isFinite(result)?new Date(result).toLocaleString('zh-Hant'):'—';if(key==='size')return Number.isFinite(result)?(result>=1048576?(result/1048576).toLocaleString('zh-Hant',{maximumFractionDigits:1})+' MB':result.toLocaleString('zh-Hant')+' bytes'):'—';if(COLUMNS[key]?.number)return Number.isFinite(result)?result.toLocaleString('zh-Hant'):'—';return result===undefined||result===null||result===''?'—':String(result);}
 const api={COLUMNS,DEFAULT_COLUMNS,normalizeColumns,widths,location,value,display};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.everythingResultColumns=Object.freeze(api);
})();
