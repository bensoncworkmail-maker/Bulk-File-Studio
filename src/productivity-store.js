'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),M=require('./productivity-model'),{assertLocalPath}=require('./offline-policy'),{readStableBytes}=require('./bounded-file-read');
function writeJSON(filename,value){assertLocalPath(filename);fs.mkdirSync(path.dirname(filename),{recursive:true});const temp=filename+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value),{flag:'wx',mode:0o600});fs.renameSync(temp,filename);}finally{try{fs.unlinkSync(temp);}catch(error){if(error.code!=='ENOENT')throw error;}}}
class ProductivityStore{
 constructor(filename){assertLocalPath(filename);this.filename=filename;this.reload();}
 reload(){try{this.data=M.normalize(JSON.parse(readStableBytes(this.filename,{maxBytes:12*1024*1024,label:'工具設定'})));}catch(error){if(error.code!=='ENOENT')throw error;this.data={version:1,rules:[],worksets:[],snippets:[]};}}
 get(){return structuredClone(this.data);}
 save(kind,input){if(!['rules','worksets','snippets'].includes(kind))throw new Error('工具類型無效');const next=this.get();if(input.id&&!next[kind].some(value=>value.id===input.id))throw new Error('工具已移除');const item=M.entry(kind,{...input,id:input.id||crypto.randomUUID()});if(kind==='rules'&&item.folder)assertLocalPath(item.folder);next[kind]=[...next[kind].filter(value=>value.id!==item.id),item];this.replace(next);return this.get();}
 remove(kind,id){if(!['rules','worksets','snippets'].includes(kind)||!M.ID.test(id))throw new Error('工具類型或識別碼無效');const next=this.get();next[kind]=next[kind].filter(value=>value.id!==id);this.replace(next);return this.get();}
 replace(value){const next=M.normalize(value);if(Buffer.byteLength(JSON.stringify(next))>12*1024*1024)throw new Error('工具設定超過 12 MB');writeJSON(this.filename,next);this.data=next;}
}
module.exports={ProductivityStore,writeJSON};
