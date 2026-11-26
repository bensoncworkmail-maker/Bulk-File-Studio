'use strict';

(() => {
 const api=window.logSticker,$=id=>document.getElementById(id);
 const format=new Intl.DateTimeFormat('zh-HK',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 let updated=false;
 function render(data){
  updated=true;
  const date=$('date'),toggle=$('toggle');
  date.dateTime=data.updatedAt;
  date.textContent=format.format(new Date(data.updatedAt));
  date.title=data.title;
  $('title').textContent=data.title;
  $('notes').textContent=data.notes;
  $('notes').hidden=!data.notes;
  $('fields').replaceChildren(...data.fields.flatMap(({label,value})=>{
   const name=document.createElement('dt'),text=document.createElement('dd');
   name.textContent=label;text.textContent=value;
   return [name,text];
  }));
  toggle.textContent=data.collapsed?'▸':'▾';
  toggle.setAttribute('aria-expanded',String(!data.collapsed));
  toggle.setAttribute('aria-label',data.collapsed?'展開便條':'收合便條');
  $('record').hidden=data.collapsed;
 }
 function error(message){const status=$('status');status.hidden=false;status.textContent=message;}
 $('toggle').addEventListener('click',()=>api.toggle().then(render).catch(failure=>error(failure.message)));
 $('close').addEventListener('click',()=>api.close().catch(failure=>error(failure.message)));
 $('visit').addEventListener('click',()=>api.visit().catch(failure=>error(failure.message)));
 api.onChanged(render);
 api.onError(error);
 api.get().then(data=>{if(!updated)render(data);}).catch(failure=>error(failure.message));
})();
