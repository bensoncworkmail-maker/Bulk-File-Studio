'use strict';
(()=>{
 function create({document,api,dialog,host,status,record,links,remove,onPasted,isEditingBusy}){
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};let pending=[],generation=0,busy=false,renderId=0;const cache=new Map();
  const preview=document.getElementById('notes-image-preview'),large=document.getElementById('notes-image-preview-content');
  const previous=document.getElementById('notes-image-preview-previous');
  const next=document.getElementById('notes-image-preview-next');
  const position=document.getElementById('notes-image-preview-position');
  let viewing=null;

  function displayImage(){
   const {frames,current}=viewing;
   const available=frames.filter(frame=>frame.source);
   const index=available.indexOf(current);
   if(large.firstElementChild?.src!==current.source){
    const image=node('img');
    image.src=current.source;
    image.alt=current.label;
    large.replaceChildren(image);
   }
   position.textContent=(index+1)+' / '+available.length;
   previous.setAttribute('aria-disabled',String(index===0));
   next.setAttribute('aria-disabled',String(index===available.length-1));
  }

  function zoom(frames,current){
   viewing={frames,current};
   displayImage();
   preview.showModal();
  }

  function step(direction){
   if(!viewing||!preview.open)return;
   const available=viewing.frames.filter(frame=>frame.source);
   const target=available[available.indexOf(viewing.current)+direction];
   if(!target)return;
   viewing.current=target;
   displayImage();
  }

  function showFrame(frames,frame,image,placeholder,source){
   frame.source=source;
   image.src=source;
   placeholder.hidden=false;
   if(viewing?.frames===frames&&preview.open)displayImage();
  }

  function render(){
   const request=++renderId;
   host.replaceChildren();
   const saved=links().filter(link=>link.type==='file'&&/[.]png$/i.test(link.path)).slice(0,48);
   const frames=[];
   host.hidden=!saved.length&&!pending.length;

   function figure(label,onRemove){
    const frame={label};
    frames.push(frame);
    const root=node('figure'),button=node('button'),image=node('img'),caption=node('figcaption'),del=node('button','移除');
    button.type=del.type='button';
    button.className='notes-image-zoom';
    image.alt=label;
    root.hidden=true;
    button.append(image);
    button.addEventListener('click',()=>zoom(frames,frame));
    caption.append(node('span',label),del);
    del.addEventListener('click',onRemove);
    root.append(button,caption);
    host.append(root);
    return source=>showFrame(frames,frame,image,root,source);
   }

   const recordId=record();
   if(api.recordImage)for(const [index,link] of saved.entries()){
    const key=recordId+':'+link.index+':'+link.path;
    const show=figure('已儲存圖片 '+(index+1),()=>{remove(link);render();});
    if(cache.has(key)){show(cache.get(key));continue;}
    api.recordImage(recordId,link.index).then(source=>{
     if(request!==renderId)return;
     if(cache.size>=48)cache.clear();
     cache.set(key,source);
     show(source);
    }).catch(()=>{if(request===renderId)status.textContent='部分圖片無法預覽，可從相關位置開啟檔案。';});
   }
   pending.forEach((source,index)=>figure('貼上的圖片 '+(index+1),()=>{pending.splice(index,1);render();})(source));
  }
  async function paste(event){if(event.defaultPrevented||!dialog.open||event.target!==document.getElementById('notes-record-body')&&!event.target?.classList?.contains('notes-longtext-input'))return;const items=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/'));if(!items.length)return;event.preventDefault();event.stopPropagation();if(busy||isEditingBusy?.()){status.textContent='正在處理資料，請稍候再貼上。';return;}if(pending.length+items.length>8){status.textContent='每次最多貼上 8 張圖片。';return;}const files=items.map(item=>item.type==='image/png'&&item.getAsFile());if(files.some(file=>!file||file.size>5*1024*1024)){status.textContent='請貼上 5 MB 以下的 PNG 圖片。';return;}const current=generation;busy=true;status.textContent='正在讀取圖片…';try{const images=[];for(const file of files)images.push(await api.prepareImage(new Uint8Array(await file.arrayBuffer())));if(current!==generation)return;if([...pending,...images].reduce((n,data)=>n+Math.floor((data.length-22)*3/4),0)>20*1024*1024)throw Error('本次貼上圖片合計超過 20 MB');pending.push(...images);render();onPasted?.();status.textContent='圖片已加入，儲存紀錄後保存。';}catch(error){if(current===generation)status.textContent=error.message||String(error);}finally{if(current===generation)busy=false;}}
  dialog.addEventListener('paste',paste);
  previous.addEventListener('click',()=>step(-1));
  next.addEventListener('click',()=>step(1));
  preview.addEventListener('keydown',event=>{
   if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
   if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
   event.preventDefault();
   event.stopPropagation();
   step(event.key==='ArrowLeft'?-1:1);
  });
  document.getElementById('notes-image-preview-close').addEventListener('click',()=>preview.close());
  preview.addEventListener('close',()=>{
   if(preview.open)return;
   viewing=null;
   large.replaceChildren();
   position.textContent='';
  });

  function gallery(parent,item){
   const rows=item.fileLinks.map((link,index)=>({...link,index}))
    .filter(link=>link.type==='file'&&/[.]png$/i.test(link.path)).slice(0,8);
   if(!rows.length||!api.recordImage)return;
   const galleryHost=node('div'),frames=[];
   galleryHost.className='notes-record-images';
   parent.append(galleryHost);
   for(const link of rows){
    const frame={label:'紀錄圖片 '+(frames.length+1)};
    frames.push(frame);
    const button=node('button'),image=node('img');
    button.type='button';
    button.className='notes-image-zoom';
    button.hidden=true;
    button.setAttribute('aria-label','放大'+frame.label);
    image.alt=frame.label;
    button.append(image);
    button.addEventListener('click',()=>zoom(frames,frame));
    galleryHost.append(button);
    api.recordImage(item.id,link.index)
     .then(source=>showFrame(frames,frame,image,button,source)).catch(()=>{});
   }
  }
  const reset=()=>{generation++;renderId++;pending=[];busy=false;cache.clear();host.replaceChildren();host.hidden=true;status.textContent='';};dialog.addEventListener('close',reset);
  return {reset,render,gallery,value:()=>[...pending],isBusy:()=>busy};
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.workspaceImagesUI=api;
})();
