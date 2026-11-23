'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {pngBytes}=require('./draft-notes'),{assertLocalPath}=require('./offline-policy'),{readStableBytes}=require('./bounded-file-read');
const PREFIX='data:image/png;base64,',MAX_IMAGES=8,MAX_TOTAL=20*1024*1024;
class WorkspaceImages{
 constructor(root,nativeImage){this.root=root;this.nativeImage=nativeImage;}
 prepare(input){const bytes=pngBytes(input),image=this.nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('無法讀取 PNG 圖片');return PREFIX+pngBytes(image.toPNG()).toString('base64');}
 bytes(data){if(typeof data!=='string'||!data.startsWith(PREFIX)||data.length>7*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.slice(PREFIX.length)))throw Error('貼上圖片格式無效');return pngBytes(Buffer.from(data.slice(PREFIX.length),'base64'));}
 withImages(input,save){const images=input?.pastedImages??[];if(!Array.isArray(images)||images.length>MAX_IMAGES)throw Error('每次最多貼上 8 張圖片');if(!images.length)return save(input);
  const buffers=images.map(data=>this.bytes(this.prepare(this.bytes(data))));if(buffers.reduce((sum,b)=>sum+b.length,0)>MAX_TOTAL)throw Error('本次貼上圖片合計超過 20 MB');if(!Array.isArray(input.directPaths)||input.directPaths.length+buffers.length>100)throw Error('每筆最多 100 個位置與圖片');
  const created=[],cleanup=error=>{for(const filename of created)fs.rmSync(filename,{force:true});throw error;};try{assertLocalPath(this.root);fs.mkdirSync(this.root,{recursive:true});for(const bytes of buffers){const filename=assertLocalPath(path.join(this.root,randomUUID()+'.png'));fs.writeFileSync(filename,bytes,{flag:'wx',mode:0o600});created.push(filename);}const result=save({...input,pastedImages:undefined,directPaths:[...input.directPaths,...created]},created);return result&&typeof result.then==='function'?Promise.resolve(result).catch(cleanup):result;}catch(error){return cleanup(error);}
 }
 read(record,index){if(!Number.isSafeInteger(index)||index<0)throw Error('圖片連結無效');const link=record?.fileLinks?.[index];if(link?.type!=='file'||!/[.]png$/i.test(link.path))throw Error('圖片連結不存在');assertLocalPath(link.path);return this.prepare(readStableBytes(link.path,{maxBytes:5*1024*1024,label:'工作區圖片'}));}
}
module.exports={WorkspaceImages};
