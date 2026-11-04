'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const auxiliary={
  logs:'浮動紀錄',planning:'浮動日曆／看板與文字片段',
  capture:'浮動新增表單',reminder:'到期強提醒',pdf:'PDF 預覽'
 };
 function init(){
  const root=$('settings-window-sizes');
  if(!root)return;
  const dialogs=[...document.querySelectorAll('dialog[id]')].filter(dialog=>dialog.id!=='operation-dialog');
  const kind=$('window-size-target'),width=$('window-size-width'),height=$('window-size-height');
  const status=$('window-size-status');
  let native={};
  const labelOf=dialog=>$(dialog.getAttribute('aria-labelledby'))?.textContent||
   dialog.querySelector('h2,h3')?.textContent||dialog.id;
  function read(){
   return Object.hasOwn(auxiliary,kind.value)?(native[kind.value]||(kind.value==='planning'?native.snippets:undefined)):window.settingsUI.get().dialogSizes[kind.value];
  }
  function refresh(){
   const size=read();width.value=size?.width||'';height.value=size?.height||'';
   status.textContent=size?'已儲存 '+size.width+' × '+size.height+' px':'使用原始尺寸';
  }
  async function save(key,size){
   if(Object.hasOwn(auxiliary,key)){
    const values={...native};
    if(key==='planning')delete values.snippets;
    if(size)values[key]=size;else delete values[key];
    native=(await window.desktopAPI.configure({toolWindowSizes:values})).settings.toolWindowSizes;
   }else{
    const values={...window.settingsUI.get().dialogSizes};
    if(size)values[key]=size;else delete values[key];
    window.settingsUI.update({dialogSizes:values});
    const dialog=$(key);
    if(dialog?.open)apply(dialog,window.settingsUI.get().dialogSizes[key]);
   }
   refresh();
  }
  for(const [key,label] of [...dialogs.map(dialog=>[dialog.id,labelOf(dialog)]),...Object.entries(auxiliary)]){
   const option=document.createElement('option');option.value=key;option.textContent=label;kind.append(option);
  }
  kind.addEventListener('change',refresh);
  root.addEventListener('toggle',()=>{if(root.open)refresh();});
  $('window-size-save').addEventListener('click',async()=>{
   if(!width.reportValidity()||!height.reportValidity())return;
   try{await save(kind.value,{width:Number(width.value),height:Number(height.value)});}
   catch(error){status.textContent=error.message;}
  });
  $('window-size-reset').addEventListener('click',()=>save(kind.value,null).catch(error=>status.textContent=error.message));
  window.desktopAPI.get().then(settings=>{native=settings.toolWindowSizes||{};refresh();}).catch(error=>status.textContent=error.message);
  window.desktopAPI.onChanged(payload=>{if(payload.settings){
   native=payload.settings.toolWindowSizes||{};
   if(Object.hasOwn(auxiliary,kind.value))refresh();
  }});
  function apply(dialog,size){
   dialog.classList.toggle('dialog-has-size',Boolean(size));
   for(const key of ['width','height']){
    const property='--dialog-saved-'+key;
    if(size)dialog.style.setProperty(property,size[key]+'px');else dialog.style.removeProperty(property);
   }
  }
  for(const dialog of dialogs){
   const grip=document.createElement('button');
   grip.type='button';grip.className='dialog-size-grip';
   grip.title='拖曳調整視窗大小，也可使用方向鍵';
   grip.setAttribute('aria-label','調整'+labelOf(dialog)+'尺寸');
   const row=document.createElement('div');
   row.className='dialog-size-row';
   const footer=dialog.querySelector('.notes-form-footer');
   if(footer)footer.append(grip);
   else{row.append(grip);dialog.append(row);}
   new MutationObserver(()=>{
    if(dialog.open)apply(dialog,window.settingsUI.get().dialogSizes[dialog.id]);
   }).observe(dialog,{attributes:true,attributeFilter:['open']});
   let drag;
   const bounded=(w,h)=>({
    width:Math.round(Math.max(Math.min(280,innerWidth-24),Math.min(innerWidth-24,w))),
    height:Math.round(Math.max(Math.min(180,innerHeight-24),Math.min(innerHeight-24,h)))
   });
   grip.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    event.preventDefault();
    const box=dialog.getBoundingClientRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:box.width,height:box.height,size:null};
    grip.setPointerCapture(event.pointerId);
   });
   grip.addEventListener('pointermove',event=>{
    if(drag?.id!==event.pointerId)return;
    drag.size=bounded(drag.width+2*(event.clientX-drag.x),drag.height+2*(event.clientY-drag.y));
    apply(dialog,drag.size);
   });
   function finish(event){
    if(drag?.id!==event.pointerId)return;
    const {size}=drag;drag=null;
    if(size)save(dialog.id,size).catch(error=>status.textContent=error.message);
   }
   grip.addEventListener('pointerup',finish);grip.addEventListener('lostpointercapture',finish);
   grip.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();
    const box=dialog.getBoundingClientRect(),step=event.shiftKey?40:12;
    const size=bounded(box.width+({ArrowLeft:-step,ArrowRight:step}[event.key]||0),
     box.height+({ArrowUp:-step,ArrowDown:step}[event.key]||0));
    save(dialog.id,size).catch(error=>status.textContent=error.message);
   });
  }
 }
 window.dialogSizesUI={init};
})();
