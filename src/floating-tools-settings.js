'use strict';
(()=>{
 function mount(root,api){
  let settings,busy=false;const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;},status=node('p');status.setAttribute('role','status');root.append(status);const controls=new Map();
  async function save(patch,kind){if(busy)return;busy=true;try{const result=await (kind?api.patchToolLayout(kind,patch):api.configure(patch));syncSizes(result.settings);status.textContent=result.warning||'設定已儲存';}catch(error){status.textContent=error.message;syncSizes(await api.get());}finally{busy=false;}}
  function select(label,values,change){const row=node('label',label+' '),field=node('select');for(const [value,text]of values){const option=node('option',text);option.value=value;field.append(option);}field.setAttribute('aria-label',label);row.append(field);root.append(row);field.addEventListener('change',()=>change(field.value));return field;}
  for(const [kind,title]of Object.entries(window.floatingToolLayout.TOOLS)){const placement=select(title+'顯示位置',[['quick','獨立視窗'],['pinned','獨立釘選'],['main','只在主程式']],value=>{if(!settings)return;return save({placement:value,...(value==='pinned'?{pinned:true,visible:true}:{visible:false})},kind);});const label=node('label'),topmost=node('input');topmost.type='checkbox';label.append(topmost,node('span',title+'獨立面板保持置頂'));root.append(label);topmost.addEventListener('change',()=>settings&&save({topmost:topmost.checked},kind));const opacity=select(title+'透明度',[[100,'100%'],[95,'95%'],[80,'80%'],[65,'65%']],value=>settings&&save({opacity:Number(value)},kind));controls.set(kind,{placement,topmost,opacity});}
  root.append(node('p','各工具可分別設定面板寬、高，套用於獨立視窗；螢幕較小時會自動縮小。留空則沿用目前尺寸。'));
  const sizes=new Map();
  for(const [kind,title]of Object.entries(window.floatingToolLayout.TOOLS)){
   const group=node('fieldset'),legend=node('legend',title+'面板尺寸');group.append(legend);const fields={};
   for(const [key,label,min,max]of [['width','寬度',380,1600],['height','高度',360,1200]]){const row=node('label',label+' '),field=node('input');field.type='number';field.min=String(min);field.max=String(max);field.step='1';field.placeholder=key==='width'?'420':'520';field.setAttribute('aria-label',title+'面板'+label);row.append(field);group.append(row);fields[key]=field;}
   const apply=node('button','套用尺寸'),reset=node('button','還原自動尺寸');apply.type=reset.type='button';group.append(apply,reset);root.append(group);
   apply.addEventListener('click',()=>{const width=Number(fields.width.value),height=Number(fields.height.value);if(!Number.isInteger(width)||width<380||width>1600||!Number.isInteger(height)||height<360||height>1200){status.textContent='寬度請輸入 380–1600，高度請輸入 360–1200。';return;}if(settings)return save({panelSize:{width,height}},kind);});
   reset.addEventListener('click',()=>settings&&save({panelSize:null},kind));sizes.set(kind,fields);
  }
  if(api.retryShortcuts){const retry=node('button','重新註冊快捷鍵');retry.type='button';retry.addEventListener('click',async()=>{try{const result=await api.retryShortcuts();status.textContent=result.warning||'快捷鍵已重新註冊';}catch(error){status.textContent=error.message;}});root.append(retry);}
  function sync(value){settings=value;root.setAttribute('aria-busy','false');for(const field of root.querySelectorAll('input,select,button'))field.disabled=false;for(const [kind,row]of controls){row.placement.value=value.floatingToolLayout?.[kind]?.placement||'quick';row.topmost.checked=value.floatingToolLayout?.[kind]?.topmost!==false;const opacity=String(value.floatingToolLayout?.[kind]?.opacity||100);if(!Array.from(row.opacity.options||row.opacity.children).some(option=>option.value===opacity)){const option=node('option',opacity+'%');option.value=opacity;row.opacity.append(option);}row.opacity.value=opacity;}}
  const syncBase=sync;function syncSizes(value){syncBase(value);for(const [kind,fields]of sizes)for(const key of ['width','height'])fields[key].value=value.floatingToolLayout?.[kind]?.panelSize?.[key]??'';}
  root.setAttribute('aria-busy','true');for(const field of root.querySelectorAll('input,select,button'))field.disabled=true;api.get().then(syncSizes).catch(error=>status.textContent=error.message);api.onChanged?.(payload=>{if(payload.settings)syncSizes(payload.settings);});return {sync:syncSizes};
 }
 window.floatingToolsSettings={mount};const root=document.getElementById('settings-floating-tool-layout');if(root)mount(root,window.desktopAPI);
})();
