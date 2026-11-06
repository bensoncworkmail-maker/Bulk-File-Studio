'use strict';
const crypto=require('node:crypto'),M=require('./productivity-model');
function csv(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>2*1024*1024)throw new Error('CSV 最多 2 MB');text=text.replace(/^\uFEFF/,'');const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';let rows=[],row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}else if(c==='"'&&!cell&&!closed)quoted=true;else if(c===delimiter){row.push(cell);cell='';closed=false;}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;}else{if(closed)throw new Error('CSV 引號後應接分隔符號或換行');cell+=c;}if(rows.length>501||cell.length>20000||row.length>20)throw new Error('最多 500 筆，每格最多 20,000 字');}
 if(quoted)throw new Error('CSV 引號未結束');if(cell||row.length||closed){row.push(cell);rows.push(row);}return rows;
}
function preview(rows,existing){
 if(Buffer.byteLength(JSON.stringify(rows)||'')>2*1024*1024)throw new Error('匯入內容最多 2 MB');
 if(!Array.isArray(rows)||rows.length>501||rows.some(row=>!Array.isArray(row)||row.length>20))throw new Error('最多 500 筆、20 欄');const headers=(rows[0]||[]).map(value=>String(value??'').trim().toLowerCase()),column=names=>headers.findIndex(value=>names.includes(value)),name=column(['name','名稱','標題']),category=column(['category','分類','類型']),body=column(['body','text','content','文字內容','內容','文字']);if(name<0||body<0)throw new Error('第一列須含「名稱／name」與「文字內容／body」，分類／category 為選填');
 const key=item=>JSON.stringify([item.name,item.category,item.body]),seen=new Set(existing.map(key)),items=[],errors=[];let skipped=0;
 rows.slice(1).forEach((row,index)=>{if(row.every(value=>value===null||value===undefined||String(value).trim()===''))return;try{const item=M.entry('snippets',{id:crypto.randomUUID(),name:String(row[name]??''),category:category<0?'':String(row[category]??''),body:String(row[body]??'')});if(seen.has(key(item))){skipped++;return;}seen.add(key(item));items.push(item);}catch(error){errors.push({row:index+2,error:error.message});}});if(existing.length+items.length>500)errors.push({row:0,error:'匯入後超過 500 個文字片段'});return {items,errors,skipped};
}
module.exports={csv,preview};
