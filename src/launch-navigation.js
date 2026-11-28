'use strict';
const {PAGES,ID}=require('./quick-actions-model');
const {MAX_QUERY,normalizeQuery}=require('./everything-query');
const {cleanTags}=require('./favorites-store');

const PAGE='--open-page',ITEM='--open-item',TRACKING_TAG='--open-tracking-tag',TRACKING_QUERY='--open-tracking-query';
const options=new Set([PAGE,ITEM,TRACKING_TAG,TRACKING_QUERY]);
const kinds=new Set(['record','sheet','favorite','tracking','snippet']);

function launchArguments(argv){
 if(!Array.isArray(argv))return null;
 const separator=argv.indexOf('--');
 const args=argv.slice(1,separator<0?undefined:separator);
 const index=args.findIndex(value=>options.has(value));
 // A fourth argument is enough to reject a command with trailing arguments.
 return index<0?null:args.slice(index,index+4).map(value=>typeof value==='string'&&value.length<=MAX_QUERY?value:'');
}

function itemArguments(kind,id){
 if(!kinds.has(kind)||typeof id!=='string'||!ID.test(id))throw Error('請指定有效的項目類型及 UUID');
 return [ITEM,kind,id];
}

function launchTarget(args){
 if(args===null||args===undefined)return null;
 if(Array.isArray(args)){
  const [command,kind,id]=args;
  if(args.length===2&&command===PAGE&&typeof kind==='string'&&Object.hasOwn(PAGES,kind))return {page:kind};
  if(args.length===3&&command===ITEM&&kinds.has(kind)&&typeof id==='string'&&ID.test(id))return {kind,id};
  if(args.length===2&&command===TRACKING_TAG){
   try{
    const [tag]=cleanTags([kind]);
    if(tag)return {kind:'tracking-tag',tag};
   }catch(error){return {error:error.message};}
   return {error:'請指定 Everything 追蹤標籤。'};
  }
  if(args.length===2&&command===TRACKING_QUERY){
   try{return {kind:'tracking-query',text:normalizeQuery({text:kind,mode:'syntax',type:'all'}).text};}
   catch(error){return {error:error.message};}
  }
 }
 return {error:'請使用 --open-page 頁面代碼、--open-item 類型 UUID、--open-tracking-tag "標籤" 或 --open-tracking-query "搜尋式"。'};
}

module.exports={launchArguments,launchTarget,itemArguments};
