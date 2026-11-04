'use strict';
(() => {
 const $=id=>document.getElementById(id);

 function init(){
  const form=$('log-settings-form'),scope=$('log-settings-scope'),tables=$('log-settings-tables');
  const layout=$('log-settings-layout'),sort=$('log-settings-sort'),status=$('log-settings-status');
  const save=$('log-settings-save');
  let saved,available=[],selected=new Set(),dirty=false,saving=false,request=0;

  function renderTables(){
   tables.hidden=scope.value!=='selected';
   const known=new Set(available.map(sheet=>sheet.id));
   const missing=[...selected].filter(id=>!known.has(id)).map(id=>({id,name:'表格已移除（'+id.slice(0,8)+'）'}));
   tables.replaceChildren();
   for(const sheet of [...available,...missing]){
    const label=document.createElement('label'),check=document.createElement('input'),name=document.createElement('span');
    label.className='check-row';
    check.type='checkbox';check.value=sheet.id;check.checked=selected.has(sheet.id);
    name.textContent=(sheet.parentSheetId?'↳ ':'')+sheet.name;
    label.append(check,name);
    tables.append(label);
   }
   if(!tables.children.length)tables.textContent='目前沒有可選的工作區表格。';
  }

  function sync(value){
   saved=value;
   scope.value=value.scope;layout.value=value.layout;sort.value=value.sort;
   selected=new Set(value.sheetIds);
   renderTables();
  }

  form.addEventListener('change',event=>{
   dirty=true;
   if(event.target===scope)renderTables();
   if(event.target.type==='checkbox'){
    const {checked,value}=event.target;
    if(checked)selected.add(value);else selected.delete(value);
   }
   status.textContent='有尚未套用的設定。';
  });

  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(saving||!saved)return;
   if(scope.value==='selected'&&!available.some(sheet=>selected.has(sheet.id))){
    status.textContent='請勾選至少一個可用表格。';
    return;
   }
   const logView={scope:scope.value,sheetIds:[...selected],layout:layout.value,sort:sort.value};
   saving=true;form.querySelector('fieldset').disabled=true;
   try{
    const result=await window.desktopAPI.configure({logView});
    dirty=false;
    sync(result.settings.logView);
    status.textContent='已儲存查看紀錄設定。';
   }catch(error){status.textContent=error.message;}
   finally{saving=false;form.querySelector('fieldset').disabled=false;}
  });

  async function refreshTables(){
   const version=++request;
   try{
    const options=await window.desktopAPI.quickActionOptions();
    if(version!==request)return;
    available=options.sheets;
    renderTables();
   }catch(error){
    if(version===request)status.textContent='無法讀取表格清單：'+error.message;
   }
  }

  window.desktopAPI.onChanged(({settings})=>{
   if(!settings?.logView||saving)return;
   if(!dirty)sync(settings.logView);
   else if(JSON.stringify(saved)!==JSON.stringify(settings.logView)){
    status.textContent='已儲存的設定有變更。目前的草稿已保留。';
   }
  });
  window.workspaceAPI.onChanged(refreshTables);
  window.desktopAPI.get().then(settings=>{
   if(!dirty&&!saved)sync(settings.logView);
   save.disabled=false;
  }).catch(error=>status.textContent=error.message);
  refreshTables();
 }

 window.logViewSettingsUI={init};
})();
