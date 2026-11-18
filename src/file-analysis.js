'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{assertLocalPath}=require('./offline-policy');
const signature=stat=>['dev','ino','birthtimeNs','size','mtimeNs'].map(key=>String(stat[key])).join(':');
async function hashFile(filename,checkpoint=()=>{}){
 assertLocalPath(filename);const before=await fs.promises.lstat(filename,{bigint:true});if(!before.isFile()||before.isSymbolicLink())throw Error('只分析一般本機檔案');
 const handle=await fs.promises.open(filename,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
 try{if(signature(await handle.stat({bigint:true}))!==signature(before))throw Error('檔案已被替換');const hash=crypto.createHash('sha256'),buffer=Buffer.alloc(1024*1024);let position=0;for(;;){checkpoint();const {bytesRead}=await handle.read(buffer,0,buffer.length,position);if(!bytesRead)break;hash.update(buffer.subarray(0,bytesRead));position+=bytesRead;}if(signature(await fs.promises.lstat(filename,{bigint:true}))!==signature(before)||signature(await handle.stat({bigint:true}))!==signature(before))throw Error('分析期間檔案已變更');return {path:filename,size:Number(before.size),identity:signature(before),sha256:hash.digest('hex')};}finally{await handle.close();}
}
async function filesUnder(inputs,checkpoint=()=>{}){
 if(!Array.isArray(inputs)||!inputs.length||inputs.length>1000)throw Error('請選取 1–1000 個本機來源');const rows=[],seen=new Set();
 async function walk(filename,depth=0){checkpoint();assertLocalPath(filename);if(depth>30)throw Error('資料夾層次過深');const canonical=process.platform==='win32'?filename.toLowerCase():filename;if(seen.has(canonical))return;seen.add(canonical);if(seen.size>10000)throw Error('一次最多巡覽 10,000 個項目');const stat=await fs.promises.lstat(filename);if(stat.isSymbolicLink())throw Error('不分析符號連結');if(stat.isDirectory()){const dir=await fs.promises.opendir(filename);for await(const entry of dir)await walk(path.join(filename,entry.name),depth+1);}else if(stat.isFile()){if(rows.length>=5000)throw Error('一次最多分析 5,000 個檔案，請縮小來源');rows.push({path:filename,size:stat.size,modifiedMs:stat.mtimeMs});}}
 for(const value of inputs)await walk(value);return rows;
}
async function duplicates(inputs,checkpoint=()=>{},progress=()=>{}){
 const files=await filesUnder(inputs,checkpoint),sizes=new Map(),issues=[];for(const file of files){if(!sizes.has(file.size))sizes.set(file.size,[]);sizes.get(file.size).push(file);}
 const groups=new Map();let processed=0;const candidates=[...sizes.values()].filter(rows=>rows.length>1).flat();
 for(const file of candidates){checkpoint();progress({done:processed++,total:candidates.length,name:path.basename(file.path)});try{const row=await hashFile(file.path,checkpoint),key=row.size+':'+row.sha256;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}catch(error){checkpoint();issues.push({path:file.path,error:error.message});}}
 return {scanned:files.length,groups:[...groups.values()].filter(rows=>rows.length>1).map(rows=>({sha256:rows[0].sha256,size:rows[0].size,rows})),issues};
}
function diffLines(left,right){
 const a=left.replace(/\r\n/g,'\n').split('\n'),b=right.replace(/\r\n/g,'\n').split('\n');if(a.length>2000||b.length>2000)throw Error('文字比較每邊最多 2,000 行，請縮小檔案');
 const width=b.length+1,matrix=new Uint16Array((a.length+1)*width);for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)matrix[i*width+j]=a[i]===b[j]?matrix[(i+1)*width+j+1]+1:Math.max(matrix[(i+1)*width+j],matrix[i*width+j+1]);
 const rows=[];let i=0,j=0;while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j])rows.push({kind:'same',left:a[i++],right:b[j++]});else if(j<b.length&&(i===a.length||matrix[i*width+j+1]>=matrix[(i+1)*width+j]))rows.push({kind:'added',left:'',right:b[j++]});else rows.push({kind:'removed',left:a[i++],right:''});}return rows;
}
async function compare(inputs,checkpoint=()=>{}){
 if(!Array.isArray(inputs)||inputs.length!==2)throw Error('請選取兩個檔案或兩個資料夾');const stats=await Promise.all(inputs.map(async filename=>{assertLocalPath(filename);return fs.promises.lstat(filename);}));
 if(stats.every(stat=>stat.isDirectory()&&!stat.isSymbolicLink())){
  const lists=await Promise.all(inputs.map(value=>filesUnder([value],checkpoint))),maps=lists.map((list,i)=>new Map(list.map(item=>[path.relative(inputs[i],item.path),item]))),rows=[];
  for(const name of new Set([...maps[0].keys(),...maps[1].keys()])){checkpoint();const left=maps[0].get(name),right=maps[1].get(name);let kind=!left?'right-only':!right?'left-only':'same';if(left&&right)kind=left.size!==right.size?'changed':(await hashFile(left.path,checkpoint)).sha256===(await hashFile(right.path,checkpoint)).sha256?'same':'changed';rows.push({name,kind,left:left?.size??null,right:right?.size??null});}
  return {type:'folders',rows:rows.sort((a,b)=>a.name.localeCompare(b.name)),left:inputs[0],right:inputs[1]};
 }
 if(!stats.every(stat=>stat.isFile()&&!stat.isSymbolicLink()))throw Error('請選取同類型的一般來源');const {readSelectedPreview}=require('./document-preview'),data=await Promise.all(inputs.map(value=>readSelectedPreview(value)));if(data.some(item=>item.type!=='text'))throw Error('文字比較支援 UTF-8／UTF-16 文字檔');return {type:'text',rows:diffLines(data[0].text,data[1].text),left:inputs[0],right:inputs[1]};
}
module.exports={hashFile,filesUnder,duplicates,compare,diffLines,signature};
