'use strict';
(() => {
 const {PANELS,FILES_LABEL,normalize}=window.floatingPanelsModel;
 const $=id=>document.getElementById(id);
 function init(){
  const form=$('floating-panel-settings'),list=$('floating-panel-options'),initial=$('floating-panel-default');
  const collapsed=$('floating-panel-collapsed'),mode=$('floating-panel-calendar-mode');
  const layout=$('floating-panel-snippet-layout');
  const query=$('floating-panel-snippet-query'),status=$('floating-panel-settings-status');
  const fields=form.querySelector('fieldset');
  let draft=normalize(),dirty=false,saving=false,last;
  function edit(){dirty=true;status.textContent='有尚未套用的設定。';}
  function selectOptions(){
   initial.replaceChildren();
   for(const id of ['files',...draft.order.filter(id=>draft.enabled.includes(id))]){
    const option=document.createElement('option');option.value=id;
    option.textContent=id==='files'?FILES_LABEL:PANELS[id];initial.append(option);
   }
   initial.value=draft.defaultPanel;
  }
  function rows(focus){
   list.replaceChildren();
   draft.order.forEach((id,index)=>{
    const row=document.createElement('div'),label=document.createElement('label');
    const check=document.createElement('input'),name=document.createElement('span');
    row.className='floating-panel-setting-row';label.className='check-row';
    check.type='checkbox';check.checked=draft.enabled.includes(id);name.textContent=PANELS[id];
    check.addEventListener('change',()=>{
     if(check.checked)draft.enabled.push(id);
     else draft.enabled=draft.enabled.filter(value=>value!==id);
     if(!draft.enabled.includes(draft.defaultPanel))draft.defaultPanel='files';
     selectOptions();edit();
    });
    label.append(check,name);row.append(label);
    for(const [offset,text] of [[-1,'上移'],[1,'下移']]){
     const button=document.createElement('button');button.type='button';button.className='btn btn-ghost';
     button.textContent=text;button.setAttribute('aria-label',PANELS[id]+' '+text);
     const target=index+offset;button.disabled=target<0||target>=draft.order.length;
     button.addEventListener('click',()=>{
      [draft.order[index],draft.order[target]]=[draft.order[target],draft.order[index]];
      selectOptions();rows(id);edit();
     });
     row.append(button);
    }
    list.append(row);
    if(focus===id)check.focus();
   });
  }
  function receive(settings){
   if(!settings||saving||dirty)return;
   const next=normalize(settings.floatingPanels),signature=JSON.stringify(next);
   if(last===signature)return;
   draft=next;last=signature;
   rows();selectOptions();
   collapsed.checked=draft.collapsedMenu;mode.value=draft.planningMode;query.value=draft.snippetQuery;layout.value=draft.snippetLayout;
   fields.disabled=false;
  }
  initial.addEventListener('change',()=>{draft.defaultPanel=initial.value;edit();});
  for(const control of [collapsed,mode,query,layout])control.addEventListener('input',edit);
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(saving)return;
   const value={...draft,collapsedMenu:collapsed.checked,planningMode:mode.value,snippetQuery:query.value,snippetLayout:layout.value};
   saving=true;fields.disabled=true;
   try{
    const result=await window.desktopAPI.configure({floatingPanels:value});
    saving=false;dirty=false;last=undefined;receive(result.settings);
    status.textContent='浮動內容設定已儲存。';
   }catch(error){status.textContent=error.message;}
   finally{saving=false;fields.disabled=false;}
  });
  window.desktopAPI.onChanged(({settings})=>receive(settings));
  window.desktopAPI.get().then(receive).catch(error=>status.textContent=error.message);
 }
 window.floatingPanelsSettings={init};
})();
