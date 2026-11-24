'use strict';
(()=>{
 const columns={source:['name','size','modified'],target:['name','size','modified'],compare:['name','status','size','destination']};
 function normalize(input){const out={sorts:{},expanded:[],expandAll:false};for(const [kind,keys]of Object.entries(columns)){const sort=input?.sorts?.[kind];out.sorts[kind]={key:keys.includes(sort?.key)?sort.key:kind==='source'?'modified':'name',direction:sort?.direction==='desc'||(kind==='source'&&!keys.includes(sort?.key))?'desc':'asc'};}out.expanded=Array.isArray(input?.expanded)?[...new Set(input.expanded.filter(p=>typeof p==='string'&&p.length<=1000&&!/[\x00-\x1f]/.test(p)))].slice(0,5000):[];out.expandAll=input?.expandAll===true;return out;}
 const text=(a,b)=>String(a||'').localeCompare(String(b||''),'zh-Hant',{numeric:true});
 function compare(sort,a,b){const key=sort.key,direction=sort.direction==='desc'?-1:1;return direction*(key==='size'?(Number(a[key])||0)-(Number(b[key])||0):text(a[key],b[key]))||text(a.name,b.name);}
 function browserRows(rows,sort){return [...rows].sort((a,b)=>compare(sort,a,b));}
 const api={columns,normalize,compare,browserRows};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.zipUpdateView=api;
})();
