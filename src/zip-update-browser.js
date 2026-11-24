'use strict';
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),{randomUUID}=require('node:crypto'),{assertLocalPath}=require('./offline-policy');
const inside=(root,file)=>{const rel=path.relative(root,file);return rel===''||rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
class FolderBrowser{
 constructor(kind,{forbiddenRoot}={}){this.kind=kind;this.forbiddenRoot=forbiddenRoot;this.root='';this.folder='';this.rows=[];this.entries=new Map();this.version=0;}
 clear(){this.root='';this.folder='';this.rows=[];this.entries.clear();this.truncated=false;this.version++;}
 check(folder){assertLocalPath(folder);if(this.kind==='target'&&this.forbiddenRoot&&inside(this.forbiddenRoot,folder))throw Error('請選擇應用程式資料以外的目標');if(!fs.statSync(folder).isDirectory())throw Error('資料夾不存在');}
 select(folder,{keepRoot=false}={}){this.check(folder);folder=path.resolve(folder);if(!keepRoot||!this.root||!inside(this.root,folder))this.root=folder;this.folder=folder;this.rows=[];this.entries.clear();this.version++;}
 parent(){if(!this.folder)throw Error('請先選擇資料夾');return this.folder===this.root?this.root:path.dirname(this.folder);}
 resolve(id,kind){const entry=this.entries.get(id);if(!entry||entry.kind!==kind||!inside(this.root,entry.path)||path.dirname(entry.path)!==this.folder)throw Error('清單已變更，請重新整理後選擇');assertLocalPath(entry.path);const stat=fs.lstatSync(entry.path);if((kind==='folder'?!stat.isDirectory():!stat.isFile())||kind==='zip'&&!/\.zip$/i.test(entry.path))throw Error('項目已變更或不可使用');return entry.path;}
 async read(){if(!this.folder)return this.snapshot();this.check(this.folder);const version=++this.version,folder=this.folder,entries=new Map(),rows=[];let scanned=0,truncated=false;const dir=await fsp.opendir(folder);
  for await(const item of dir){scanned++;if(scanned>10000||rows.length>=1000){truncated=true;break;}if(this.kind==='source'&&!item.isDirectory()&&!/\.zip$/i.test(item.name))continue;const file=path.join(folder,item.name);let kind=item.isDirectory()?'folder':this.kind==='source'?'zip':'file',size=0,modified='',error='';try{assertLocalPath(file);if(item.isSymbolicLink())throw Error('連結不可使用');if(this.kind==='target'&&this.forbiddenRoot&&inside(this.forbiddenRoot,file))throw Error('應用程式資料不可作為目標');const stat=await fsp.lstat(file);if(!stat.isDirectory()&&!stat.isFile())throw Error('不支援此項目');size=stat.isFile()?stat.size:0;modified=stat.mtime.toISOString();}catch(e){kind='blocked';error=e.message;}const id=randomUUID();entries.set(id,{path:file,kind});rows.push({id,name:item.name,kind,size,modified,error});}
  if(version!==this.version||folder!==this.folder)throw Error('瀏覽位置已更新，請重新整理');rows.sort((a,b)=>(a.kind==='folder'?0:1)-(b.kind==='folder'?0:1)||a.name.localeCompare(b.name,'zh-Hant',{numeric:true}));this.rows=rows;this.entries=entries;this.truncated=truncated;return this.snapshot();
 }
 snapshot(){return {root:this.root,folder:this.folder,canUp:Boolean(this.folder&&this.folder!==this.root),rows:this.rows.map(r=>({...r})),truncated:Boolean(this.truncated)};}
}
module.exports={FolderBrowser};
