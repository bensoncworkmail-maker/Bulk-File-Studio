'use strict';
(() => {
 const $=id=>document.getElementById(id),model=window.favoritesModel;let items=[],tag=null,page=0,revision=0,settings={tagSort:'name',tagDirection:'asc'},busy=false;
 const node=(type,text,className)=>{const el=document.createElement(type);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 async function action(task){if(busy)return;busy=true;try{await task();$('mini-status').textContent='點選名稱開啟，⌖ 定位；Esc 隱藏';$('mini-status').className='';}catch(e){$('mini-status').textContent=String(e.message||e);$('mini-status').className='error';}finally{busy=false;}}
 function render(){
  document.documentElement.dataset.theme=settings.theme||'dark';document.documentElement.style.fontSize=(settings.fontSize||'13')+'px';
  const tags=model.tagList(items,settings.tagSort,settings.tagDirection);if(tag&&!tags.some(t=>t.key===tag))tag=null;
  $('mini-tags').replaceChildren();for(const entry of [{key:null,name:'全部',count:items.length},{key:'',name:'未分類',count:items.filter(i=>!i.tags.length).length},...tags]){const button=node('button',entry.name+' '+entry.count,tag===entry.key?'active':'');button.setAttribute('aria-pressed',String(tag===entry.key));button.addEventListener('click',()=>{tag=entry.key;page=0;render();});$('mini-tags').appendChild(button);}
  const q=$('mini-search').value.trim().toLocaleLowerCase();const found=items.filter(i=>(tag===null||(tag===''?!i.tags.length:i.tags.some(t=>t.toLocaleLowerCase()===tag)))&&(!q||[i.label,i.path,...i.tags].some(t=>t.toLocaleLowerCase().includes(q))));const total=Math.max(1,Math.ceil(found.length/100));page=Math.min(Math.max(0,page),total-1);$('mini-list').replaceChildren();
  for(const item of model.sortItems(found,'name','asc').slice(page*100,page*100+100)){
   const row=node('div',undefined,'mini-row'),name=node('button',undefined,'mini-name'),title=node('span',(item.type==='folder'?'📁 ':'📄 ')+(item.label||model.basename(item.path))),location=node('small',item.path);name.title=item.path;name.disabled=item.status!=='ready';name.append(title,location);name.addEventListener('click',()=>action(()=>window.favoritesAPI.open(item.id)));
   const show=node('button','⌖');show.title='在檔案總管定位';show.setAttribute('aria-label','定位 '+model.basename(item.path));show.disabled=item.status!=='ready';show.addEventListener('click',()=>action(()=>window.favoritesAPI.show(item.id)));row.append(name,show);$('mini-list').appendChild(row);
  }
  if(!found.length)$('mini-list').appendChild(node('div','沒有符合條件的收藏','mini-empty'));
  $('mini-count').textContent=`${found.length} 項 · ${page+1}/${total}`;$('mini-prev').disabled=page===0;$('mini-next').disabled=page===total-1;
 }
 async function refresh(){const request=++revision;try{const [result,prefs]=await Promise.all([window.favoritesAPI.list(),window.desktopAPI.get()]);if(request!==revision)return;items=result.items;settings=prefs;render();}catch(e){$('mini-status').textContent=String(e.message||e);$('mini-status').className='error';}}
 $('mini-close').addEventListener('click',()=>window.desktopAPI.hideFloating());$('mini-main').addEventListener('click',()=>window.desktopAPI.showMain(tag));$('mini-refresh').addEventListener('click',refresh);$('mini-search').addEventListener('input',()=>{page=0;render();});$('mini-prev').addEventListener('click',()=>{page--;render();});$('mini-next').addEventListener('click',()=>{page++;render();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')window.desktopAPI.hideFloating();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('mini-search').focus();}});
 window.favoritesAPI.onChanged(refresh);window.desktopAPI.onChanged(payload=>{if(payload.settings){settings=payload.settings;render();}});window.addEventListener('focus',refresh);refresh();
})();
