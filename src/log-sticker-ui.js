'use strict';

(() => {
 const api=window.logSticker,$=id=>document.getElementById(id);
 let updated=false,changing=false;
 function error(message){const status=$('status');status.hidden=false;status.textContent=message;}
 const report=failure=>error(failure.message);
 function render(data){
  updated=true;
  const heading=$('heading'),style=document.documentElement.style;
  style.setProperty('--sticker-background',data.background);
  style.setProperty('--sticker-foreground',data.foreground);
  heading.textContent=data.heading;
  heading.title=data.heading+' ／ 雙擊'+(data.collapsed?'展開':'收合');
  heading.setAttribute('aria-expanded',String(!data.collapsed));
  $('title').textContent=data.title;
  $('notes').textContent=data.notes;
  $('notes').hidden=!data.notes;
  $('fields').replaceChildren(...data.fields.flatMap(({label,value})=>{
   const name=document.createElement('dt'),text=document.createElement('dd');
   name.textContent=label;text.textContent=value;
   return [name,text];
  }));
  const links=$('links');
  links.replaceChildren(...data.links.map(({label},index)=>{
   const control=document.createElement('button');
   control.type='button';control.className='sticker-link';control.textContent=label;
   control.addEventListener('click',()=>api.openLink(index,data.version).catch(report));
   return control;
  }));
  links.hidden=!data.links.length;
  $('visit').textContent=data.visit;$('visit').hidden=!data.visit;
  $('locate').hidden=!data.locate;
  $('record').hidden=data.collapsed;
  $('status').hidden=true;
 }
 async function toggle(){
  if(changing)return;
  changing=true;
  try{render(await api.toggle());}
  catch(failure){report(failure);}
  finally{changing=false;}
 }
 $('heading').addEventListener('dblclick',toggle);
 $('heading').addEventListener('keydown',event=>{
  if(!['Enter',' '].includes(event.key)||event.repeat)return;
  event.preventDefault();return toggle();
 });
 $('close').addEventListener('click',()=>api.close().catch(report));
 $('visit').addEventListener('click',()=>api.visit().catch(report));
 $('locate').addEventListener('click',()=>api.locate().catch(report));
 api.onChanged(render);
 api.onError(error);
 api.get().then(data=>{if(!updated)render(data);}).catch(report);
})();
