'use strict';
const {PAGES,ID}=require('./quick-actions-model');

const PAGE='--open-page',ITEM='--open-item';
const kinds=new Set(['record','sheet','favorite','tracking','snippet']);

function launchArguments(argv){
 if(!Array.isArray(argv))return null;
 const separator=argv.indexOf('--');
 const options=argv.slice(1,separator<0?undefined:separator);
 const index=options.findIndex(value=>value===PAGE||value===ITEM);
 // A fourth argument is enough to reject a command with trailing arguments.
 return index<0?null:options.slice(index,index+4).map(value=>typeof value==='string'?value.slice(0,40):'');
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
 }
 return {error:'請使用 --open-page 頁面代碼，或 --open-item 類型 UUID。'};
}

module.exports={launchArguments,launchTarget,itemArguments};
