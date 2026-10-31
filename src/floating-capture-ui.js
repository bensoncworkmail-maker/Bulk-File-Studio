'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.captureAPI;let data,token=null,busy=false,completed=false;const getters=[];
 const node=(tag,text)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;},tags=()=>$('capture-tags').value.split(/[,，\n]/).map(tag=>tag.trim()).filter(Boolean);
 function status(message,error=false){$('capture-status').textContent=message;$('capture-status').className=error?'error':'';}
 function lock(value){busy=value;$('capture-spinner').hidden=!value;$('capture-form').setAttribute('aria-busy',String(value));for(const input of $('capture-form').querySelectorAll('input,select,textarea'))input.disabled=value||completed;$('capture-check').disabled=value||!data||completed;$('capture-confirm').disabled=value||!token||completed;$('capture-close').disabled=value;}
 function invalidate(){if(busy||completed)return;token=null;$('capture-preview').hidden=true;$('capture-confirm').disabled=true;status('內容已更新，請先預覽再確認。');}
 function field(item){
  const label=node('label'),caption=node('span',item.label);label.append(caption);let control;
  if(['select','multiselect','relation'].includes(item.type)){
   control=node('select');control.multiple=item.type==='multiselect'||item.type==='relation'&&item.id!==data.parentId;
   if(!control.multiple){const empty=node('option','請選擇');empty.value='';control.append(empty);}
   const choices=item.type==='relation'?(data.relations[item.id]||[]):item.options.map(value=>({id:value,title:value}));for(const option of choices){const entry=node('option',option.title);entry.value=option.id;if(item.id===data.parentId&&option.id===data.masterId)entry.selected=true;control.append(entry);}if(item.id===data.parentId){control.value=data.masterId||'';control.required=true;}
   getters.push({id:item.id,get:()=>control.multiple?Array.from(control.options).filter(option=>option.selected).map(option=>option.value):item.type==='relation'?(control.value?[control.value]:[]):control.value});
   if(control.multiple)label.append(node('small','可按 Ctrl／Command 選擇多項。'));
  }else{
   control=node(item.type==='longtext'?'textarea':'input');control.type=item.type==='checkbox'?'checkbox':item.type==='number'?'number':item.type==='date'?'date':item.type==='email'?'email':'text';if(item.type==='number')control.step='any';if(item.type==='longtext')control.rows=3;control.maxLength=item.type==='longtext'?20000:2000;
   getters.push({id:item.id,get:()=>item.type==='checkbox'?control.checked:item.type==='number'?(control.value===''?'':Number(control.value)):control.value});
  }
  control.setAttribute('aria-label',item.label);label.append(control);$('capture-fields').append(label);
 }
 async function init(){
  try{data=await api.get();document.documentElement.dataset.theme=data.theme;document.documentElement.style.fontSize=(data.fontSize||'13')+'px';$('capture-heading').textContent=data.label;$('capture-tags').value=data.tags.join(', ');const imports=data.kind==='import-paths',drop=data.kind==='drop-records';$('capture-import').hidden=!imports;$('capture-record').hidden=imports;$('capture-context').textContent=imports?'每行一個完整路徑，預覽後才加入收藏。':'新增至：'+data.sheet.name+(drop?' · 每個位置建立一筆紀錄':'');
   if(imports){$('capture-text').value=data.text;$('capture-confirm').textContent='確認匯入';}else{for(const item of data.sheet.fields)field(item);$('capture-title').required=!drop;$('capture-title-label').textContent=drop?'名稱前綴（選填，後接原檔案／資料夾名稱）':'紀錄名稱';}
   $('capture-paths').hidden=!data.paths.length;$('capture-path-count').textContent='拖放位置 · '+data.paths.length+' 項';for(const item of data.paths)$('capture-path-list').append(node('li',item.path));status('請填寫後預覽；確認前不會新增資料。');lock(false);(imports?$('capture-text'):$('capture-title')).focus();
  }catch(error){status(String(error.message||error),true);lock(false);}
 }
 $('capture-form').addEventListener('input',invalidate);$('capture-form').addEventListener('change',invalidate);
 $('capture-form').addEventListener('submit',async event=>{event.preventDefault();if(busy||!data||completed)return;token=null;lock(true);status('正在檢查與產生預覽…');try{const result=await api.preview(data.kind==='import-paths'?{text:$('capture-text').value,tags:tags()}:{title:$('capture-title').value,notes:$('capture-notes').value,tags:tags(),values:Object.fromEntries(getters.map(item=>[item.id,item.get()]))});token=result.token;$('capture-summary').textContent=result.summary;const list=$('capture-preview-list');list.replaceChildren();for(const row of result.rows){const item=node('li'),title=node('strong',row.title),detail=node('small',row.detail);item.append(title,detail);list.append(item);}$('capture-preview').hidden=false;status('請核對預覽，再按確認。');}catch(error){$('capture-preview').hidden=true;status(String(error.message||error),true);}finally{lock(false);}});
 $('capture-confirm').addEventListener('click',async()=>{if(busy||!token||completed)return;lock(true);status('正在儲存，請稍候…');try{const result=await api.commit(token);completed=true;token=null;status(result.message+(result.issues?.length?' '+result.issues.join('；'):''),Boolean(result.issues?.length));$('capture-close').textContent='完成／關閉';}catch(error){token=null;$('capture-preview').hidden=true;status(String(error.message||error),true);}finally{lock(false);}});
 $('capture-close').addEventListener('click',()=>{if(!busy)api.close().catch(error=>status(String(error.message||error),true));});init();
})();
