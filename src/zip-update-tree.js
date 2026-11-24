'use strict';
(()=>{
 function build(rows,sort={key:'name',direction:'asc'}){const root={children:new Map()},folders=new Map();for(const row of rows){const parts=(row.relative||row.name).split('/');let parent=root,prefix='';for(let i=0;i<parts.length-1;i++){prefix=prefix?prefix+'/'+parts[i]:parts[i];let folder=folders.get(prefix);if(!folder){folder={key:'folder:'+prefix,kind:'folder',path:prefix,name:parts[i],depth:i,parent:i?prefix.slice(0,prefix.lastIndexOf('/')):'',children:new Map(),members:[]};folders.set(prefix,folder);parent.children.set(folder.key,folder);}folder.members.push(row);parent=folder;}parent.children.set('file:'+row.id,{key:'file:'+row.id,kind:'file',path:parts.join('/'),name:parts.at(-1),depth:parts.length-1,parent:parts.slice(0,-1).join('/'),row});}
  const view=typeof module!=='undefined'&&module.exports?require('./zip-update-view'):globalThis.zipUpdateView;
  const values=entry=>entry.kind==='folder'?{name:entry.name,size:entry.members.reduce((n,r)=>n+r.size,0),status:'',destination:entry.path}:{...entry.row,name:entry.name};
  const compare=(a,b)=>view.compare(sort,values(a),values(b));
  function flatten(expanded){const out=[],walk=parent=>{for(const entry of [...parent.children.values()].sort(compare)){out.push(entry);if(entry.kind==='folder'&&expanded.has(entry.path))walk(entry);}};walk(root);return out;}
  function page(expanded,index,limit=100){const flat=flatten(expanded),last=Math.max(0,Math.ceil(flat.length/limit)-1),current=Math.min(Math.max(0,index),last),rows=flat.slice(current*limit,current*limit+limit),context=[];let parent=rows[0]?.parent;while(parent){const folder=folders.get(parent);if(!folder)break;context.unshift({...folder,context:true});parent=folder.parent;}return {rows:[...context,...rows],index:current,last,total:flat.length};}
  return {folders,flatten,page};
 }
 const api={build};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.zipUpdateTree=api;
})();
