'use strict';
(() => {
 const C=window.everythingResultColumns;
 function mount(root,data,api){
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;},button=(label,task,parent)=>{const el=node('button',label);el.type='button';el.addEventListener('click',task);parent.append(el);return el;};
  if(data.error){const warning=node('p','更新失敗，保留上次結果：'+data.error);warning.className='error';root.append(warning);}
  const search=node('input');search.type='search';search.placeholder='找檔案…';search.setAttribute('aria-label','篩選檔案');root.append(search);
  const summary=node('p'),list=node('div'),paging=node('div');list.className='context-file-list';paging.className='context-file-paging';root.append(summary,list,paging);let page=0,query='';
  const prev=button('上一頁',()=>{page--;render();},paging),pageLabel=node('span');paging.append(pageLabel);const next=button('下一頁',()=>{page++;render();},paging);
  function render(){const q=query.trim().toLocaleLowerCase(),rows=data.rows.filter(row=>!q||(row.name+' '+row.path).toLocaleLowerCase().includes(q)),last=Math.max(0,Math.ceil(rows.length/50)-1);page=Math.min(last,Math.max(0,page));list.replaceChildren();summary.textContent='共 '+data.total+' 項'+(q?' · 符合 '+rows.length+' 項':'')+(data.total>data.rows.length?' · 載入前 '+data.rows.length+' 項':'')+(data.partial?' · 來源有截斷':'')+(data.skipped?' · 略過 '+data.skipped+' 項':'');
   for(const row of rows.slice(page*50,page*50+50)){const item=node('div');item.className='context-file-item';const head=node('div');head.className='context-file-heading';const open=button((row.type==='folder'?'📁 ':'📄 ')+row.name,()=>api.file(row.index,'open'),head);open.className='context-file-name';open.title=row.path;const more=node('details'),description=node('summary','⋯');description.setAttribute('aria-label','更多操作 '+row.name);more.append(description);more.append(node('small',row.path));button('所在位置',()=>api.file(row.index,'show'),more);button('複製路徑',()=>api.file(row.index,'copy'),more);head.append(more);item.append(head);const meta=node('small',C.display(row,'size')+' · '+C.display(row,'modified'));meta.title=C.location(row);item.append(meta);list.append(item);}
   if(!rows.length)list.append(node('p','沒有符合的檔案'));prev.disabled=page===0;next.disabled=page===last;pageLabel.textContent=(page+1)+' / '+(last+1);
  }
  search.addEventListener('input',()=>{query=search.value;page=0;render();});render();
 }
 window.desktopContextFiles={mount};
})();
