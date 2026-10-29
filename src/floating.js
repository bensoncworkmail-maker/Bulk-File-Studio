'use strict';
(() => {
 const $=id=>document.getElementById(id),model=window.favoritesModel;let items=[],tag=null,page=0,revision=0,settings={tagSort:'name',tagDirection:'asc'},busy=false;
 const node=(type,text,className)=>{const el=document.createElement(type);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
 async function action(task,message='名稱開啟 · ⌖ 定位 · ⧉ 複製路徑 · Esc 隱藏'){if(busy)return;busy=true;try{const result=await task();$('mini-status').textContent=typeof message==='function'?message(result):message;$('mini-status').title=result?.issues?.join('\n')||'';$('mini-status').className=result?.issues?.length?'error':'';}catch(e){$('mini-status').textContent=String(e.message||e);$('mini-status').className='error';}finally{busy=false;}}
 function render(){
  document.documentElement.dataset.showStatus=String(settings.floatingShowStatus===true&&!settings.floatingCompact);
  document.documentElement.dataset.iconSize=settings.floatingIconSize||'small';
  const compact=settings.floatingCompact;for(const [id,key] of [['mini-search-bar','floatingShowSearch'],['mini-tools-bar','floatingShowTools'],['mini-tags','floatingShowTags']])$(id).hidden=compact||settings[key]===false;
  $('mini-tools-toggle').setAttribute('aria-pressed',String(Boolean(compact)));
  $('mini-list').dataset.view=settings.floatingView||'list';
  $('mini-view-list').setAttribute('aria-pressed',String(settings.floatingView!=='icons'));$('mini-view-icons').setAttribute('aria-pressed',String(settings.floatingView==='icons'));
  document.documentElement.dataset.theme=settings.theme||'dark';document.documentElement.style.fontSize=(settings.fontSize||'13')+'px';
  const tags=model.tagList(items,settings.tagSort,settings.tagDirection);if(tag&&!tags.some(t=>t.key===tag))tag=null;
  $('mini-pin').textContent=settings.floatingOnTop?'置頂 ✓':'置頂';$('mini-pin').setAttribute('aria-pressed',String(settings.floatingOnTop));$('mini-pin').title=settings.floatingOnTop?'目前置頂，點選取消':'目前未置頂，點選啟用';
  const selectedTag=tags.find(t=>t.key===tag);$('mini-drop-hint').textContent=selectedTag?'拖放收藏到「'+selectedTag.name+'」':'拖放檔案／資料夾以收藏';$('mini-drop-hint').title='只儲存位置；保留既有標籤。「全部／未分類」不新增標籤。';
  $('mini-tags').replaceChildren();for(const entry of [{key:null,name:'全部',count:items.length},{key:'',name:'未分類',count:items.filter(i=>!i.tags.length).length},...tags]){const button=node('button',entry.name+' '+entry.count,tag===entry.key?'active':'');button.setAttribute('aria-pressed',String(tag===entry.key));button.addEventListener('click',()=>{tag=entry.key;page=0;render();});$('mini-tags').appendChild(button);}
  const q=$('mini-search').value.trim().toLocaleLowerCase();const found=items.filter(i=>(tag===null||(tag===''?!i.tags.length:i.tags.some(t=>t.toLocaleLowerCase()===tag)))&&(!q||[i.label,i.path,...i.tags].some(t=>t.toLocaleLowerCase().includes(q))));const total=Math.max(1,Math.ceil(found.length/100));page=Math.min(Math.max(0,page),total-1);$('mini-list').replaceChildren();
  for(const item of model.sortItems(found,'name','asc').slice(page*100,page*100+100)){
   const row=node('div',undefined,'mini-row'),name=node('button',undefined,'mini-name'),title=node('span',(settings.floatingView==='icons'?'':item.type==='folder'?'📁 ':'📄 ')+(item.label||model.basename(item.path)),'mini-title'),location=node('small',item.path);name.title=item.path;name.disabled=item.status!=='ready';if(settings.floatingView==='icons')name.appendChild(node('span',item.type==='folder'?'📁':'📄','mini-file-icon'));name.append(title,location);name.addEventListener('click',()=>action(()=>window.favoritesAPI.open(item.id)));
   const show=node('button','⌖');show.title='在檔案總管定位';show.setAttribute('aria-label','定位 '+model.basename(item.path));show.disabled=item.status!=='ready';show.addEventListener('click',()=>action(()=>window.favoritesAPI.show(item.id)));const copy=node('button','⧉');copy.title='複製完整路徑（包含遺失的位置）';copy.setAttribute('aria-label','複製路徑 '+model.basename(item.path));copy.addEventListener('click',()=>action(()=>window.favoritesAPI.copy(item.id),'已複製完整路徑'));if(settings.floatingView==='icons'){const menu=node('details',undefined,'mini-actions'),summary=node('summary','⋯');summary.title='定位／複製路徑';menu.append(summary,show,copy);row.append(name,menu);}else row.append(name,show,copy);$('mini-list').appendChild(row);
  }
  if(!found.length)$('mini-list').appendChild(node('div','沒有符合條件的收藏','mini-empty'));
  $('mini-pager').hidden=settings.floatingPager==='hidden'||(settings.floatingPager!=='always'&&total===1);
  $('mini-main').title=`在主視窗顯示目前標籤 · ${found.length} 項 · 第 ${page+1}/${total} 頁（PageUp／PageDown 換頁）`;
  $('mini-count').textContent=`${found.length} 項 · ${page+1}/${total}`;$('mini-prev').disabled=page===0;$('mini-next').disabled=page===total-1;
 }
 async function refresh(){const request=++revision;try{const [result,prefs]=await Promise.all([window.favoritesAPI.list(),window.desktopAPI.get()]);if(request!==revision)return;items=result.items;settings=prefs;render();}catch(e){$('mini-status').textContent=String(e.message||e);$('mini-status').className='error';}}
 for(const mode of ['list','icons'])$('mini-view-'+mode).addEventListener('click',()=>action(()=>window.desktopAPI.setFloatingView(mode),mode==='icons'?'已切換圖示檢視':'已切換清單檢視'));
 $('mini-tools-toggle').addEventListener('click',()=>action(()=>window.desktopAPI.setFloatingCompact(!settings.floatingCompact),'已切換工具列顯示'));
 $('mini-pin').addEventListener('click',()=>action(()=>window.desktopAPI.togglePin(),result=>result.settings.floatingOnTop?'已設為置頂':'已取消置頂'));$('mini-import').addEventListener('click',()=>action(()=>window.desktopAPI.importPaths(tag),'請在主視窗檢查並匯入路徑'));
 let dragDepth=0;const hideDrop=()=>{dragDepth=0;$('mini-drop').hidden=true;};
 document.addEventListener('dragenter',event=>{if(!event.dataTransfer?.types.includes('Files'))return;event.preventDefault();dragDepth++;$('mini-drop').hidden=false;});
 document.addEventListener('dragover',event=>event.preventDefault());
 document.addEventListener('dragleave',event=>{event.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('mini-drop').hidden=true;});
 document.addEventListener('drop',event=>{event.preventDefault();hideDrop();if(busy)return;const targetTag=tag;action(async()=>{const paths=Array.from(event.dataTransfer?.files||[]).map(file=>window.renameAPI.pathForFile(file)).filter(Boolean);if(!paths.length)throw new Error('無法讀取拖放路徑，請改用匯入路徑');const result=await window.favoritesAPI.collectFloating(paths,targetTag);await refresh();return result;},result=>`已新增 ${result.added} 項、已收藏 ${result.existing} 項${result.issues.length?'；'+result.issues.length+' 項未完成（滑鼠移到訊息查看原因）':''}`);});
 window.addEventListener('blur',hideDrop);
 $('mini-close').addEventListener('click',()=>window.desktopAPI.hideFloating());$('mini-main').addEventListener('click',()=>window.desktopAPI.showMain(tag));$('mini-refresh').addEventListener('click',refresh);$('mini-search').addEventListener('input',()=>{page=0;render();});$('mini-prev').addEventListener('click',()=>{page--;render();});$('mini-next').addEventListener('click',()=>{page++;render();});
 document.addEventListener('keydown',e=>{if(['PageUp','PageDown'].includes(e.key)&&!['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)){e.preventDefault();page+=e.key==='PageDown'?1:-1;render();}if(e.key==='Escape')window.desktopAPI.hideFloating();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('mini-search-bar').hidden=false;$('mini-search').focus();}});
 window.favoritesAPI.onChanged(refresh);window.desktopAPI.onChanged(payload=>{if(payload.settings){settings=payload.settings;render();}});window.addEventListener('focus',refresh);refresh();
})();
