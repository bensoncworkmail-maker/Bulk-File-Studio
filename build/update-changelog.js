'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {version}=require('../package.json');
const history=require('../src/release-history');

if(history[0]?.version!==version)throw new Error('最新更新紀錄必須與 package.json 版本一致');
const parts=value=>value.split('.').map(Number);
const compare=(a,b)=>parts(a).reduce((order,n,i)=>order||n-parts(b)[i],0);
for(const [index,item] of history.entries()){
 const date=new Date(item.date+'T00:00:00Z');
 if(!/^\d+\.\d+\.\d+$/.test(item.version)||!Number.isFinite(date.getTime())||
  date.toISOString().slice(0,10)!==item.date||!item.text.trim()||
  index>0&&compare(history[index-1].version,item.version)<=0){
  throw new Error('更新紀錄的版本、順序、日期或內容無效：'+item.version);
 }
}

const lines=[
 '# Bulk File Studio 更新紀錄',
 '',
 '[回到 README](README.md) · [舊版詳細說明存檔](https://github.com/bensoncworkmail-maker/Bulk-File-Studio/blob/0d18b9c07a7d3f18e02eee3f7346a394e76cad1c/README.md)',
 '',
 '日期為版本變更記錄於原始碼的日期。應用程式內可從「資訊 → 更新紀錄」查閱。',
 '',
 '<!-- 由 npm run changelog 產生。請更新 src/release-history.js。 -->',
 ''
];
for(const {version,date,text} of history)lines.push('## v'+version,'',date,'',text,'');
const content=lines.join('\n');
const filename=path.join(__dirname,'..','CHANGELOG.md');
if(process.argv.includes('--check')){
 // Git may check text out with CRLF on Windows.
 if(fs.readFileSync(filename,'utf8').replace(/\r\n/g,'\n')!==content){
  throw new Error('CHANGELOG.md 尚未同步，請執行 npm run changelog');
 }
}else fs.writeFileSync(filename,content);
