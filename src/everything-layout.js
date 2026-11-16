'use strict';
(() => {
 const defaults={name:280,location:400,size:120,modified:190},columns={name:'name',location:'location',size:'size',modified:'date'};
 let split,widths={...defaults},started=false;
 const prefs=()=>window.settingsUI?.get()||{},save=()=>window.settingsUI?.update({everythingColumnWidths:{...widths}});
 function apply(){const root=document.getElementById('everything-tracking-panel'),table=root.querySelector('table');for(const [key,column] of Object.entries(columns)){const width=widths[key];root.querySelector('.tracking-'+column+'-col').style.width=width+'px';document.getElementById('everything-column-resize-'+key)?.setAttribute('aria-valuenow',String(width));}table.style.width=(Object.values(widths).reduce((a,b)=>a+b,0)+116)+'px';}
 function init(){if(started)return;started=true;const root=document.getElementById('everything-tracking-panel');widths={...defaults,...prefs().everythingColumnWidths};split=window.resizableSplit?.attach(root,{width:prefs().everythingSidebarWidth||240,min:160,max:520,label:'調整追蹤搜尋面板寬度',save:value=>window.settingsUI?.update({everythingSidebarWidth:value})});
  for(const key of Object.keys(columns)){
   const handle=document.createElement('span');handle.id='everything-column-resize-'+key;handle.className='everything-column-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','調整'+({name:'檔案名稱',location:'所在位置',size:'大小',modified:'修改日期'}[key])+'欄寬');handle.setAttribute('aria-valuemin','80');handle.setAttribute('aria-valuemax','1200');handle.title='拖曳調寬度；方向鍵微調；雙擊還原';let drag;
   const set=value=>{widths[key]=Math.round(Math.max(80,Math.min(1200,value)));apply();};
   handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();drag={x:event.clientX,width:widths[key]};handle.setPointerCapture?.(event.pointerId);});
   handle.addEventListener('pointermove',event=>{if(drag)set(drag.width+event.clientX-drag.x);});
   const end=()=>{if(!drag)return;drag=null;save();};handle.addEventListener('pointerup',end);handle.addEventListener('lostpointercapture',end);handle.addEventListener('pointercancel',end);
   handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();set(event.key==='Home'?80:event.key==='End'?1200:widths[key]+(event.key==='ArrowRight'?10:-10));save();});handle.addEventListener('dblclick',event=>{event.stopPropagation();set(defaults[key]);save();});document.getElementById('everything-tracking-sort-'+key).parentElement.append(handle);
  }apply();
 }
 function reset(){widths={...defaults};split?.set(240);apply();window.settingsUI?.update({everythingColumnWidths:{...widths},everythingSidebarWidth:240});}
 function sync(){if(!started)return;widths={...defaults,...prefs().everythingColumnWidths};split?.set(prefs().everythingSidebarWidth||240);apply();}
 window.everythingLayout=Object.freeze({init,reset,sync});
})();
