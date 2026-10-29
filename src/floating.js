'use strict';
(() => {
 const $=id=>document.getElementById(id),model=window.favoritesModel;let items=[],tag=null,page=0,revision=0,settings={tagSort:'name',tagDirection:'asc'},busy=false;
 const node=(type,text,className)=>{const el=document.createElement(type);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 async function action(task,message='名稱開啟 · ⌖ 定位 · ⧉ 複製路徑 · Esc 隱藏'){if(busy)return;busy=true;try{const result=await task();$('mini-status').textContent=typeof message==='function'?message(result):message;$('mini-status').title=result?.issues?.join('\n')||'';$('mini-status').className=result?.issues?.length?'error':'';}catch(e){$('mini-status').textContent=String(e.message||e);$('mini-status').className='error';}finally{busy=false;}}
 function render(){
  document.documentElement.dataset.theme=settings.theme||'dark';document.documentElement.style.fontSize=(settings.fontSize||'13')+'px';
  const tags=model.tagList(items,settings.tagSort,settings.tagDirection);if(tag&&!tags.some(t=>t.key===tag))tag=null;
  $('mini-pin').textContent=settings.floatingOnTop?'置頂 ✓':'置頂';$('mini-pin').setAttribute('aria-pressed',String(settings.floatingOnTop));$('mini-pin').title=settings.floatingOnTop?'目前置頂，點選取消':'目前未置頂，點選啟用';
  const selectedTag=tags.find(t=>t.key===tag);$('mini-drop-hint').textContent=selectedTag?'拖放收藏到「'+selectedTag.name+'」':'拖放檔案／資料夾以收藏';$('mini-drop-hint').title='只儲存位置；保留既有標籤。「全部／未分類」不新增標籤。';
  $('mini-tags').replaceChildren();for(const entry of [{key:null,name:'全部',count:items.length},{key:'',name:'未分類',count:items.filter(i=>!i.tags.length).length},...tags]){const button=node('button',entry.name+' '+entry.count,tag===entry.key?'active':'');button.setAttribute('aria-pressed',String(tag===entry.key));button.addEventListener('click',()=>{tag=entry.key;page=0;render();});$('mini-tags').appendChild(button);}
  const q=$('mini-search').value.trim().toLocaleLowerCase();const found=items.filter(i=>(tag===null||(tag===''?!i.tags.length:i.tags.some(t=>t.toLocaleLowerCase()===tag)))&&(!q||[i.label,i.path,...i.tags].some(t=>t.toLocaleLowerCase().includes(q))));const total=Math.max(1,Math.ceil(found.length/100));page=Math.min(Math.max(0,page),total-1);$('mini-list').replaceChildren();
  for(const item of model.sortItems(found,'name','asc').slice(page*100,page*100+100)){
   const row=node('div',undefined,'mini-row'),name=node('button',undefined,'mini-name'),title=node('span',(item.type==='folder'?'📁 ':'📄 ')+(item.label||model.basename(item.path))),location=node('small',item.path);name.title=item.path;name.disabled=item.status!=='ready';name.append(title,location);name.addEventListener('click',()=>action(()=>window.favoritesAPI.open(item.id)));
   const show=node('button','⌖');show.title='在檔案總管定位';show.setAttribute('aria-label','定位 '+model.basename(item.path));show.disabled=item.status!=='ready';show.addEventListener('click',()=>action(()=>window.favoritesAPI.show(item.id)));const copy=node('button','⧉');copy.title='複製完整路徑（包含遺失的位置）';copy.setAttribute('aria-label','複製路徑 '+model.basename(item.path));copy.addEventListener('click',()=>action(()=>window.favoritesAPI.copy(item.id),'已複製完整路徑'));row.append(name,show,copy);$('mini-list').appendChild(row);
  }
  if(!found.length)$('mini-list').appendChild(node('div','沒有符合條件的收藏','mini-empty'));
  $('mini-count').textContent=`${found.length} 項 · ${page+1}/${total}`;$('mini-prev').disabled=page===0;$('mini-next').disabled=page===total-1;
 }
 async function refresh(){const request=++revision;try{const [result,prefs]=await Promise.all([window.favoritesAPI.list(),window.desktopAPI.get()]);if(request!==revision)return;items=result.items;settings=prefs;render();}catch(e){$('mini-status').textContent=String(e.message||e);$('mini-status').className='error';}}
 $('mini-pin').addEventListener('click',()=>action(()=>window.desktopAPI.togglePin(),result=>result.settings.floatingOnTop?'已設為置頂':'已取消置頂'));$('mini-import').addEventListener('click',()=>action(()=>window.desktopAPI.importPaths(tag),'請在主視窗檢查並匯入路徑'));
 let dragDepth=0;const hideDrop=()=>{dragDepth=0;$('mini-drop').hidden=true;};
 document.addEventListener('dragenter',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth++;$('mini-drop').hidden=false;});
 document.addEventListener('dragover',event=>event.preventDefault());
 document.addEventListener('dragleave',event=>{event.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('mini-drop').hidden=true;});
 document.addEventListener('drop',event=>{event.preventDefault();hideDrop();if(busy)return;const targetTag=tag;action(async()=>{const paths=Array.from(event.dataTransfer?.files||[]).map(file=>window.renameAPI.pathForFile(file)).filter(Boolean);if(!paths.length)throw new Error('無法讀取拖放路徑，請改用匯入路徑');const result=await window.favoritesAPI.collectFloating(paths,targetTag);await refresh();return result;},result=>`已新增 ${result.added} 項、已收藏 ${result.existing} 項${result.issues.length?'；'+result.issues.length+' 項未完成（滑鼠移到訊息查看原因）':''}`);});
 window.addEventListener('blur',hideDrop);
 $('mini-close').addEventListener('click',()=>window.desktopAPI.hideFloating());$('mini-main').addEventListener('click',()=>window.desktopAPI.showMain(tag));$('mini-refresh').addEventListener('click',refresh);$('mini-search').addEventListener('input',()=>{page=0;render();});$('mini-prev').addEventListener('click',()=>{page--;render();});$('mini-next').addEventListener('click',()=>{page++;render();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')window.desktopAPI.hideFloating();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('mini-search').focus();}});
 window.favoritesAPI.onChanged(refresh);window.desktopAPI.onChanged(payload=>{if(payload.settings){settings=payload.settings;render();}});window.addEventListener('focus',refresh);refresh();
})();
