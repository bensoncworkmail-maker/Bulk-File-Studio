'use strict';

const M=require('./notes-model');
const path=require('node:path');
const web=require('./web-link-model');
const {locationPath}=require('./notes-location-links');
const {parentPath}=require('./favorites-batch');
const LIMIT=100;
const SOURCES=['workspace','tracking','favorites'];
const TAG_SCOPES=['favorites','workspace','tracking'];
const DIMENSIONS={width:[180,1200,280],height:[130,1000,245],collapsedWidth:[180,1200,280],collapsedHeight:[32,96,36]};
const FILE_HEADERS={favorite:{prefix:['none','folder','tag'],title:['label','name','path']},tracking:{prefix:['none','folder','query'],title:['name','path']}};
const DEFAULTS={background:'#ffffff',showGrip:true,size:Object.fromEntries(Object.entries(DIMENSIONS).map(([key,[,,fallback]])=>[key,fallback])),sources:Object.fromEntries(SOURCES.map(key=>[key,true])),headers:{},
 favorite:{prefix:'none',title:'label'},tracking:{prefix:'none',title:'name'}};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fieldKey=value=>typeof value==='string'&&(value==='title'||M.ID.test(value));

function settings(input,strict=false){
 const value=object(input)?input:{},result={...structuredClone(DEFAULTS)};
 const requireValid=(valid)=>{if(!valid&&strict)throw Error('桌面便條設定無效');return valid;};
 requireValid(value===input);
 if(Object.hasOwn(value,'background')&&requireValid(typeof value.background==='string'&&/^#[\da-f]{6}$/i.test(value.background)))result.background=value.background.toLowerCase();
 if(Object.hasOwn(value,'showGrip')&&requireValid(typeof value.showGrip==='boolean'))result.showGrip=value.showGrip;
 if(Object.hasOwn(value,'size')&&requireValid(object(value.size)))for(const [key,[min,max]] of Object.entries(DIMENSIONS)){
  const size=value.size[key];
  if(Object.hasOwn(value.size,key)&&requireValid(Number.isInteger(size)&&size>=min&&size<=max))result.size[key]=size;
 }
 if(Object.hasOwn(value,'sources')&&requireValid(object(value.sources)))for(const key of SOURCES){
  if(Object.hasOwn(value.sources,key)&&requireValid(typeof value.sources[key]==='boolean'))result.sources[key]=value.sources[key];
 }
 if(Object.hasOwn(value,'headers')&&requireValid(object(value.headers))){
  const entries=Object.entries(value.headers);
  requireValid(entries.length<=M.LIMITS.sheets);
  for(const [id,row] of entries.slice(0,M.LIMITS.sheets)){
   if(!requireValid(M.ID.test(id)&&object(row)&&fieldKey(row.item)&&(row.master===''||fieldKey(row.master))))continue;
   result.headers[id]={master:row.master,item:row.item};
  }
 }
 for(const [kind,options] of Object.entries(FILE_HEADERS)){
  if(!Object.hasOwn(value,kind)||!requireValid(object(value[kind])))continue;
  for(const [key,choices] of Object.entries(options)){
   if(Object.hasOwn(value[kind],key)&&requireValid(choices.includes(value[kind][key])))result[kind][key]=value[kind][key];
  }
 }
 return result;
}

function filePins(input){
 if(!Array.isArray(input)||input.length>LIMIT)throw Error('檔案便條釘選資料無效');
 const keys=new Set();
 return input.map(pin=>{
  if(!pin||!['favorite','tracking','tag'].includes(pin.kind))throw Error('檔案便條來源無效');
  const id=M.id(pin.id),key=fileKey(pin.kind,id);
  if(keys.has(key))throw Error('檔案便條釘選重複');
  keys.add(key);
  if(pin.kind==='favorite')return {kind:'favorite',id};
  if(pin.kind==='tag'){
   if(!TAG_SCOPES.includes(pin.scope))throw Error('便條標籤來源無效');
   return {kind:'tag',id,scope:pin.scope,tag:tagName(pin.tag)};
  }
  const identity={};
  for(const key of ['dev','ino','birthtimeNs']){
   if(typeof pin.identity?.[key]!=='string'||!/^-?\d{1,40}$/.test(pin.identity[key]))throw Error('追蹤檔案識別資料無效');
   identity[key]=pin.identity[key];
  }
  if(!['file','folder'].includes(pin.type))throw Error('追蹤位置類型無效');
  return {kind:'tracking',id,path:locationPath(pin.path),type:pin.type,identity,queryId:M.id(pin.queryId),queryName:M.text(pin.queryName,200,'追蹤搜尋名稱')};
 });
}

function tagName(value){
 const tag=M.text(value,32,'便條標籤',true).trim();
 if(/[\x00-\x1f]/.test(tag))throw Error('便條標籤無效');
 return tag;
}
function fileKey(kind,id){return kind+':'+id;}
function pathName(filepath){return (path.win32.isAbsolute(filepath)&&!path.posix.isAbsolute(filepath)?path.win32:path).basename(filepath)||filepath;}
function headline(prefix,title){return [prefix,title].filter(Boolean).join(' · ');}
const colorText=hex=>{
 const [r,g,b]=hex.slice(1).match(/../g).map(value=>{
  const component=parseInt(value,16)/255;
  return component<=0.04045?component/12.92:Math.pow((component+0.055)/1.055,2.4);
 });
 return r*0.2126+g*0.7152+b*0.0722>0.179?'#000000':'#ffffff';
};

function headingFields(sheet){
 return [{id:'title',label:'紀錄標題'},...sheet.fields.filter(field=>!['relation','table','checklist'].includes(field.type)).map(({id,label})=>({id,label}))];
}
function tableOptions(doc){
 const sheets=new Map(doc.sheets.filter(sheet=>!sheet.deletedAt).map(sheet=>[sheet.id,sheet]));
 return [...sheets.values()].map(sheet=>{
  const parent=M.parentField(doc,sheet),master=parent&&sheets.get(parent.targetSheetId);
  return {id:sheet.id,name:sheet.name,group:doc.areas.find(area=>area.id===sheet.areaId)?.name||'',itemFields:headingFields(sheet),masterFields:master?headingFields(master):[]};
 });
}
function headingValue(doc,sheet,record,key){
 const field=key!=='title'&&sheet?.fields.find(field=>field.id===key);
 const value=field?M.cell(doc,field,record.values[field.id]):'';
 return String(value).trim().replace(/\s+/g,' ').slice(0,200)||record.title;
}

function recordDetail(doc,record,prefs,records,sheets,favorites){
 const sheet=sheets.get(record.sheetId),parent=M.parentField(doc,sheet),rule=prefs.headers[sheet.id]||{master:'title',item:'title'};
 const masters=rule.master&&parent?(record.values[parent.id]||[]).slice(0,5)
  .map(id=>records.get(id)).filter(master=>master&&M.live(doc,master))
  .map(master=>headingValue(doc,sheets.get(master.sheetId),master,rule.master)):[];
 const links=record.fileLinks.map((link,index)=>{
  const favorite=favorites.get(link.favoriteId),filepath=favorite?.path||link.path;
  return {kind:'file',index,path:filepath,location:parentPath(filepath),label:link.label||favorite?.label||pathName(filepath)};
 });
 const seen=new Set();
 const appendUrls=(value,whole=false)=>{
  for(const link of web.links(value,{whole})){
   if(links.length>=150)break;
   if(seen.has(link.url))continue;
   seen.add(link.url);
   links.push({kind:'url',label:link.text,url:link.url});
  }
 };
 appendUrls(record.notes);
 for(const field of sheet.fields)if(['url','text','longtext'].includes(field.type))appendUrls(record.values[field.id],field.type==='url');
 const {fields,notes,title}=require('./tool-views-model').logDetail(doc,record);
 return {kind:'record',title,heading:headline(masters.join('、'),headingValue(doc,sheet,record,rule.item)),
  fields,notes,links,version:record.version,visit:'在工作區開啟'};
}

function locationDetail(pin,item,prefs){
 const fallback=pin.kind==='favorite'?'收藏已移除':'追蹤結果';
 const filepath=item?.path,title=item?.label||item?.name||(filepath?pathName(filepath):fallback),fields=[];

 if(item?.tags?.length)fields.push({label:'標籤',value:item.tags.join('、')});
 if(pin.kind==='tracking')fields.push({label:'追蹤搜尋',value:pin.queryName});
 const {prefix,title:titleMode}=prefs[pin.kind];
 const prefixValue=prefix==='folder'&&filepath?pathName((/^(?:[a-z]:|\\\\)/i.test(filepath)?path.win32:path).dirname(filepath)):
  prefix==='tag'?item?.tags?.[0]:prefix==='query'?pin.queryName:'';
 const itemTitle=titleMode==='path'?filepath:titleMode==='name'&&filepath?pathName(filepath):title;
 return {kind:pin.kind,title,heading:headline(prefixValue,itemTitle||title),fields,links:filepath?[{kind:'item',label:pathName(filepath),location:parentPath(filepath)}]:[],notes:item?item.status==='missing'?'位置暫時無法使用。':'':'收藏已移除。',
  visit:item?'開啟檔案／資料夾':'',locate:Boolean(item)};
}

function tagDetail(pin,items){
 const scope={favorites:'檔案／資料夾收藏',workspace:'工作區收藏',tracking:'Everything 追蹤'}[pin.scope];
 return {kind:'tag',title:pin.tag,heading:headline(scope,pin.tag),fields:[{label:'項目數',value:String(items.length)}],
  links:[],items:items.slice(0,20).map(item=>item.title||item.label||item.name||pathName(item.path)),notes:items.length?'':'目前沒有符合此標籤的項目。',
  visit:items.length?'開啟標籤分類':'',locate:false};
}

module.exports={LIMIT,SOURCES,TAG_SCOPES,tagName,tagDetail,DEFAULTS,FILE_HEADERS,settings,filePins,fileKey,tableOptions,recordDetail,locationDetail,colorText};
