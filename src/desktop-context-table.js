'use strict';
(() => {
 const C=window.everythingResultColumns;
 function mount(root,data,api){
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;},button=(text,task,parent)=>{const el=node('button',text);el.type='button';el.addEventListener('click',task);parent.append(el);return el;};
  const selected=new Set(),cols=['name','location','size','modified'];let key='modified',direction=-1,page=0,query='',ordered=[];
  if(data.error){const warning=node('p','更新失敗，保留上次結果：'+data.error);warning.className='error';root.append(warning);}
  if(data.checkedAt)root.append(node('small','結果時間：'+new Date(data.checkedAt).toLocaleString('zh-Hant')));
  if(data.skipped)root.append(node('small','；略過 '+data.skipped+' 個無法使用的位置'));
  const tools=node('div');tools.className='context-file-tools';const search=node('input');search.type='search';search.placeholder='篩選檔名或位置';search.setAttribute('aria-label','篩選目前檔案結果');tools.append(search);button('寬版檢視',api.wide,tools);root.append(tools);
  const actions=node('div');actions.className='context-file-tools';let current=null;
  const open=button('開啟',()=>current!==null&&api.file(current,'open'),actions),show=button('所在位置',()=>current!==null&&api.file(current,'show'),actions),copy=button('複製路徑',()=>selected.size?api.copy([...selected]):current!==null&&api.file(current,'copy'),actions);root.append(actions);
  const summary=node('p');summary.setAttribute('role','status');root.append(summary);
  const scroll=node('div');scroll.className='context-table-scroll';scroll.tabIndex=0;scroll.setAttribute('aria-label','檔案結果，可水平捲動');const table=node('table');table.className='context-file-table';table.setAttribute('aria-label',data.title+' 檔案結果');scroll.append(table);root.append(scroll);
  const head=node('thead'),header=node('tr'),allCell=node('th'),all=node('input');all.type='checkbox';all.setAttribute('aria-label','選取本頁');allCell.append(all);header.append(allCell);const headers=new Map();for(const col of cols){const th=node('th');th.scope='col';button(C.COLUMNS[col].label,()=>{direction=key===col?-direction:['size','modified'].includes(col)?-1:1;key=col;page=0;render();},th);headers.set(col,th);header.append(th);}head.append(header);const body=node('tbody');table.append(head,body);
  const paging=node('div');paging.className='context-file-tools';const prev=button('上一頁',()=>{page--;render();},paging),label=node('span');paging.append(label);const next=button('下一頁',()=>{page++;render();},paging);root.append(paging);
  const rowMap=new Map(),checks=new Map();let visible=[];
  function selection(){for(const [index,tr]of rowMap){tr.classList.toggle('selected',selected.has(index)||current===index);tr.setAttribute('aria-selected',String(selected.has(index)||current===index));checks.get(index).checked=selected.has(index);}all.checked=visible.length>0&&visible.every(row=>selected.has(row.index));all.indeterminate=!all.checked&&visible.some(row=>selected.has(row.index));open.disabled=show.disabled=current===null||selected.size>1;copy.disabled=current===null&&!selected.size;summary.textContent='共 '+data.total+' 項；符合 '+ordered.length+' 項；已選 '+selected.size+' 項'+(data.total>data.rows.length?'；載入前 '+data.rows.length+' 項':'')+(data.partial?'；來源搜尋結果有截斷':'');}
  function render(){
   const q=query.trim().toLocaleLowerCase();ordered=data.rows.filter(row=>!q||(row.name+' '+row.path).toLocaleLowerCase().includes(q)).sort((a,b)=>{const av=C.value(a,key),bv=C.value(b,key);if(av==null)return bv==null?a.index-b.index:1;if(bv==null)return -1;return direction*(typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'zh-Hant',{numeric:true}));});const last=Math.max(0,Math.ceil(ordered.length/100)-1);page=Math.min(last,Math.max(0,page));visible=ordered.slice(page*100,page*100+100);body.replaceChildren();rowMap.clear();checks.clear();for(const [col,th]of headers)th.setAttribute('aria-sort',col===key?direction===1?'ascending':'descending':'none');
   for(const item of visible){const tr=node('tr');tr.tabIndex=0;tr.dataset.index=String(item.index);const cell=node('td'),check=node('input');check.type='checkbox';check.setAttribute('aria-label','選取 '+item.name);cell.append(check);tr.append(cell);rowMap.set(item.index,tr);checks.set(item.index,check);
    check.addEventListener('click',event=>event.stopPropagation());check.addEventListener('change',()=>{check.checked?selected.add(item.index):selected.delete(item.index);current=item.index;selection();});
    for(const col of cols){const td=node('td'),text=C.display(item,col);td.title=col==='name'?item.path:text;if(col==='name'){const icon=node('span',item.type==='folder'?'📁':'📄');icon.setAttribute('aria-hidden','true');td.append(icon,node('span',text));}else td.textContent=text;tr.append(td);}
    tr.addEventListener('click',()=>{selected.clear();selected.add(item.index);current=item.index;selection();});tr.addEventListener('dblclick',event=>{if(event.target?.tagName!=='INPUT')api.file(item.index,'open');});tr.addEventListener('keydown',event=>{if(event.target?.tagName==='INPUT')return;if(event.key==='Enter'){event.preventDefault();api.file(item.index,'open');}else if(event.key===' '){event.preventDefault();selected.has(item.index)?selected.delete(item.index):selected.add(item.index);current=item.index;selection();}});body.append(tr);
   }
   if(!visible.length){const tr=node('tr'),td=node('td','沒有符合的檔案');td.colSpan=5;tr.append(td);body.append(tr);}prev.disabled=page===0;next.disabled=page===last;label.textContent=(page+1)+' / '+(last+1);selection();
  }
  all.addEventListener('change',()=>{for(const item of visible)all.checked?selected.add(item.index):selected.delete(item.index);current=visible[0]?.index??null;selection();});search.addEventListener('input',()=>{query=search.value;page=0;render();});render();
 }
 window.desktopContextTable={mount};
})();
