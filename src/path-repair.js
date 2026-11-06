'use strict';
const path=require('node:path'),crypto=require('node:crypto'),{inspectPath}=require('./favorites-store'),M=require('./notes-model');
const {locationPath}=require('./notes-location-links'),{withIntranetPaths}=require('./intranet-path');
const windows=value=>typeof value==='string'&&/^(?:[a-z]:[\\/]|[\\/]{2})/i.test(value);
const flavor=value=>windows(value)?path.win32:path;
const key=value=>windows(value)?path.win32.normalize(value).toLowerCase():path.normalize(value);
function roots(from,to){from=locationPath(from);to=locationPath(to);if(windows(from)!==windows(to))throw new Error('新舊位置必須使用相同系統的完整路徑');if(key(from)===key(to))throw new Error('新舊根路徑相同');return {from,to};}
function translate(value,from,to){
 if(typeof value!=='string'||windows(value)!==windows(from))return null;
 const p=flavor(from);if(!p.isAbsolute(value))return null;
 const relative=p.relative(p.normalize(from),p.normalize(value));
 if(relative==='..'||relative.startsWith('..'+p.sep)||p.isAbsolute(relative))return null;
 return p.resolve(to,relative);
}
function planRepair(favorites,document,from,to,inspect=inspectPath){
 ({from,to}=roots(from,to));if(inspect(to).type!=='folder')throw new Error('新根路徑必須是資料夾');const rows=[];
 function add(scope,id,index,value,type,label,fieldId){
  const destination=translate(value,from,to);if(destination===null)return;
  const row={key:scope+':'+id+':'+(fieldId||index),scope,id,index,fieldId,source:value,destination,type,label};
  try{locationPath(destination);const target=inspect(destination);if(type&&target.type!==type)throw new Error('新位置類型與原連結不同');row.target=target;row.ready=true;}catch(error){row.ready=false;row.error=error.message;}
  rows.push(row);
 }
 for(const item of favorites.items)add('favorite',item.id,0,item.path,item.type,item.label||flavor(item.path).basename(item.path));
 for(const record of document.records){
  if(!M.live(document,record))continue;
  record.fileLinks.forEach((link,index)=>add('link',record.id,index,link.path,link.type,record.title));
  for(const field of document.sheets.find(sheet=>sheet.id===record.sheetId).fields.filter(field=>['text','longtext'].includes(field.type))){const value=record.values[field.id];if(typeof value==='string'&&!/[\r\n]/.test(value))add('field',record.id,0,value,null,record.title+' ／ '+field.label,field.id);}
 }
 return rows;
}
class PathRepair{
 constructor(profile){this.profile=profile;this.pending=null;this.request=0;}
 preview(from,to){
  this.pending=null;const request=++this.request,root=roots(from,to);
  return withIntranetPaths([root.to],()=>{
   if(request!==this.request)throw new Error('路徑修復來源已變更，請重新預覽');
   const state=this.profile.notes().get(),rows=planRepair(this.profile.favorites.read(),state.document,root.from,root.to),token=crypto.randomUUID();
   this.pending={token,rows,signature:this.profile.signature(),expires:this.profile.now()+600000};return {token,rows};
  });
 }
 apply(token,keys,ui){
  const pending=this.pending;this.pending=null;
  if(!pending||pending.token!==token||pending.expires<this.profile.now()||pending.signature!==this.profile.signature())throw new Error('修復預覽過期或資料已變更，請重新預覽');
  if(!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length)throw new Error('請選取修復項目');
  const rows=pending.rows.filter(row=>keys.includes(row.key));if(rows.length!==keys.length||rows.some(row=>!row.ready))throw new Error('選取的修復項目無效');
  return withIntranetPaths(rows.map(row=>row.destination),()=>{
   if(pending.expires<this.profile.now()||pending.signature!==this.profile.signature())throw new Error('修復預覽過期或資料已變更，請重新預覽');
   for(const row of rows){const actual=inspectPath(row.destination);if(JSON.stringify(actual)!==JSON.stringify(row.target))throw new Error('新位置已變更，請重新預覽');}
   const favorites=this.profile.favorites.read(),now=new Date(this.profile.now()).toISOString();
   for(const row of rows.filter(row=>row.scope==='favorite'))Object.assign(favorites.items.find(item=>item.id===row.id),{path:row.destination,identity:row.target.identity,updatedAt:now});
   if(new Set(favorites.items.map(item=>key(item.path))).size!==favorites.items.length)throw new Error('修復後收藏位置重複，請調整選取範圍');
   const backup=this.profile.backup(ui,'路徑修復前自動備份');
   const result=this.profile.transaction(doc=>{
    const changed=new Set();
    for(const row of rows.filter(row=>row.scope!=='favorite')){const record=doc.records.find(record=>record.id===row.id);if(row.scope==='link')record.fileLinks[row.index].path=row.destination;else record.values[row.fieldId]=row.destination;changed.add(record);}
    for(const record of changed){record.updatedAt=now;record.version++;}
    this.profile.favorites.write(favorites);return {updated:rows.length};
   });
   return {updated:rows.length,revision:result.revision,backup};
  });
 }
}
module.exports={PathRepair,planRepair,translate};
