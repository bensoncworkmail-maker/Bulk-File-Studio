'use strict';
// Native icons are fetched only for validated snapshot entries, with bounded work.
class TrackingIcons{
 constructor(tracking,getIcon){this.tracking=tracking;this.getIcon=getIcon;this.cache=new Map();this.pending=new Map();this.queue=[];this.running=0;}
 async read(id,token,indices){
  if(!Array.isArray(indices)||!indices.length||indices.length>100)throw Error('每次最多讀取 100 個追蹤圖示');
  const {rows}=this.tracking.selection(id,token,indices),unique=[...new Set(indices)];
  return Promise.all(rows.map((row,i)=>this.icon(row).then(dataURL=>({index:unique[i],dataURL}))));
 }
 icon(row){
  // Folder rows use the bundled folder icon; avoid extensionless shell drive icons.
  if(row.type==='folder')return Promise.resolve('');
  const key=JSON.stringify([row.path,row.identity,row.modifiedMs,row.size]);
  if(this.cache.has(key))return Promise.resolve(this.cache.get(key));
  if(this.pending.has(key))return this.pending.get(key);
  if(this.queue.length>=500)return Promise.resolve('');
  const pending=new Promise(resolve=>this.queue.push({key,path:row.path,resolve}));this.pending.set(key,pending);this.pump();return pending;
 }
 pump(){
  while(this.running<4&&this.queue.length){
   const job=this.queue.shift();this.running++;
   void (async()=>{
    let dataURL='';
    try{const icon=await this.getIcon(job.path,{size:'small'});if(typeof icon==='string')dataURL=icon;else if(!icon.isEmpty())dataURL=icon.toDataURL();if(!/^data:image\/png;base64,/.test(dataURL)||dataURL.length>262144)dataURL='';}catch{/* Keep the generic file/folder icon. */}
    if(dataURL){this.cache.set(job.key,dataURL);while(this.cache.size>256)this.cache.delete(this.cache.keys().next().value);}
    this.pending.delete(job.key);this.running--;job.resolve(dataURL);this.pump();
   })();
  }
 }
}
module.exports={TrackingIcons};
