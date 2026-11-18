'use strict';
const crypto=require('node:crypto'),path=require('node:path');
const {normalizeQuery,normalizeExtensions}=require('./everything-query'),{cleanTags,inspectPath,sameIdentity}=require('./favorites-store');
const network=require('./intranet-path'),{sharedInspector,accessReason}=require('./everything-result-paths');
const queryKey=query=>JSON.stringify(query);
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,INTERVALS=[0,60,300,900],MAX_RULES=20;
function normalizeRules(data){
 const values=data.everythingSearches??[],refreshSeconds=data.everythingRefreshSeconds??60;
 if(!Array.isArray(values)||values.length>MAX_RULES||!INTERVALS.includes(refreshSeconds))throw Error('Everything 追蹤設定無效');
 const ids=new Set(),queries=values.map(value=>{
  if(!value||!ID.test(value.id)||ids.has(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.length>100||/[\x00-\x1f\x7f]/.test(value.name)||typeof value.enabled!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('Everything 追蹤搜尋格式無效');
  ids.add(value.id);return {id:value.id,name:value.name.trim(),...normalizeQuery(value),tags:cleanTags(value.tags),enabled:value.enabled,revision:value.revision};
 });
 const profiles=data.everythingFileTypes??[];
 if(!Array.isArray(profiles)||profiles.length>30)throw Error('自訂檔案類型最多 30 組');
 const names=new Set(),fileTypes=profiles.map(profile=>{
  if(!profile||typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>50||/[\x00-\x1f\x7f]/.test(profile.name))throw Error('自訂檔案類型名稱無效');
  const name=profile.name.trim(),key=name.toLocaleLowerCase();if(names.has(key))throw Error('自訂檔案類型名稱重複');names.add(key);
  return {name,extensions:normalizeExtensions(profile.extensions)};
 });return {queries,refreshSeconds,fileTypes};
}
class EverythingTracking{
 constructor({favorites,bridge,inspect=inspectPath,inspectShared,withPaths=network.withIntranetPaths,now=Date.now}){Object.assign(this,{favorites,bridge,inspect,inspectShared,withPaths,now});this.cache=new Map();this.epoch=0;this.changes=favorites.filename?new(require('./tracking-changes').TrackingChanges)(path.join(path.dirname(favorites.filename),'tracking-snapshots.json')):null;}
 invalidate(){this.epoch++;this.cache.clear();}
 applyMoves(moves){
  if(!moves.length)return;
  const apiFor=value=>/^[a-z]:[\\/]|^\\\\/i.test(value)?path.win32:path;
  const key=value=>{const api=apiFor(value),clean=api.resolve(value);return api===path.win32?clean.toLowerCase():clean;};
  const destinations=new Map(moves.map(move=>[key(move.source),move.destination])),checked=new Map();
  // A completed move is authoritative even while the Everything index still has
  // the old name. Revoke pending searches and tokens without clearing the list.
  this.epoch++;
  for(const [id,snapshot] of this.cache){
   const rows=[],seen=new Set();let skipped=0;
   for(const item of snapshot.rows){
    const destination=destinations.get(key(item.path));let row=item;
    if(destination){
     if(!checked.has(destination)){
      try{checked.set(destination,this.inspect(destination));}catch{checked.set(destination,null);}
     }
     const info=checked.get(destination);if(!info||info.type!==item.type){skipped++;continue;}
     row={...item,...info,path:destination,name:apiFor(destination).basename(destination)};
    }
    const location=key(row.path);if(seen.has(location))continue;seen.add(location);rows.push(row);
   }
   this.cache.set(id,{...snapshot,rows,token:crypto.randomUUID(),skipped:(snapshot.skipped||0)+skipped});
  }
 }
 removePaths(paths){
  if(!paths.length)return;
  // Revoke in-flight queries and old indices, while keeping unaffected rows visible.
  const apiFor=value=>/^[a-z]:[\\/]|^\\\\/i.test(value)?path.win32:path;
  const key=(value,api)=>{const clean=api.resolve(value);return api===path.win32?clean.toLowerCase():clean;};
  const roots=paths.map(value=>{const api=apiFor(value);return {api,root:key(value,api)};});
  this.epoch++;
  for(const [id,snapshot] of this.cache){
   const rows=snapshot.rows.filter(item=>!roots.some(({api,root})=>{
    const relative=api.relative(root,key(item.path,api));return relative===''||relative!=='..'&&!relative.startsWith('..'+api.sep)&&!api.isAbsolute(relative);
   }));
   this.cache.set(id,{...snapshot,rows,token:crypto.randomUUID(),pruned:snapshot.pruned||rows.length!==snapshot.rows.length});
  }
 }
 read(){return normalizeRules(this.favorites.read());}
 list(){
  const data=this.read(),ids=new Set(data.queries.map(item=>item.id));for(const id of this.cache.keys())if(!ids.has(id))this.cache.delete(id);
  return {...data,engine:this.bridge.status(),queries:data.queries.map(query=>({...query,snapshot:this.snapshot(query)}))};
 }
 snapshot(query){const value=this.cache.get(query.id);return value?.revision===query.revision&&value.queryKey===queryKey(query)?structuredClone(value):null;}
 save(input){
  const data=this.favorites.read(),state=normalizeRules(data),prior=input?.id?state.queries.find(item=>item.id===input.id):null;
  if(input?.id&&!prior)throw Error('追蹤搜尋已移除，請重新整理');
  const query=normalizeRules({everythingSearches:[{...input,id:prior?.id||crypto.randomUUID(),revision:(prior?.revision||0)+1}]}).queries[0];
  if(state.queries.some(item=>item.id!==query.id&&item.text===query.text&&item.type===query.type&&item.mode===query.mode&&(item.extensions||'')===(query.extensions||'')))throw Error('此命令已在追蹤搜尋中，請編輯原有搜尋');
  if(!prior&&state.queries.length>=MAX_RULES)throw Error('最多追蹤 20 個 Everything 搜尋');
  data.everythingSearches=prior?state.queries.map(item=>item.id===query.id?query:item):[...state.queries,query];this.favorites.write(data);this.cache.delete(query.id);return query;
 }
 remove(id){const data=this.favorites.read(),state=normalizeRules(data);if(!state.queries.some(item=>item.id===id))throw Error('追蹤搜尋已移除');data.everythingSearches=state.queries.filter(item=>item.id!==id);this.favorites.write(data);this.cache.delete(id);this.changes?.remove(id);return {removed:true};}
 manageTag(input){
  const name=cleanTags([input?.name])[0],replacement=input?.replacement===null?null:cleanTags([input?.replacement])[0];
  if(!name||replacement===undefined)throw Error('請輸入有效標籤名稱');
  if(replacement!==null&&/[,，]/.test(replacement))throw Error('標籤名稱不可包含半形或全形逗號（,／，），請使用其他字元');
  const data=this.favorites.read(),state=normalizeRules(data),key=name.toLocaleLowerCase();
  const affected=state.queries.filter(query=>query.tags.some(tag=>tag.toLocaleLowerCase()===key)),expected=input?.expected;
  const versionList=queries=>queries.map(({id,revision})=>({id,revision})).sort((a,b)=>a.id.localeCompare(b.id));
  if(!Array.isArray(expected)||expected.length>MAX_RULES||expected.some(item=>!item||!ID.test(item.id)||!Number.isSafeInteger(item.revision)||item.revision<1)||!affected.length||JSON.stringify(versionList(expected))!==JSON.stringify(versionList(affected)))throw Error('標籤的追蹤搜尋已變更，請關閉視窗後重新開啟');
  const updates=new Map(),snapshots=new Map();
  for(const prior of affected){
   const tags=cleanTags(prior.tags.map(tag=>tag.toLocaleLowerCase()===key?replacement:tag).filter(tag=>tag!==null));
   if(JSON.stringify(tags)===JSON.stringify(prior.tags))continue;
   const query={...prior,tags,revision:prior.revision+1},snapshot=this.snapshot(prior);updates.set(query.id,query);
   if(snapshot)snapshots.set(query.id,{...snapshot,queryKey:queryKey(query),revision:query.revision,token:crypto.randomUUID()});
  }
  if(updates.size){
   data.everythingSearches=state.queries.map(query=>updates.get(query.id)||query);this.favorites.write(data);
   for(const id of updates.keys()){this.cache.delete(id);if(snapshots.has(id))this.cache.set(id,snapshots.get(id));}
  }
  return {updated:updates.size,replacement};
 }
 saveFileType(input){
  const data=this.favorites.read(),state=normalizeRules(data),profile=normalizeRules({everythingFileTypes:[input]}).fileTypes[0];
  const key=profile.name.toLocaleLowerCase();data.everythingFileTypes=[...state.fileTypes.filter(item=>item.name.toLocaleLowerCase()!==key),profile];normalizeRules(data);this.favorites.write(data);return this.list();
 }
 removeFileType(name){
  if(typeof name!=='string')throw Error('自訂類型名稱無效');const data=this.favorites.read(),state=normalizeRules(data);data.everythingFileTypes=state.fileTypes.filter(item=>item.name!==name);this.favorites.write(data);return this.list();
 }
 query(id){const query=this.read().queries.find(item=>item.id===id);if(!query)throw Error('追蹤搜尋已移除');return query;}
 configure(seconds){if(!INTERVALS.includes(seconds))throw Error('追蹤更新間隔無效');const data=this.favorites.read();data.everythingRefreshSeconds=seconds;this.favorites.write(data);return this.list();}
 async refresh(id){
  const query=this.read().queries.find(item=>item.id===id);if(!query)throw Error('追蹤搜尋已移除');if(!query.enabled)throw Error('此追蹤搜尋已暫停');
  const previous=this.snapshot(query),epoch=this.epoch;
  try{
   const found=await this.bridge.search(query,{publish:false,metadata:true}),rows=[],seen=new Set(),accepted=new Map(),groups=new Map(),skippedReasons=[...(found.skippedReasons||[])].slice(0,3);let skipped=found.skipped||0;
   const failed=(error,count=1)=>{skipped+=count;const reason=accessReason(error);if(skippedReasons.length<3&&!skippedReasons.includes(reason))skippedReasons.push(reason);};
   const inspectShared=this.inspectShared||sharedInspector();
   for(const [index,item] of found.rows.entries()){
    const host=network.isUNC(item.path)?item.path.replaceAll('/','\\').split('\\')[2]?.toLowerCase():'';
    if(!groups.has(host))groups.set(host,[]);groups.get(host).push({index,item});
   }
   for(const entries of groups.values()){
    try{await this.withPaths(entries.map(({item})=>item.path),async()=>{
     for(const {index,item} of entries){
      try{const checked=network.isUNC(item.path)?await inspectShared(item.path):this.inspect(item.path);accepted.set(index,{...item,...checked});}catch(error){failed(error);}
     }
    });}catch(error){failed(error,entries.length);}
   }
   for(const [index,item] of found.rows.entries()){
    if(!accepted.has(index))continue;const key=path.win32.isAbsolute(item.path)?path.win32.normalize(item.path).toLowerCase():path.normalize(item.path);if(seen.has(key))continue;seen.add(key);rows.push(accepted.get(index));
   }
   if(epoch!==this.epoch||queryKey(this.read().queries.find(item=>item.id===id))!==queryKey(query))throw Error('追蹤搜尋已變更，請重新查詢');
   this.cache.set(id,{queryKey:queryKey(query),revision:query.revision,token:crypto.randomUUID(),rows,metadataUnavailable:found.metadataUnavailable===true,truncated:found.truncated,skipped,skippedReasons,checkedAt:new Date(this.now()).toISOString(),error:''});
   if(this.changes){const snapshot=this.cache.get(id);try{snapshot.changes=this.changes.update(query,snapshot);}catch(error){snapshot.changesError=error.message;}}
  }catch(error){
   if(epoch===this.epoch&&queryKey(this.read().queries.find(item=>item.id===id))===queryKey(query))this.cache.set(id,{queryKey:queryKey(query),revision:query.revision,token:previous?.token||crypto.randomUUID(),rows:previous?.rows||[],metadataUnavailable:previous?.metadataUnavailable===true,checkedAt:previous?.checkedAt||null,truncated:previous?.truncated||false,skipped:previous?.skipped||0,skippedReasons:previous?.skippedReasons||[],error:String(error.message||error)});
  }
  return this.list();
 }
 entries(id,token,indices){
  const query=this.read().queries.find(item=>item.id===id),snapshot=query&&this.snapshot(query);
  if(!snapshot||token!==snapshot.token||!Array.isArray(indices)||!indices.length||indices.length>500||indices.some(index=>!Number.isInteger(index)||index<0||index>=snapshot.rows.length))throw Error('追蹤結果已更新，請重新選取');
  const rows=[...new Set(indices)].map(index=>snapshot.rows[index]);
  return {paths:rows.map(item=>item.path),tags:query.tags,rows};
 }
 selection(id,token,indices){
  const selection=this.entries(id,token,indices),{rows}=selection;
  for(const item of rows){const checked=this.inspect(item.path);if(checked.type!==item.type||!sameIdentity(checked.identity,item.identity))throw Error('檔案已替換，請重新更新搜尋結果');}
  return selection;
 }
}
module.exports={EverythingTracking,normalizeRules,MAX_RULES,INTERVALS};
