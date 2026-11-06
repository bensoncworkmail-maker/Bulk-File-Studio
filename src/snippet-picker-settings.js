'use strict';
(() => {
 const M=window.snippetPickerModel,$=id=>document.getElementById(id);
 function init(){
  const form=$('snippet-picker-settings'),fieldset=form.querySelector('fieldset'),status=$('snippet-picker-settings-status');
  const controls=Object.fromEntries(Object.keys(M.DEFAULTS).map(key=>[key,$('snippet-picker-'+key)]));
  let dirty=false,saving=false;
  function receive(settings){if(!settings||dirty||saving)return;const prefs=M.normalize(settings.snippetPicker);for(const [key,control] of Object.entries(controls))if(typeof prefs[key]==='boolean'&&control.type==='checkbox')control.checked=prefs[key];else control.value=String(prefs[key]);fieldset.disabled=false;}
  for(const control of Object.values(controls))control.addEventListener('input',()=>{dirty=true;status.textContent='有尚未套用的設定。';});
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(saving)return;
   try{
    const value=M.normalize(Object.fromEntries(Object.entries(controls).map(([key,control])=>[key,typeof M.DEFAULTS[key]==='boolean'?(control.type==='checkbox'?control.checked:control.value==='true'):typeof M.DEFAULTS[key]==='number'?Number(control.value):control.value])),true);
    saving=true;fieldset.disabled=true;
    const result=await window.desktopAPI.configure({snippetPicker:value});
    dirty=false;saving=false;receive(result.settings);status.textContent='已儲存，下次開啟片段選擇窗時生效。';
   }catch(error){status.textContent=error.message;}
   finally{saving=false;fieldset.disabled=false;}
  });
  $('snippet-picker-reset-groups').addEventListener('click',async()=>{
   if(saving)return;saving=true;fieldset.disabled=true;
   try{await window.desktopAPI.resetSnippetPickerGroups();status.textContent='已清除分類記憶；下次依預設展開狀態顯示。'+(dirty?' 版面變更仍需套用。':'');}
   catch(error){status.textContent=error.message;}
   finally{saving=false;fieldset.disabled=false;}
  });
  window.desktopAPI.onChanged(({settings})=>receive(settings));
  window.desktopAPI.get().then(receive).catch(error=>{status.textContent=error.message;});
 }
 window.snippetPickerSettings={init};
})();
