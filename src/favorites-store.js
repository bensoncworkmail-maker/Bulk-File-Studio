'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_FAVORITES = 10000;
const pathKey = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const identityKeys = ['dev','ino','birthtimeNs'];
function identity(stat) { return Object.fromEntries(identityKeys.map(key=>[key,String(stat[key])])); }
function sameIdentity(a,b) { return a && b && identityKeys.every(key=>a[key]===b[key]); }
function inspectPath(filepath) {
  if (typeof filepath !== 'string' || !path.isAbsolute(filepath) || filepath.includes('\0')) throw new Error('請選取有效的完整檔案或資料夾路徑');
  const stat=fs.lstatSync(filepath,{bigint:true});
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('只支援一般檔案及資料夾，不包含符號連結');
  return {type:stat.isDirectory()?'folder':'file',identity:identity(stat)};
}
function cleanTags(tags) {
  if (!Array.isArray(tags) || tags.some(tag=>typeof tag!=='string')) throw new Error('標籤必須是文字清單');
  const found=new Map();
  for(const raw of tags) {
    const tag=raw.trim(); if(!tag)continue;
    if(tag.length>32 || /[\x00-\x1f]/.test(tag))throw new Error('每個標籤最多 32 個字元，且不可包含控制字元');
    if(!found.has(tag.toLocaleLowerCase()))found.set(tag.toLocaleLowerCase(),tag);
  }
  if(found.size>20)throw new Error('每個收藏最多 20 個標籤');
  return [...found.values()];
}
class FavoritesStore {
  constructor(filename) { this.filename=filename; }
  read() {
    let text;
    try { text=fs.readFileSync(this.filename,'utf8'); }
    catch(e) { if(e.code==='ENOENT')return {version:1,items:[]};throw e; }
    try {
      const data=JSON.parse(text);
      if(data.version!==1 || !Array.isArray(data.items) || data.items.length>MAX_FAVORITES)throw new Error('資料格式不正確');
      const ids=new Set();
      for(const item of data.items) {
        if(!item || typeof item.id!=='string' || ids.has(item.id) || typeof item.path!=='string' || !path.isAbsolute(item.path) ||
          !['file','folder'].includes(item.type) || typeof item.label!=='string' || item.label.length>100 || !Array.isArray(item.tags) ||
          !item.identity || !identityKeys.every(key=>typeof item.identity[key]==='string') || typeof item.createdAt!=='string' || typeof item.updatedAt!=='string')throw new Error('收藏紀錄不完整');
        cleanTags(item.tags);ids.add(item.id);
      }
      return data;
    } catch(e) { throw new Error(`收藏資料無法讀取，已停止寫入以保留原資料。\n${this.filename}\n${e.message}`); }
  }
  write(data) {
    fs.mkdirSync(path.dirname(this.filename),{recursive:true});
    const temp=this.filename+'.'+crypto.randomUUID()+'.new';
    try {
      fs.writeFileSync(temp,JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});
      if(fs.existsSync(this.filename))fs.copyFileSync(this.filename,this.filename+'.bak');
      fs.renameSync(temp,this.filename);
    } finally { try{fs.unlinkSync(temp);}catch(e){if(e.code!=='ENOENT')throw e;} }
  }
  state(item) {
    try {
      const actual=inspectPath(item.path);
      return actual.type===item.type && sameIdentity(item.identity,actual.identity) ? {status:'ready',reason:''} :
        {status:'replaced',reason:'這個位置的項目可能已被替換，請編輯收藏並重新連結後再使用'};
    } catch(e) {
      return {status:e.code==='ENOENT'||e.code==='ENOTDIR'?'missing':'unavailable',reason:e.code==='ENOENT'||e.code==='ENOTDIR'?'找不到位置；請重新連結或稍後接回磁碟':e.message};
    }
  }
  list() { return this.read().items.map(item=>({...item,...this.state(item)})); }
  get(id,requireReady=false) {
    const item=this.read().items.find(item=>item.id===id);
    if(!item)throw new Error('找不到選取的收藏，請重新整理');
    const state=this.state(item);
    if(requireReady && state.status!=='ready')throw new Error(`${item.path}\n${state.reason}`);
    return {...item,...state};
  }
  addPaths(inputs,tags=[]) {
    if(!Array.isArray(inputs) || inputs.length>MAX_FAVORITES)throw new Error('收藏數量超過上限');
    const data=this.read(),normalizedTags=cleanTags(tags),issues=[];
    const known=new Map();
    for(const item of data.items){const key=pathKey(item.path);if(!known.has(key))known.set(key,[]);known.get(key).push(item);}
    let added=0,existing=0,changed=false;
    for(const input of inputs) {
      try {
        const checked=inspectPath(input),filepath=path.resolve(input);
        const candidates=known.get(pathKey(filepath))||[];
        const prior=candidates.find(item=>sameIdentity(item.identity,checked.identity))||candidates[0];
        if(prior) {
          if(!sameIdentity(prior.identity,checked.identity)||prior.type!==checked.type)throw new Error('此位置已收藏，但檔案可能被替換；請使用重新連結');
          const merged=cleanTags([...prior.tags,...normalizedTags]);
          if(JSON.stringify(merged)!==JSON.stringify(prior.tags)){prior.tags=merged;prior.updatedAt=new Date().toISOString();changed=true;}
          existing++;continue;
        }
        if(data.items.length>=MAX_FAVORITES)throw new Error(`最多保留 ${MAX_FAVORITES} 個收藏`);
        const now=new Date().toISOString();
        const item={id:crypto.randomUUID(),path:filepath,...checked,label:'',tags:[...normalizedTags],createdAt:now,updatedAt:now};
        data.items.push(item);candidates.push(item);known.set(pathKey(filepath),candidates);added++;changed=true;
      } catch(e) { issues.push(`${String(input)}：${e.message}`); }
    }
    if(changed)this.write(data);
    return {added,existing,issues};
  }
  selection(data,ids) {
    if(!Array.isArray(ids)||!ids.length||ids.length>MAX_FAVORITES||ids.some(id=>typeof id!=='string'))throw new Error('請先選取收藏項目');
    const selected=new Set(ids);
    const found=data.items.filter(item=>selected.has(item.id));
    if(found.length!==selected.size)throw new Error('部分收藏已不存在，請重新整理');
    return found;
  }
  update(ids,changes={}) {
    const data=this.read(),items=this.selection(data,ids);
    const tags=changes.tags===undefined?undefined:cleanTags(changes.tags);
    if(changes.label!==undefined && (items.length!==1||typeof changes.label!=='string'||changes.label.trim().length>100))throw new Error('顯示名稱最多 100 個字元，且只適用於單一收藏');
    let linked;
    if(changes.path!==undefined) {
      if(items.length!==1)throw new Error('只能逐項重新連結');
      linked=inspectPath(changes.path);
      if(linked.type!==items[0].type)throw new Error('重新連結的項目類型必須與原來相同');
      if(data.items.some(item=>item.id!==items[0].id&&pathKey(item.path)===pathKey(changes.path)))throw new Error('這個位置已經在收藏中，請選擇其他位置');
    }
    for(const item of items) {
      if(tags!==undefined)item.tags=tags;
      if(changes.label!==undefined)item.label=changes.label.trim();
      if(linked){item.path=path.resolve(changes.path);item.identity=linked.identity;}
      item.updatedAt=new Date().toISOString();
    }
    this.write(data);return {updated:items.length};
  }
  remove(ids) {
    const data=this.read(),items=this.selection(data,ids),selected=new Set(items.map(item=>item.id));
    data.items=data.items.filter(item=>!selected.has(item.id));this.write(data);return {removed:items.length};
  }
  readyPaths(ids) {
    const data=this.read(),items=this.selection(data,ids);
    for(const item of items){const state=this.state(item);if(state.status!=='ready')throw new Error(`${item.path}\n${state.reason}`);}
    return items.map(item=>item.path);
  }
  applyMoves(moves) {
    const data=this.read(),mapping=new Map(moves.map(move=>[pathKey(move.source),move]));
    let updated=0;
    for(const item of data.items) {
      const move=mapping.get(pathKey(item.path));
      if(!move||!sameIdentity(item.identity,move.expectedFingerprint))continue;
      // Keep swaps and repeated recovery attempts tied to the original file identity.
      item.path=move.destination;item.updatedAt=new Date().toISOString();updated++;
    }
    if(updated) {
      const unique=new Map();
      for(const item of data.items) {
        const key=pathKey(item.path)+'\0'+identityKeys.map(field=>item.identity[field]).join(':');
        const existing=unique.get(key);
        if(existing){existing.tags=cleanTags([...existing.tags,...item.tags]);if(!existing.label)existing.label=item.label;}
        else unique.set(key,item);
      }
      data.items=[...unique.values()];this.write(data);
    }
    return updated;
  }
}
module.exports={FavoritesStore,cleanTags,inspectPath,sameIdentity,MAX_FAVORITES};
