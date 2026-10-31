'use strict';
(() => {
 function create({dialog,title,detail,list,root,activeElement=()=>null,schedule=setTimeout,cancel=clearTimeout,delay=180,isVisible=()=>true}){
  const tasks=new Map();let showTimer,hideTimer,previous;
  function render(){
   const values=[...tasks.values()];title.textContent=values.at(-1)?.title||'正在完成畫面更新…';
   detail.textContent=values.length>1?'另有 '+(values.length-1)+' 項操作執行中；完成後自動關閉。':values.at(-1)?.detail||'處理中，請稍候。完成後自動關閉。';
   list.replaceChildren();for(const item of values.slice(-5)){const row=list.ownerDocument.createElement('li');row.textContent=item.title;list.appendChild(row);}list.hidden=values.length<2;
  }
  function show(){showTimer=undefined;if(!tasks.size||!isVisible())return;previous=activeElement();render();if(!dialog.open)dialog.showModal();}
  function close(){hideTimer=undefined;if(tasks.size)return;if(dialog.open)dialog.close();root.setAttribute('aria-busy','false');if(previous?.isConnected!==false&&!previous?.disabled)previous?.focus?.();previous=null;}
  function receive(event){
   if(!event||!['start','end'].includes(event.type))return;
   if(event.type==='start'){
    if(typeof event.title!=='string')return;tasks.set(event.id,{title:event.title,detail:event.detail});cancel(hideTimer);hideTimer=undefined;root.setAttribute('aria-busy','true');
    if(dialog.open)render();else if(showTimer===undefined)showTimer=schedule(show,delay);
   }else{
    tasks.delete(event.id);if(tasks.size){if(dialog.open)render();return;}cancel(showTimer);showTimer=undefined;
    if(dialog.open){render();hideTimer=schedule(close,100);}else close();
   }
  }
  function visibilityChanged(){if(!isVisible()){cancel(showTimer);showTimer=undefined;if(dialog.open)dialog.close();previous=null;}else if(tasks.size&&!dialog.open&&showTimer===undefined)showTimer=schedule(show,delay);}
  dialog.addEventListener('cancel',event=>{if(tasks.size||dialog.open)event.preventDefault();});
  return Object.freeze({receive,visibilityChanged,pending:()=>tasks.size});
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={create};
 else if(window.operationAPI){const $=id=>document.getElementById(id);if($('operation-dialog')){const controller=create({dialog:$('operation-dialog'),title:$('operation-title'),detail:$('operation-detail'),list:$('operation-list'),root:document.querySelector('.app-shell')||$('mini-list')||document.body,activeElement:()=>document.activeElement,isVisible:()=>document.documentElement.dataset.collapsed!=='true'});window.operationAPI.onChange(controller.receive);if(typeof MutationObserver!=='undefined')new MutationObserver(controller.visibilityChanged).observe(document.documentElement,{attributes:true,attributeFilter:['data-collapsed']});}}
})();
