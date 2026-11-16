'use strict';
(() => {
 const $=id=>document.getElementById(id),M=window.everythingQuery;
 const PRESETS=Object.freeze([
  ['recent','最近 7 天修改','dm:7days','all'],['today','今天修改','dm:today','all'],['month','本月修改','dm:thismonth','all'],
  ['video','最近 7 天大型影片','dm:7days size:>200mb','video'],['large','大於 1 GB 的檔案','size:>1gb','file'],
  ['docs','最近 30 天文件','dm:30days','document'],['pdf','所有 PDF','*','pdf'],['images','最近 7 天圖片','dm:7days','picture'],
  ['archives','大型壓縮檔','size:>100mb','compressed'],['code','最近 7 天程式碼','dm:7days','code'],['empty','空檔案（檢視用）','size:0','file'],['folders','最近修改的資料夾','dm:7days','folder']
 ]);
 const CONDITIONS=Object.freeze([['今天修改','dm:today'],['昨天修改','dm:yesterday'],['最近 7 天','dm:7days'],['最近 30 天','dm:30days'],['本月','dm:thismonth'],['大於 200 MB','size:>200mb'],['大於 1 GB','size:>1gb'],['小於 10 MB','size:<10mb'],['PDF / Word','ext:pdf;doc;docx'],['不含隱藏檔','!attrib:h']]);
 const instances=new Map();let profiles=[];
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 function setup({key,text,mode,type,blocked=()=>false,changed=()=>{}}){
  if(instances.has(key))return instances.get(key);
  const input=$(text),modeInput=$(mode),typeInput=$(type);if(!input||!typeInput||!M)return;
  const root=el('details');root.className='everything-workbench';root.append(el('summary','搜尋預設、快速條件與自訂檔案類型'));
  const tools=el('div');tools.className='everything-preset-tools';const presets=el('select');presets.setAttribute('aria-label','搜尋預設');
  for(const [id,label] of PRESETS){const option=el('option',label);option.value=id;presets.append(option);}
  const status=el('p');status.className='rule-hint';status.setAttribute('role','status');
  const button=(label,run)=>{const node=el('button',label);node.type='button';node.className='btn btn-ghost';node.addEventListener('click',()=>{if(blocked())return;status.textContent='';try{Promise.resolve(run()).catch(error=>{status.textContent=String(error.message||error);});}catch(error){status.textContent=String(error.message||error);}});return node;};
  const append=fragment=>{if(modeInput.value==='simple'&&input.value.trim()){const words=input.value.trim().split(/\s+/).map(word=>'"'+word+'"').join(' ');input.value='<'+words+'> '+fragment;}else input.value=input.value.trim()?'<'+input.value.trim()+'> '+fragment:fragment;modeInput.value='syntax';changed();input.focus();};
  tools.append(presets,button('套用預設（取代條件）',()=>{const preset=PRESETS.find(item=>item[0]===presets.value);if(!preset)return;input.value=preset[2];modeInput.value='syntax';typeInput.value=preset[3];syncCustom();changed();status.textContent='已套用「'+preset[1]+'」，儲存或搜尋後生效。';}));root.append(tools);
  const conditions=el('div');conditions.className='everything-condition-chips';for(const [label,fragment] of CONDITIONS)conditions.append(button('＋ '+label,()=>append(fragment)));root.append(conditions);
  const pathTools=el('div');pathTools.className='everything-preset-tools';const path=el('input');path.placeholder='例如 C:\\Work Projects\\';path.setAttribute('aria-label','限定或排除的資料夾路徑');
  const pathFragment=exclude=>{const value=path.value.trim().replace(/^"|"$/g,'');if(!/^(?:[a-z]:\\|\\\\)/i.test(value)||/["\x00-\x1f<>|]/.test(value))throw Error('請輸入完整的 Windows 資料夾路徑');return (exclude?'!':'')+'"'+value.replace(/\\?$/,'\\')+'"';};
  pathTools.append(path,button('限定資料夾',()=>append(pathFragment(false))),button('排除此資料夾',()=>append(pathFragment(true))));root.append(pathTools);
  const custom=el('div');custom.className='everything-custom-types';const extensions=el('input');extensions.id=key+'-extensions';extensions.placeholder='例如 .pdf, docx, xlsx';extensions.maxLength=2048;extensions.setAttribute('aria-label','自訂副檔名');
  const extLabel=el('label','自訂副檔名（逗號、分號或空格分隔）');extLabel.className='field';extLabel.append(extensions);custom.append(extLabel);
  const saved=el('select');saved.setAttribute('aria-label','已儲存的自訂檔案類型');const name=el('input');name.maxLength=50;name.placeholder='類型名稱，例如工作文件';name.setAttribute('aria-label','儲存自訂檔案類型的名稱');
  const savedTools=el('div');savedTools.className='everything-preset-tools';savedTools.append(saved,button('使用此類型',()=>{const profile=profiles.find(item=>item.name===saved.value);if(!profile)throw Error('請先選擇已儲存的類型');typeInput.value='custom';extensions.value=profile.extensions;name.value=profile.name;syncCustom();changed();}),name,button('儲存／更新類型',async()=>{const value=await window.everythingAPI.saveFileType({name:name.value,extensions:extensions.value});syncProfiles(value.fileTypes);status.textContent='已儲存類型；原有追蹤搜尋保留各自的副檔名。';}),button('移除此類型',async()=>{if(!saved.value)throw Error('請先選擇類型');const value=await window.everythingAPI.removeFileType(saved.value);syncProfiles(value.fileTypes);status.textContent='已移除類型；原有追蹤搜尋保留各自的副檔名。';}));custom.append(savedTools,el('p','自訂類型依副檔名篩選。每個追蹤保留自己的清單；更新類型後可重新套用。'));root.append(custom,status);
  const help=el('p','快速條件以 AND 加入並保留原有 OR 分組。日期及大小由本機 Everything 解讀；重複條件可直接在搜尋文字中修改。');help.className='rule-hint';root.append(help);
  const syncCustom=()=>{extLabel.hidden=typeInput.value!=='custom';if(typeInput.value==='custom')root.open=true;};
  typeInput.addEventListener('change',syncCustom);extensions.addEventListener('input',changed);
  const target=key==='everything-rule'?typeInput.closest('.everything-rule-options'):input.closest('form');target.parentElement.insertBefore(root,target.nextSibling);
  const instance={busy:value=>{for(const control of root.querySelectorAll('input,select,button'))control.disabled=value;},get:()=>typeInput.value==='custom'?{extensions:M.normalizeExtensions(extensions.value)}:{},set:query=>{extensions.value=query?.extensions||'';syncCustom();},profiles:()=>{const previous=saved.value;saved.replaceChildren();const empty=el('option','選擇已儲存的自訂類型');empty.value='';saved.append(empty);for(const profile of profiles){const option=el('option',profile.name+'（'+profile.extensions+'）');option.value=profile.name;saved.append(option);}saved.value=profiles.some(item=>item.name===previous)?previous:'';}};
  instances.set(key,instance);instance.profiles();syncCustom();return instance;
 }
 function syncProfiles(value){profiles=Array.isArray(value)?value:[];for(const instance of instances.values())instance.profiles();}
 window.everythingWorkbench=Object.freeze({setup,syncProfiles,busy:(key,value)=>instances.get(key)?.busy(value),get:key=>instances.get(key)?.get()||{},set:(key,query)=>instances.get(key)?.set(query),PRESETS,CONDITIONS});
})();
