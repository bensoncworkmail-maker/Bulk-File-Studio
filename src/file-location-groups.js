'use strict';
(() => {
 const normalize=value=>String(value).replace(/\\/g,'/').replace(/\/+$/,'')||'/';
 function location(filepath,mode){
  const value=normalize(filepath),windows=/^[a-z]:\//i.test(value);
  const label=mode==='root'?(windows?value.slice(0,2)+'/':'/'):(value.slice(0,value.lastIndexOf('/'))||'/');
  return {key:windows?label.toLowerCase():label,label};
 }
 function arrange(rows,mode='none'){
  if(!['folder','root'].includes(mode))return [...rows];
  const groups=new Map();for(const row of rows){const group=location(row.source,mode);if(!groups.has(group.key))groups.set(group.key,[]);groups.get(group.key).push(row);}
  return [...groups].sort(([a],[b])=>a.localeCompare(b,'zh-Hant',{numeric:true})).flatMap(([,items])=>items);
 }
 function members(rows,filepath,mode){const group=location(filepath,mode).key;return rows.filter(row=>location(row.source,mode).key===group);}
 const api={location,arrange,members};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.fileLocationGroups=Object.freeze(api);
})();
