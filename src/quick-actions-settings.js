'use strict';
(() => {
 const $=id=>document.getElementById(id),M=window.quickActionsModel;
 function init({showFailure}){
  let actions=[],choices={sheets:[],masters:[]},editing=null,saving=false,dropTarget='',dropMode='favorites',formRows=[];
  const node=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;};
  const sheet=()=>choices.sheets.find(item=>item.id===$('quick-action-sheet').value);
  function masters(value=''){
   const select=$('quick-action-master');select.replaceChildren();const empty=node('option','不預設，在新增表單選擇');empty.value='';select.append(empty);
   for(const item of choices.masters.filter(item=>item.sheetId===sheet()?.parentSheetId)){const option=node('option',item.title);option.value=item.id;select.append(option);}select.value=value;
   $('quick-action-master-field').hidden=$('quick-action-type').value!=='new-record'||!sheet()?.parentSheetId;
  }
  function formFields(form={}){const root=$('quick-form-fields');root.replaceChildren();formRows=[];const all=sheet()?.fields||[],order=[...(form.fieldOrder||[]).map(id=>all.find(field=>field.id===id)).filter(Boolean),...all.filter(field=>!form.fieldOrder?.includes(field.id))];for(const item of order){const row=node('div');row.className='quick-form-row';const visible=node('input');visible.type='checkbox';visible.checked=!form.hiddenFields?.includes(item.id);const label=node('span',item.label),value=node('input');value.type=item.type==='checkbox'?'checkbox':item.type==='number'?'number':item.type==='date'?'date':'text';if(item.type==='number')value.step='any';const initial=form.defaults?.[item.id];if(item.type==='checkbox')value.checked=initial===true;else value.value=Array.isArray(initial)?initial.join(', '):initial??'';value.placeholder=item.type==='multiselect'?'預設值，以逗號分隔':item.type==='relation'?'由所屬主紀錄設定預設':'預設值（選填）';value.disabled=item.type==='relation';value.setAttribute('aria-label',item.label+'預設值');const up=node('button','↑'),down=node('button','↓');up.type=down.type='button';const move=delta=>{const rows=[...root.children],index=rows.indexOf(row),next=index+delta;if(next<0||next>=rows.length)return;[rows[index],rows[next]]=[rows[next],rows[index]];root.replaceChildren(...rows);};up.addEventListener('click',()=>move(-1));down.addEventListener('click',()=>move(1));row.append(visible,label,value,up,down);root.append(row);formRows.push({id:item.id,type:item.type,options:item.options||[],row,visible,value});}}
  function fields(){const imports=$('quick-action-type').value==='import-paths';const type=$('quick-action-type').value,table=['new-record','open-sheet'].includes(type);$('quick-action-page-field').hidden=type!=='open-page';$('quick-action-form-config').hidden=type!=='new-record';$('quick-action-table-fields').hidden=!table;$('quick-action-import-fields').hidden=!imports;masters();formFields();}
  function edit(action){
   editing=action?.id||null;$('quick-action-label').value=action?.label||'';$('quick-action-type').value=action?.type||'new-record';$('quick-action-sheet').value=action?.sheetId||choices.sheets[0]?.id||'';
   $('quick-action-tags').value=(action?.tags||[]).join(', ');$('quick-action-clipboard').checked=action?.useClipboard===true;fields();masters(action?.masterId||'');$('quick-action-page').value=action?.page||'home';$('quick-form-tags').value=(action?.tags||[]).join(', ');$('quick-form-columns').value=String(action?.form?.columns||2);$('quick-form-width').value=String(action?.form?.width||480);$('quick-form-height').value=String(action?.form?.height||650);formFields(action?.form||{});$('quick-action-editor').open=true;$('quick-action-label').focus();
  }
  async function persist(next){
   if(saving)return false;saving=true;render();try{const result=await window.desktopAPI.configure({floatingQuickActions:M.normalize(next,true)});actions=result.settings.floatingQuickActions||[];return true;}
   catch(error){showFailure('無法儲存浮動快捷動作',error);return false;}finally{saving=false;render();}
  }
  function actionButton(text,run){const button=node('button',text);button.type='button';button.className='btn btn-ghost';button.disabled=saving;button.addEventListener('click',run);return button;}
  function dropOptions(){
   const select=$('quick-action-drop-target');select.replaceChildren();const empty=node('option',dropMode==='records'?'請選擇新增紀錄快捷動作':'目前標籤／不指定表格');empty.value='';select.append(empty);
   const allowed=actions.filter(item=>item.enabled&&['new-record','import-paths'].includes(item.type)&&(dropMode!=='records'||item.type==='new-record')&&(dropMode!=='import'||item.type==='import-paths'));for(const item of allowed){const option=node('option',item.label+' · '+M.TYPES[item.type]);option.value=item.id;select.append(option);}
   if(dropTarget&&!allowed.some(item=>item.id===dropTarget)){const missing=node('option','原設定與用途不符或已停用，請重新選擇');missing.value=dropTarget;select.append(missing);}select.value=dropTarget;select.disabled=saving||['favorites','ask'].includes(dropMode);
  }
  function render(){dropOptions();
   const root=$('quick-action-list');root.replaceChildren();for(const [index,item] of actions.entries()){
    const row=node('div');row.className='quick-action-row';const enabled=node('input');enabled.type='checkbox';enabled.checked=item.enabled;enabled.disabled=saving;enabled.setAttribute('aria-label','啟用 '+item.label);enabled.addEventListener('change',()=>persist(actions.map(value=>value.id===item.id?{...value,enabled:enabled.checked}:value)));
    const label=node('div'),name=node('strong',item.label),target=choices.sheets.find(sheet=>sheet.id===item.sheetId);label.append(name,node('small',M.TYPES[item.type]+' · '+(item.type==='import-paths'?(item.tags.join('、')||'不預設標籤'):(item.type==='open-page'?item.page:['share-check','share-publish'].includes(item.type)?'依共享設定範圍':target?target.area+' ／ '+target.name:'表格已移除，請重新選擇'))));
    const up=actionButton('↑',()=>{if(index===0)return;const next=[...actions];[next[index-1],next[index]]=[next[index],next[index-1]];return persist(next);});up.disabled=saving||index===0;up.setAttribute('aria-label','上移 '+item.label);
    const down=actionButton('↓',()=>{if(index===actions.length-1)return;const next=[...actions];[next[index+1],next[index]]=[next[index],next[index+1]];return persist(next);});down.disabled=saving||index===actions.length-1;down.setAttribute('aria-label','下移 '+item.label);
    row.append(enabled,label,actionButton('編輯',()=>edit(item)),up,down,actionButton('移除',()=>persist(actions.filter(value=>value.id!==item.id))));root.append(row);
   }
   if(!actions.length)root.append(node('p','尚無快捷動作。可新增指定表格、開啟表格或套用標籤的路徑匯入。'));
   $('quick-action-add').disabled=saving||actions.length>=M.LIMIT;$('quick-action-save').disabled=saving;$('quick-action-refresh').disabled=saving;
  }
  async function refresh(){
   try{const [settings,data]=await Promise.all([window.desktopAPI.get(),window.desktopAPI.quickActionOptions()]);actions=settings.floatingQuickActions||[];dropTarget=settings.floatingDropActionId||'';dropMode=settings.floatingDropMode||'favorites';choices=data;const selected=$('quick-action-sheet').value;const select=$('quick-action-sheet');select.replaceChildren();for(const item of choices.sheets){const option=node('option',item.area+' ／ '+item.name);option.value=item.id;select.append(option);}select.value=choices.sheets.some(item=>item.id===selected)?selected:choices.sheets[0]?.id||'';masters();render();}
   catch(error){$('quick-action-status').textContent=String(error.message||error);}
  }
  $('quick-action-drop-target').addEventListener('change',async()=>{if(saving)return;try{const result=await window.desktopAPI.configure({floatingDropActionId:$('quick-action-drop-target').value});dropTarget=result.settings.floatingDropActionId||'';$('quick-action-drop-status').textContent='拖放目標已儲存。';dropOptions();}catch(error){showFailure('拖放設定未完成',error);dropOptions();}});
  $('quick-action-add').addEventListener('click',()=>edit());$('quick-action-type').addEventListener('change',fields);$('quick-action-sheet').addEventListener('change',()=>{masters();formFields();});$('quick-action-refresh').addEventListener('click',refresh);
  $('quick-action-save').addEventListener('click',async()=>{
   if(saving)return;const type=$('quick-action-type').value,input={id:editing||crypto.randomUUID(),label:$('quick-action-label').value,type,enabled:actions.find(item=>item.id===editing)?.enabled!==false};
   if(type==='import-paths'){input.tags=$('quick-action-tags').value.split(/[,，\n]/).map(value=>value.trim()).filter(Boolean);input.useClipboard=$('quick-action-clipboard').checked;}
   else if(type==='open-page')input.page=$('quick-action-page').value;else if(['share-check','share-publish'].includes(type)){}else{input.sheetId=$('quick-action-sheet').value;if(type==='new-record'&&sheet()?.parentSheetId&&$('quick-action-master').value)input.masterId=$('quick-action-master').value;}
   if(type==='new-record'){const defaults={};for(const item of formRows){if(item.type==='relation')continue;const value=item.type==='checkbox'?item.value.checked:item.type==='number'?(item.value.value===''?'':Number(item.value.value)):item.type==='multiselect'?item.value.value.split(/[,，]/).map(text=>text.trim()).filter(Boolean):item.value.value;if(item.type==='select'&&value!==''&&!item.options.includes(value)||item.type==='multiselect'&&value.some(option=>!item.options.includes(option))){showFailure('預設值無效','請使用欄位已有的選項');return;}if(value!==''&&(!Array.isArray(value)||value.length))defaults[item.id]=value;}input.form={columns:Number($('quick-form-columns').value),width:Number($('quick-form-width').value),height:Number($('quick-form-height').value),fieldOrder:[...$('quick-form-fields').children].map(row=>formRows.find(item=>item.row===row).id),hiddenFields:formRows.filter(item=>!item.visible.checked).map(item=>item.id),defaults};input.tags=$('quick-form-tags').value.split(/[,，]/).map(tag=>tag.trim()).filter(Boolean);}
   try{const clean=M.normalize([input],true)[0],next=editing?actions.map(item=>item.id===editing?clean:item):[...actions,clean];if(editing&&!next.some(item=>item.id===editing))next.push(clean);if(await persist(next)){$('quick-action-editor').open=false;editing=null;$('quick-action-status').textContent='快捷動作已儲存，浮動工具同步更新。';}}
   catch(error){showFailure('快捷動作設定未完成',error);}
  });
  window.desktopAPI.onChanged(payload=>{if(payload.settings){actions=payload.settings.floatingQuickActions||[];dropTarget=payload.settings.floatingDropActionId||'';dropMode=payload.settings.floatingDropMode||'favorites';render();}});render();refresh();
 }
 window.quickActionsSettingsUI=Object.freeze({init});
})();
