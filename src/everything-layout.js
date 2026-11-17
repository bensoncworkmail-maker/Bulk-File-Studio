'use strict';
(() => {
 const M=window.everythingResultColumns,defaults=M?.widths()||{name:280,location:400,size:120,modified:190};
 const definitions=M?.COLUMNS||{name:{label:'檔案名稱'},location:{label:'所在位置'},size:{label:'大小'},modified:{label:'修改日期'}};
 let split,widths={...defaults},started=false;
 const prefs=()=>window.settingsUI?.get()||{},save=()=>window.settingsUI?.update({everythingColumnWidths:{...widths}});
 const shown=()=>M?M.normalizeColumns(prefs().everythingColumns):Object.keys(definitions),columnClass=key=>key==='modified'?'date':key;
 function apply(){
  const root=document.getElementById('everything-tracking-panel'),table=root.querySelector('table'),visible=shown();
  for(const key of Object.keys(definitions)){const col=root.querySelector('.tracking-'+columnClass(key)+'-col'),head=document.getElementById('everything-tracking-sort-'+key)?.parentElement;if(!col||!head)continue;col.style.width=widths[key]+'px';col.hidden=head.hidden=!visible.includes(key);document.getElementById('everything-column-resize-'+key)?.setAttribute('aria-valuenow',String(widths[key]));}
  const showCopy=prefs().everythingShowCopy!==false;
  root.querySelector('.tracking-copy-col').hidden=document.getElementById('everything-tracking-copy-header').hidden=!showCopy;
  table.style.width=(visible.reduce((sum,key)=>sum+widths[key],0)+38+(showCopy?78:0))+'px';
  for(const cell of root.querySelectorAll('td[data-column]'))cell.hidden=!visible.includes(cell.getAttribute('data-column'));
 }
 function fit(key){
  const root=document.getElementById('everything-tracking-panel'),header=document.getElementById('everything-tracking-sort-'+key);if(!header)return;
  // Measure literal text, including CJK and non-BMP characters, without opening files or changing selection.
  const canvas=document.createElement('canvas'),context=canvas.getContext?.('2d'),style=window.getComputedStyle?.(header);if(context&&style)context.font=style.font;
  const measure=text=>context?context.measureText(text).width:[...text].reduce((sum,char)=>sum+(char.codePointAt(0)>255?14:8),0);
  const values=[definitions[key].label,...[...root.querySelectorAll('td[data-column]')].filter(cell=>cell.getAttribute('data-column')===key).map(cell=>cell.textContent)];
  return Math.round(Math.max(80,Math.min(1200,Math.max(...values.map(measure))+36)));
 }
 function autoSize(key){for(const name of key?[key]:shown()){const width=fit(name);if(width)widths[name]=width;}apply();save();}
 function init(){
  if(started)return;started=true;const root=document.getElementById('everything-tracking-panel');widths={...defaults,...prefs().everythingColumnWidths};split=window.resizableSplit?.attach(root,{width:prefs().everythingSidebarWidth||240,min:160,max:520,label:'調整追蹤搜尋面板寬度',save:value=>window.settingsUI?.update({everythingSidebarWidth:value})});
  for(const [key,column] of Object.entries(definitions)){
   const header=document.getElementById('everything-tracking-sort-'+key);if(!header)continue;
   const handle=document.createElement('span');handle.id='everything-column-resize-'+key;handle.className='everything-column-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','調整'+column.label+'欄寬');handle.setAttribute('aria-valuemin','80');handle.setAttribute('aria-valuemax','1200');handle.title='拖曳調寬度；方向鍵微調；雙擊自動調整';let drag;
   const set=value=>{widths[key]=Math.round(Math.max(80,Math.min(1200,value)));apply();};
   handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();drag={x:event.clientX,width:widths[key]};handle.setPointerCapture?.(event.pointerId);});handle.addEventListener('pointermove',event=>{if(drag)set(drag.width+event.clientX-drag.x);});
   const end=()=>{if(!drag)return;drag=null;save();};for(const name of ['pointerup','lostpointercapture','pointercancel'])handle.addEventListener(name,end);
   handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();set(event.key==='Home'?80:event.key==='End'?1200:widths[key]+(event.key==='ArrowRight'?10:-10));save();});handle.addEventListener('dblclick',event=>{event.stopPropagation();autoSize(key);});header.parentElement.append(handle);
  }apply();
 }
 function reset(){widths={...defaults};split?.set(240);apply();window.settingsUI?.update({everythingColumnWidths:{...widths},everythingSidebarWidth:240});}
 function sync(){if(!started)return;widths={...defaults,...prefs().everythingColumnWidths};split?.set(prefs().everythingSidebarWidth||240);apply();}
 window.everythingLayout=Object.freeze({init,reset,sync,apply,autoSize});
})();
