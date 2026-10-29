'use strict';
(() => {
  function paginate(items,index=0,size=100) {
    const limit=[100,250,500].includes(size)?size:100,total=items.length,pageCount=Math.max(1,Math.ceil(total/limit));
    const page=Math.min(pageCount-1,Math.max(0,Number.isFinite(index)?Math.trunc(index):0));
    const start=page*limit,end=Math.min(total,start+limit);
    return {rows:items.slice(start,end),page,pageCount,start:total?start+1:0,end,total,hasPrevious:page>0,hasNext:page<pageCount-1};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={paginate};
  else globalThis.studioPagination=Object.freeze({paginate});
})();
