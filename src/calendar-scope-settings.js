'use strict';
(() => {
 function init(){
  const $=id=>document.getElementById(id),mode=$('calendar-scope-mode'),list=$('calendar-scope-tables'),standalone=$('calendar-scope-standalone'),status=$('calendar-scope-status');
  let sheets=[],selected=new Set(),dirty=false,saving=false,request=0;
  function render(){
   list.hidden=mode.value!=='selected';list.replaceChildren();
   const known=new Set(sheets.map(sheet=>sheet.id));
   for(const sheet of [...sheets,...[...selected].filter(id=>!known.has(id)).map(id=>({id,name:'表格已移除（'+id.slice(0,8)+'）'}))]){
    const label=document.createElement('label'),check=document.createElement('input'),name=document.createElement('span');label.className='check-row';check.type='checkbox';check.value=sheet.id;check.checked=selected.has(sheet.id);name.textContent=(sheet.area?sheet.area+' ／ ':'')+(sheet.parentSheetId?'↳ ':'')+sheet.name;label.append(check,name);list.append(label);
   }
   if(!list.children.length)list.textContent='目前沒有工作區表格。';
  }
  function sync(value){const next=window.calendarScope.normalize(value);mode.value=next.scope;standalone.checked=next.includeStandalone;selected=new Set(next.sheetIds);render();}
  $('calendar-scope-form').addEventListener('change',event=>{dirty=true;if(event.target===mode)render();if(list.contains(event.target)){event.target.checked?selected.add(event.target.value):selected.delete(event.target.value);}status.textContent='有尚未套用的設定。';});
  $('calendar-scope-form').addEventListener('submit',async event=>{
   event.preventDefault();if(saving)return;
   saving=true;$('calendar-scope-form').querySelector('fieldset').disabled=true;
   try{const result=await window.desktopAPI.configure({calendarScope:{scope:mode.value,sheetIds:[...selected],includeStandalone:standalone.checked}});dirty=false;sync(result.settings.calendarScope);status.textContent='已儲存日曆表格範圍。';}
   catch(error){status.textContent=error.message;}
   finally{saving=false;$('calendar-scope-form').querySelector('fieldset').disabled=false;}
  });
  async function refresh(){const version=++request;try{const options=await window.desktopAPI.quickActionOptions();if(version===request){sheets=options.sheets;render();}}catch(error){status.textContent='無法讀取表格：'+error.message;}}
  window.desktopAPI.onChanged(({settings})=>{if(!dirty&&!saving&&settings?.calendarScope)sync(settings.calendarScope);});
  window.workspaceAPI.onChanged(refresh);
  window.desktopAPI.get().then(settings=>{if(!dirty)sync(settings.calendarScope);$('calendar-scope-save').disabled=false;}).catch(error=>status.textContent=error.message);void refresh();
 }
 window.calendarScopeSettingsUI={init};
})();
