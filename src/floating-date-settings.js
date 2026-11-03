'use strict';
(() => {
 const $=id=>document.getElementById(id),P=globalThis.searchDatePresets;
 function init(){
  let saved=P.normalize(),draft=P.normalize(),dirty=false,saving=false,ready=false,generation=0;
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const status=message=>{$('floating-date-status').textContent=message;};
  function changed(){dirty=true;status('有尚未儲存的日期快捷按鈕。');}
  function control(text,action,disabled=false){const el=node('button',text);el.type='button';el.className='btn btn-ghost';el.disabled=saving||!ready||disabled;el.addEventListener('click',action);return el;}
  function field(row,label,key,type='text',limits={}){const wrap=node('label'),input=node('input');wrap.className='field';input.type=type;input.value=row[key]??'';input.disabled=saving;input.setAttribute('aria-label',label);for(const [name,value] of Object.entries(limits))input.setAttribute(name,String(value));input.addEventListener('input',()=>{row[key]=type==='number'?(input.value===''?NaN:Number(input.value)):input.value;changed();});wrap.append(node('span',label),input);return wrap;}
  function render(){
   const root=$('floating-date-list');root.replaceChildren();
   draft.forEach((row,index)=>{
    const article=node('article'),head=node('div'),checkLabel=node('label'),check=node('input');article.className='date-preset-row';head.className='date-preset-heading';checkLabel.className='check-row';check.type='checkbox';check.checked=row.enabled;check.disabled=saving;check.setAttribute('aria-label','顯示 '+row.label);check.addEventListener('change',()=>{row.enabled=check.checked;changed();});checkLabel.append(check,node('span','顯示'));head.append(checkLabel,field(row,'按鈕名稱','label','text',{maxlength:24}));
    const typeLabel=node('label'),type=node('select');typeLabel.className='field';type.setAttribute('aria-label','日期範圍類型');type.disabled=saving;for(const [key,label] of Object.entries(P.TYPES)){const option=node('option',label);option.value=key;type.append(option);}type.value=row.type;type.addEventListener('change',()=>{row.type=type.value;if(row.type==='last-days'&&!Number.isInteger(row.days))row.days=7;if(row.type==='relative'){if(!Number.isInteger(row.fromOffset))row.fromOffset=-6;if(!Number.isInteger(row.toOffset))row.toOffset=0;}if(row.type==='fixed'){const today=P.range({id:'today',label:'今天',type:'today'}).modifiedFrom;row.from=row.from||today;row.to=row.to||today;}changed();render();});typeLabel.append(node('span','日期範圍類型'),type);head.append(typeLabel);
    const actions=node('div');actions.className='date-preset-actions';for(const [label,delta] of [['↑',-1],['↓',1]]){const button=control(label,()=>{const target=index+delta;[draft[index],draft[target]]=[draft[target],draft[index]];changed();render();},index+delta<0||index+delta>=draft.length);button.setAttribute('aria-label',(delta<0?'上移 ':'下移 ')+row.label);actions.append(button);}actions.append(control('移除',()=>{draft.splice(index,1);changed();render();}));head.append(actions);article.append(head);
    const values=node('div');values.className='settings-inline';if(row.type==='last-days')values.append(field(row,'天數（含今天）','days','number',{min:1,max:P.DAY_LIMIT,step:1}));
    if(row.type==='relative'){values.append(field(row,'起日：相對今天幾天','fromOffset','number',{min:-P.DAY_LIMIT,max:P.DAY_LIMIT,step:1}),field(row,'迄日：相對今天幾天','toOffset','number',{min:-P.DAY_LIMIT,max:P.DAY_LIMIT,step:1}));article.append(node('p','0 是今天，-1 是昨天。例如 -13 至 0，代表含今天的最近 14 天。','notes-hint'));}
    if(row.type==='fixed')values.append(field(row,'起日','from','date'),field(row,'迄日（包含當天）','to','date'));
    article.append(values);root.append(article);
   });
   if(!draft.length)root.append(node('p','沒有快捷按鈕；儲存後會隱藏浮動面板的日期快捷列。'));
   $('floating-date-add').disabled=saving||!ready||draft.length>=P.LIMIT;for(const id of ['floating-date-save','floating-date-reset','floating-date-reload'])$(id).disabled=saving||!ready;
  }
  function apply(values){saved=P.normalize(values.floatingSearchDatePresets);draft=P.normalize(saved);dirty=false;ready=true;render();}
  async function load(){const version=++generation;try{const prefs=await window.desktopAPI.get();if(version!==generation)return;apply(prefs);status('最多 12 個按鈕。調整後按「儲存日期快捷按鈕」套用。');}catch(error){status(String(error.message||error));$('floating-date-reload').disabled=false;}}
  $('floating-date-add').addEventListener('click',()=>{if(saving||!ready||draft.length>=P.LIMIT)return;draft.push({id:crypto.randomUUID(),label:'最近 14 天',type:'last-days',days:14,enabled:true});changed();render();});
  $('floating-date-reset').addEventListener('click',()=>{if(saving)return;draft=P.normalize();changed();render();status('已還原預設草稿；按儲存才套用。');});
  $('floating-date-reload').addEventListener('click',load);
  $('floating-date-save').addEventListener('click',async()=>{if(saving||!ready)return;try{const clean=P.normalize(draft,true);saving=true;render();const result=await window.desktopAPI.configure({floatingSearchDatePresets:clean});apply(result.settings);status('日期快捷按鈕已儲存；已開啟的浮動搜尋面板會同步更新，現有搜尋日期保持不變。');}catch(error){status(String(error.message||error));}finally{saving=false;render();}});
  window.desktopAPI.onChanged(payload=>{if(!payload.settings)return;++generation;const next=P.normalize(payload.settings.floatingSearchDatePresets);if(dirty){if(JSON.stringify(next)!==JSON.stringify(saved))status('已儲存的按鈕有變更；目前草稿已保留，按儲存套用或重新讀取。');return;}apply(payload.settings);});render();load();
 }
 window.floatingDateSettingsUI=Object.freeze({init});
})();
