'use strict';

(() => {
 const $=id=>document.getElementById(id),api=window.stickersAPI;
 if(!api)return;
 const sources=['workspace','tracking','favorites','draft'];
 const dimensions=['width','height','collapsedWidth','collapsedHeight'];
 let saved,draft,tables=[],pending=false,request=0;
 const status=text=>{$('sticker-settings-status').textContent=text;};
 function enabled(source){return saved?.sources[source]!==false;}
 function pin(source,input){return api.pin(source,input);}
 async function pinTag(scope,tag,callbacks){
  try{
   await pin(scope==='tracking'?'tracking':'favorites',{kind:'tag',scope,tag});
   callbacks.showToast('已顯示標籤便條');
  }catch(error){callbacks.showFailure('無法釘選標籤便條',error);}
 }
 function choices(select,items,value){
  select.replaceChildren();
  for(const {id,label} of items){
   const option=document.createElement('option');
   option.value=id;option.textContent=label;select.append(option);
  }
  select.value=items.some(item=>item.id===value)?value:items[0]?.id||'';
 }
 function renderHeader(){
  const table=tables.find(item=>item.id===$('sticker-settings-table').value);
  const master=$('sticker-settings-master'),item=$('sticker-settings-item');
  const rule=draft?.headers[table?.id]||{master:'title',item:'title'};
  choices(master,[{id:'',label:'不顯示'},...(table?.masterFields||[])],rule.master);
  choices(item,table?.itemFields||[],rule.item);
  master.disabled=!table?.masterFields.length;item.disabled=!table;
 }
 function sync(prefs){
  saved=prefs;draft=structuredClone(prefs);
  $('sticker-settings-color').value=prefs.background;
  $('sticker-settings-grip').checked=prefs.showGrip;
  for(const key of dimensions)$('sticker-settings-'+key).value=prefs.size[key];
  for(const key of sources)$('sticker-settings-'+key).checked=prefs.sources[key];
  for(const kind of ['favorite','tracking'])for(const key of ['prefix','title'])$('sticker-settings-'+kind+'-'+key).value=prefs[kind][key];
  renderHeader();
 }
 function renderCounts(counts){
  $('sticker-settings-count').textContent='已釘選 '+(counts.records+counts.files)+' 張 · 桌面顯示 '+counts.visible+' 張';
  $('sticker-settings-clear').disabled=!counts.records&&!counts.files;
  $('sticker-settings-expand').disabled=$('sticker-settings-clear').disabled;
  $('sticker-settings-collapse').disabled=!counts.visible;
 }
 async function refresh(){
  const id=++request;
  try{
   const state=await api.get();
   if(id!==request)return;
   const current=$('sticker-settings-table').value;
   tables=state.tables;
   choices($('sticker-settings-table'),tables.map(table=>({id:table.id,label:table.group?[table.group,table.name].join(' ／ '):table.name})),current);
   if(!saved)sync(state.preferences);else renderHeader();
   renderCounts(state.counts);
  }catch(error){if(id===request)status(error.message);}
 }
 function init(){
  const form=$('sticker-settings-form');
  $('sticker-settings-table').addEventListener('change',renderHeader);
  for(const key of ['master','item'])$('sticker-settings-'+key).addEventListener('change',()=>{
   const id=$('sticker-settings-table').value;
   if(id&&draft)draft.headers[id]={master:$('sticker-settings-master').value,item:$('sticker-settings-item').value};
  });
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!draft||pending)return;
   pending=true;const save=$('sticker-settings-save');save.disabled=true;
   try{
    const preferences={...draft,background:$('sticker-settings-color').value,
     showGrip:$('sticker-settings-grip').checked,
     size:Object.fromEntries(dimensions.map(key=>[key,Number($('sticker-settings-'+key).value)])),
     sources:Object.fromEntries(sources.map(key=>[key,$('sticker-settings-'+key).checked])),
     favorite:{prefix:$('sticker-settings-favorite-prefix').value,title:$('sticker-settings-favorite-title').value},
     tracking:{prefix:$('sticker-settings-tracking-prefix').value,title:$('sticker-settings-tracking-title').value}};
    const result=await window.desktopAPI.configure({desktopStickers:preferences});
    sync(result.settings.desktopStickers);status('已儲存桌面便條設定。');
   }catch(error){status(error.message);}
   finally{pending=false;save.disabled=false;}
  });
  for(const action of ['expand','collapse','clear'])$('sticker-settings-'+action).addEventListener('click',async()=>{
   if(action==='clear'&&!window.confirm('取消所有來源的桌面便條釘選？'))return;
   try{renderCounts(await api.control(action));status(action==='clear'?'已取消全部釘選。':'已更新桌面便條。');}
   catch(error){status(error.message);}
  });
  api.onChanged(()=>void refresh());
  window.desktopAPI.onChanged(({settings})=>{
   const next=settings?.desktopStickers;
   if(next&&JSON.stringify(next)!==JSON.stringify(saved))sync(next);
  });
  window.workspaceAPI.onChanged(()=>{if(!$('settings-panel-stickers').hidden)void refresh();});
  $('settings-tab-stickers').addEventListener('click',()=>void refresh());
  void refresh();
 }
 window.stickerSettingsUI=Object.freeze({init,enabled,pin,pinTag,refresh});
})();
