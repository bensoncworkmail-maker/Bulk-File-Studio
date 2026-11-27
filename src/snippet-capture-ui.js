'use strict';
(() => {
 const api=window.snippetCaptureAPI,form=document.querySelector('form'),fields=form.querySelector('fieldset');
 const name=document.getElementById('name'),category=document.getElementById('category'),body=document.getElementById('body'),status=document.getElementById('status');
 const showError=error=>{status.textContent=String(error.message||error).replace(/^.*?Error: /,'');};
 const close=()=>void api.close().catch(showError);
 let ready=false,saving=false,originalBody,displayedBody;
 api.get().then(data=>{
  document.documentElement.dataset.theme=data.theme;
  originalBody=data.body;
  body.value=originalBody;
  displayedBody=body.value;
  for(const value of data.categories){
   const option=document.createElement('option');
   option.value=value;
   document.getElementById('categories').append(option);
  }
  ready=true;
  fields.disabled=false;
  name.focus();
 }).catch(error=>{fields.disabled=false;form.querySelector('[type=submit]').disabled=true;showError(error);});

 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!ready||saving)return;
  status.textContent='';
  fields.disabled=true;
  saving=true;
  try{await api.save({name:name.value,category:category.value,body:body.value===displayedBody?originalBody:body.value});}
  catch(error){showError(error);saving=false;fields.disabled=false;}
 });
 document.getElementById('cancel').addEventListener('click',close);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!saving){event.preventDefault();close();}
 });
})();
