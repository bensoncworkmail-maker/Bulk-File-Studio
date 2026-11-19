'use strict';
(() => {
 const titles={logs:'查看紀錄',planning:'日曆／看板速覽',snippets:'常用文字片段'};
 const descriptions={
  logs:'依表格瀏覽工作區紀錄，或用日期、主紀錄與欄位值縮小範圍。',
  planning:'快速查看這個月的日期與提醒，或依狀態瀏覽看板。',
  snippets:'找出常用回覆，填入稱呼後即可複製。'
 };
 const sorts=[['recent','日期：新到舊'],['oldest','日期：舊到新'],['title','標題']];
 const layouts=[['list','精簡清單'],['cards','卡片']];
 const node=(tag,text,className)=>{
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(className)el.className=className;
  return el;
 };
 const button=(label,task)=>{
  const el=node('button',label,'btn btn-secondary');el.type='button';
  el.addEventListener('click',task);return el;
 };
 function mount(root,api,config,filters={query:config.query||'',page:0}){
  let request=0,timer,disposed=false,advanced,filterSummary;
  const compactLogs=config.kind==='logs',floatingLogs=compactLogs&&Boolean(api.close);
  root.dataset.floatingLogs=String(floatingLogs);
  const canPin=compactLogs&&Boolean(api.close&&api.logRecord);
  const readLogDetail=api.logDetail||(canPin?(id=>api.logRecord('detail',id)):null);
  const pinsPanel=canPin?node('details',undefined,'tool-view-pins'):null;
  const pinsHeading=canPin?node('summary'):null;
  const pinsList=canPin?node('div',undefined,'tool-view-list'):null;
  let expandedId,pinnedOnlyButton,clearButton,windowPinButton,pinBusy=false,logFilterChips,logContext,latestLogData,collapseDetails;
  const embeddedPlanning=config.embedded&&config.kind==='planning';
  const smallPlanning=config.smallCalendar&&config.kind==='planning',calendarPlanning=embeddedPlanning||smallPlanning;
  root.dataset.smallCalendar=String(Boolean(smallPlanning));
  root.dataset.compactSnippets=String(config.kind==='snippets'&&Boolean(api.close));
  if(smallPlanning&&!filters.mode)filters.mode='calendar';
  const controls=node('div',undefined,'tool-view-filters');
  const results=node('div',undefined,'tool-view-results');
  const status=node('p',undefined,'tool-view-status');status.setAttribute('role','status');
  const toolbar=node('header',undefined,'tool-view-heading'+(compactLogs&&!floatingLogs?' productivity-heading':''));
  const title=node('div');
  title.append(node('h1',titles[config.kind]));
  if(compactLogs)title.append(node('p','快速找到要跟進的內容，點擊紀錄即可閱讀詳情。','log-page-description'));
  if(!compactLogs&&!smallPlanning&&!(config.kind==='snippets'&&api.close))title.append(node('p',descriptions[config.kind]));
  toolbar.append(title);
  const actions=node('div',undefined,'tool-view-actions');
  if(compactLogs){
   root.dataset.compactLogs='true';
   if(canPin){
    pinnedOnlyButton=button('只看釘選',()=>{
     filters.pinnedOnly=!filters.pinnedOnly;applyPinnedOnly();saveLogFilters();void load();
    });
    if(api.pinWindow){
     const stay=windowPinButton=button('釘住視窗',async()=>{
      stay.disabled=true;
      try{setWindowPin(await api.pinWindow(stay.getAttribute('aria-pressed')!=='true'));}
      catch(error){status.textContent=error.message;}
      finally{stay.disabled=false;}
     });
     const setWindowPin=value=>{
      stay.setAttribute('aria-pressed',String(value));
      stay.title=value?'取消獨立置頂':'保持置頂，隱藏浮動工具時仍顯示';
     };
     setWindowPin(Boolean(config.pinnedWindow));
    }
   }
  }
  if(compactLogs){collapseDetails=button('收合詳情',()=>{expandedId=undefined;if(latestLogData){showRows(latestLogData);if(canPin)renderPins(latestLogData);}});collapseDetails.disabled=true;actions.append(collapseDetails,button('重新整理',()=>load()));}
  if(api.clearScope)actions.append(button('返回預設表格',api.clearScope));
  if(config.kind==='planning'&&!embeddedPlanning&&!smallPlanning)actions.append(button('開啟完整日曆／看板',()=>act('main')));
  if(actions.children.length)toolbar.append(actions);
  const filterPanel=node('div',undefined,'tool-view-filter-panel');
  filterPanel.append(controls);
  root.replaceChildren(...(compactLogs&&api.close?[]:[toolbar]),filterPanel,status,...(pinsPanel?[pinsPanel]:[]),results);
  if(canPin){
   pinsPanel.open=filters.pinnedOnly||filters.pinsExpanded!==false;
   pinsPanel.append(pinsHeading,pinsList);
   pinsPanel.addEventListener('toggle',()=>{
    if(disposed||filters.pinsExpanded===pinsPanel.open)return;
    filters.pinsExpanded=pinsPanel.open;saveLogFilters();
   });
  }
  function applyPinnedOnly(){
   if(!canPin)return;
   const only=Boolean(filters.pinnedOnly);
   pinnedOnlyButton.setAttribute('aria-pressed',String(only));
   controls.hidden=results.hidden=only;
   clearButton.hidden=only||!hasLogFilters();
   root.dataset.pinnedOnly=String(only);
   if(only)pinsPanel.open=true;
  }
  if(config.embedded){title.hidden=true;root.dataset.embeddedKind=config.kind;}
  const inputs={};
  function field(key,label,type,parent=controls){
   const compactMonth=calendarPlanning&&key==='month';
   const wrap=node(compactMonth?'div':'label',undefined,compactMonth?'tool-view-month-field':key==='query'?'tool-view-query':undefined);
   if(compactLogs)wrap.setAttribute('data-log-filter',key);
   const input=node(type==='select'?'select':'input');
   if(type!=='select')input.type=type;
   input.setAttribute('aria-label',label);inputs[key]=input;
   input.value=filters[key]||'';
   if((config.embedded||compactLogs||smallPlanning||config.kind==='snippets'&&api.close)&&(type==='search'||type==='text'))input.placeholder=label;
   const typing=type==='text'||type==='search';
   input.addEventListener(typing?'input':'change',()=>{
    filters[key]=input.value;
    if(key!=='customer')reloadField(key,typing);
   });
   if(!compactMonth)wrap.append(node('span',label));
   wrap.append(input);parent.append(wrap);return input;
  }
  const filterKeys=['masterId','dateField','from','to','stateField','value'];
  const hasLogFilters=()=>Boolean(filters.query||filterKeys.some(key=>filters[key]));
  function updateFilterSummary(){
   const count=filters.pinnedOnly?0:filterKeys.filter(key=>filters[key]).length;
   filterSummary.textContent='更多篩選'+(count?' · '+count+' 項':'');
  }
  function saveLogFilters(){
   if(!compactLogs)return;
   updateFilterSummary();
   const {page,...memory}=filters;
   api.saveFilters?.(memory).catch(error=>{if(!disposed)status.textContent='無法記住篩選。'+error.message;});
  }
  function reloadField(key,typing=false){
   filters.page=0;
   if(key==='sheetId'){
    for(const dependent of ['masterId','dateField','stateField','value'])delete filters[dependent];
   }
   if(key==='stateField'||key==='mode')delete filters.value;
   if(key==='month')delete filters.day;
   saveLogFilters();if(compactLogs)renderLogChips();
   request++;
   clearTimeout(timer);timer=setTimeout(load,typing?140:0);
  }
  field('query','搜尋標題或內容','search').maxLength=256;
  if(config.kind==='logs'){
   field('sheetId','紀錄表格','select');
   advanced=node('details',undefined,'tool-view-advanced');
   const advancedFields=node('div',undefined,'tool-view-filters');
   advanced.open=filters.advanced??config.scope==='master';
   filterSummary=node('summary',compactLogs?'篩選與顯示':'主紀錄、日期與欄位篩選');
   advanced.append(filterSummary,advancedFields);
   const filterFooter=node('div',undefined,'tool-view-log-filter-footer');
   filterFooter.append(advanced);
   if(pinnedOnlyButton)filterFooter.append(pinnedOnlyButton);
   filterPanel.append(filterFooter);
   const viewPanel=node('details',undefined,'tool-view-display-options'),viewFields=node('div',undefined,'tool-view-filters');
   viewPanel.append(node('summary','檢視'),viewFields);filterFooter.append(viewPanel);
   field('layout','顯示方式','select',viewFields);field('sort','排序','select',viewFields);
   if(windowPinButton)viewFields.append(windowPinButton);
   field('masterId','所屬主紀錄','select',controls);
   for(const [key,label,type] of [
    ['dateField','日期依據','select'],['from','日期由','date'],['to','日期至','date'],['stateField','狀態／欄位','select'],['value','欄位值','select']
   ])field(key,label,type,advancedFields);
   const quickDates=node('div',undefined,'log-quick-dates');quickDates.setAttribute('aria-label','快速日期條件');quickDates.append(node('span','快速日期'));
   const day=value=>[value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
   for(const [text,kind] of [['今天','today'],['最近 7 天','week'],['本月','month'],['不限日期','all']])quickDates.append(button(text,()=>{
    const end=new Date(),start=new Date(end);if(kind==='week')start.setDate(start.getDate()-6);if(kind==='month'){start.setDate(1);end.setMonth(end.getMonth()+1,0);}
    for(const [key,value] of [['from',kind==='all'?'':day(start)],['to',kind==='all'?'':day(end)]]){inputs[key].value=value;if(value)filters[key]=value;else delete filters[key];}reloadField('from');
   }));advanced.append(quickDates);
   logFilterChips=node('div',undefined,'log-filter-chips');logFilterChips.setAttribute('aria-label','目前篩選條件');filterPanel.append(logFilterChips);
   logContext=node('div',undefined,'log-results-context');root.insertBefore(logContext,results);
   if(compactLogs){
    clearButton=button('清除篩選',()=>{
     for(const key of ['query',...filterKeys]){delete filters[key];inputs[key].value='';}
     reloadField('query');
    });
    const tools=node('div',undefined,'tool-view-log-status');
    if(floatingLogs)tools.append(logContext);
    tools.append(status,clearButton);root.insertBefore(tools,pinsPanel||results);
    applyPinnedOnly();updateFilterSummary();
    advanced.addEventListener('toggle',()=>{
     if(disposed||filters.advanced===advanced.open)return;
     filters.advanced=advanced.open;saveLogFilters();
    });
   }
  }else if(config.kind==='planning'){
   field('mode','檢視','select');
   const month=field('month','月份','month');
   month.value=filters.month||new Date().toLocaleDateString('sv-SE').slice(0,7);
   if(calendarPlanning){
    const monthField=month.parentElement,monthControls=node('div',undefined,'tool-view-month-controls');
    const arrow=(text,label,delta)=>{
     const control=button(text,()=>{
      const date=new Date((month.value||new Date().toLocaleDateString('sv-SE').slice(0,7))+'-15T12:00:00Z');
      date.setUTCMonth(date.getUTCMonth()+delta);
      if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1||date.getUTCFullYear()>9999)return;
      month.value=filters.month=date.toISOString().slice(0,7);
      reloadField('month');
     });
     control.setAttribute('aria-label',label);control.title=label;return control;
    };
    monthControls.append(arrow('‹','上個月',-1),month,arrow('›','下個月',1));
    monthField.append(monthControls);
    const full=button('↗',()=>act('main'));
    full.setAttribute('aria-label','開啟完整日曆／看板');full.title='開啟完整日曆／看板';
    controls.append(full);
   }
   for(const [key,label] of [['sheetId','表格'],['stateField','狀態欄位'],['value','篩選狀態']]){
    field(key,label,'select').parentElement.hidden=filters.mode!=='board';
   }
  }else{
   field('layout','顯示方式','select');
   field('category','分類','select');
   field('customer','客戶／稱呼','text').maxLength=200;
  }
  function renderLogChips(){
   if(!logFilterChips)return;logFilterChips.replaceChildren();
   const label=key=>Array.from(inputs[key].children).find(option=>option.value===filters[key])?.textContent||filters[key]||'';
   const groups=[['搜尋：'+(filters.query||''),['query']],['主紀錄：'+label('masterId'),['masterId']],['日期：'+(filters.from||'不限起日')+' → '+(filters.to||'不限迄日')+(filters.dateField?' · '+label('dateField'):''),['dateField','from','to']],['欄位：'+label('stateField')+(filters.value?' · '+label('value'):''),['stateField','value']]];
   for(const [text,keys] of groups)if(keys.some(key=>filters[key])){const chip=button(text+' ×',()=>{for(const key of keys){delete filters[key];inputs[key].value='';}reloadField(keys[0]);});chip.setAttribute('aria-label','移除'+text);logFilterChips.append(chip);}
   logFilterChips.hidden=Boolean(filters.pinnedOnly)||!logFilterChips.children.length;
  }
  function choices(key,options,selected=filters[key]){
   const input=inputs[key];
   input.replaceChildren();
   for(const [value,label] of options){
    const item=node('option',label);item.value=value;input.append(item);
   }
   input.value=options.some(([value])=>value===selected)?selected:(options[0]?.[0]||'');
  }
  if(inputs.mode)choices('mode',calendarPlanning?
   [['calendar','月曆'],['list','行程清單'],['board','看板']]:[['list','行程清單'],['board','看板']]);
  if(config.kind==='snippets'){
   filters.layout||=config.embedded?'compact':'preview';
   choices('layout',[['compact','精簡'],['preview','預覽']]);
  }
  const calendar=node('section',undefined,'tool-view-month-grid');
  calendar.hidden=true;
  if(calendarPlanning)filterPanel.append(calendar);
  function renderMonth(data){
   calendar.hidden=!data.month;
   if(!data.month)return;
   calendar.replaceChildren();
   calendar.setAttribute('aria-label','選擇日期');
   const format=new Intl.DateTimeFormat('zh-Hant',{month:'long',day:'numeric'});
   for(const label of ['日','一','二','三','四','五','六'])calendar.append(node('small',label));
   const start=new Date(data.month+'-01T12:00:00'),last=new Date(start);
   last.setMonth(last.getMonth()+1,0);
   for(let index=0;index<start.getDay();index++)calendar.append(node('span'));
   for(let number=1;number<=last.getDate();number++){
    const day=data.month+'-'+String(number).padStart(2,'0'),count=data.counts[day]||0;
    const control=button('',()=>{
     filters.day=day;
     for(const cell of calendar.querySelectorAll('button[aria-pressed]'))cell.setAttribute('aria-pressed',String(cell===control));
     const rect=control.getBoundingClientRect();
     if(smallPlanning){filters.page=0;return reloadField('day');}return act('day-menu',{day,query:inputs.query.value,anchor:{x:rect.left,y:rect.bottom}});
    });
    control.setAttribute('aria-pressed',String(day===filters.day));
    control.setAttribute('aria-haspopup','menu');
    control.title=format.format(new Date(day+'T12:00:00'))+'，'+count+' 項行程';
    control.setAttribute('aria-label',control.title);
    control.append(node('span',String(number),'tool-view-day-number'));
    if(count){
     control.dataset.hasEvents='true';
     const badge=node('small',count>99?'99+':String(count),'tool-view-day-count');
     badge.setAttribute('aria-hidden','true');
     control.append(badge);
    }
    if(day===new Date().toLocaleDateString('sv-SE'))control.setAttribute('aria-current','date');
    calendar.append(control);
   }
  }
  async function act(action,value){
   try{
    const outcome=await api.action(action,value,inputs.customer?.value||'');
    if(action==='paste')status.textContent=outcome?.pasted?'文字已複製並送出貼上；請核對目標欄位。':'文字已複製；請在目標欄位按 Ctrl+V。';
    if(action==='copy')status.textContent='已複製文字片段。';
   }catch(error){status.textContent=error.message;}
  }
  function pinButton(row,pinned){
   const toggle=button(pinned?'★':'☆',async()=>{
    if(pinBusy||disposed)return;
    pinBusy=true;toggle.disabled=true;
    try{
     await api.logRecord('pin',row.id,!pinned);
     if(disposed)return;
     if(!pinned)pinsPanel.open=true;
     if(pinned&&expandedId===row.id)expandedId=undefined;
     await load();
     (pinsPanel.hidden?inputs.query:pinsHeading).focus();
    }catch(error){if(!disposed)status.textContent=error.message;}
    finally{pinBusy=false;toggle.disabled=false;}
   });
   toggle.title=pinned?'取消釘選':'釘選以便跟進';
   toggle.setAttribute('aria-label',toggle.title+' '+row.title);
   toggle.setAttribute('aria-pressed',String(pinned));
   toggle.className='btn btn-secondary tool-view-pin-star';
   return toggle;
  }
  function reminderButton(row){
   const reminder=button('提醒',()=>act('reminder',row.id));reminder.setAttribute('aria-label','新增提醒 '+row.title);reminder.title='為此紀錄新增提醒';return reminder;
  }
  function detailFields(fields){
   const list=node('dl',undefined,'tool-view-pin-fields');
   for(const {label,value} of fields)list.append(node('dt',label),node('dd',value));
   return list;
  }
  async function renderLogDetail(row,detail,pinned,onCollapse){
   try{
    const data=await readLogDetail(row.id);
    if(disposed||expandedId!==row.id)return;
    const footer=node('footer',undefined,'tool-view-pin-footer');
    footer.append(node('small','修改日期 '+data.updatedAt.slice(0,10)));
    footer.append(button('前往工作區',()=>act('visit',row.id)),reminderButton(row),button('收合',onCollapse));
    if(pinned)footer.append(button('編輯',async()=>{
     try{await api.logRecord('edit',row.id);}
     catch(error){status.textContent=error.message;}
    }));
    const fields=node('section',undefined,'log-detail-section'),notes=node('section',undefined,'log-detail-section');fields.append(node('h3','欄位資料'),detailFields(data.fields));notes.append(node('h3','筆記'),node('p',data.notes||'尚未填寫筆記。','tool-view-pin-note'));
    detail.replaceChildren(fields,notes,
     ...(data.tags.length?[node('small',data.tags.join('、'))]:[]),footer);
   }catch(error){if(!disposed)detail.textContent=error.message;}
  }
  function logRow(row,data,pinned){
   const expanded=row.id===expandedId,settings=data.presentation||{};
   const item=node('article',undefined,'tool-view-result tool-view-log-row'+(pinned?' tool-view-pin':''));
   item.dataset.expanded=String(expanded);
   const top=node('div',undefined,'tool-view-log-top'),actions=node('div',undefined,'tool-view-log-actions');
   function toggle(){
    expandedId=expanded?undefined:row.id;
    showRows(data);
    if(canPin)renderPins(data);
    const root=pinned?pinsList:results;
    [...root.querySelectorAll('button')].find(button=>button.dataset.logToggle===row.id)?.focus();
   }
   const title=button(row.title,()=>readLogDetail?toggle():act('visit',row.id));
   title.className='tool-view-log-link';title.title=row.title;
   if(readLogDetail){title.dataset.logToggle=row.id;title.setAttribute('aria-expanded',String(expanded));title.setAttribute('aria-label','切換詳情 '+row.title);}
   const date=node('time',row.date||'');if(row.date)date.dateTime=row.date;
   const identity=node('div',undefined,'tool-view-log-identity');
   identity.append(title);
   if(row.context){
    const master=node('small',row.context,'tool-view-log-master');master.title='所屬主紀錄：'+row.context;identity.append(master);
   }
   top.append(identity,date);
   if(readLogDetail){
    item.classList.add('tool-view-log-expandable');item.title='點擊空白處展開／收合詳情';
    item.addEventListener('click',event=>{
     if(event.defaultPrevented||event.detail>1||event.button!==undefined&&event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.target.closest('button,a,input,textarea,select,label,summary,[contenteditable],.tool-view-pin-detail')||window.getSelection?.()?.toString())return;
     toggle();
    });
    if(!floatingLogs){
     const expand=button(expanded?'▾':'▸',toggle);expand.title=expanded?'收合詳情':'展開詳情';
     expand.setAttribute('aria-expanded',String(expanded));expand.setAttribute('aria-label','切換詳情 '+row.title);actions.append(expand);
    }
   }
   if(!readLogDetail)actions.append(reminderButton(row));
   if(canPin)actions.append(pinButton(row,pinned));
   top.append(actions);item.append(top);
   const meta=node('div',undefined,'log-row-meta');
   if(row.sheet)meta.append(node('span',row.sheet,'log-sheet-badge'));
   for(const marker of (row.markers||[]).slice(0,2))if(marker.value)meta.append(node('span',marker.label+' · '+marker.value,'log-state-badge'));
   for(const tag of (row.tags||[]))meta.append(node('span',tag,'log-tag-badge'));
   if(row.tagCount>(row.tags||[]).length)meta.append(node('span','+'+(row.tagCount-(row.tags||[]).length),'log-tag-badge'));
   if(meta.children.length)item.append(meta);
   if(expanded){
    const detail=node('div','正在讀取詳情…','tool-view-pin-detail');
    item.append(detail);void renderLogDetail(row,detail,pinned,toggle);
   }else{
    if(pinned&&row.markers.length)item.append(node('small',row.markers.map(({label,value})=>label+' '+value).join(' · '),'tool-view-log-context'));
    if(row.summary&&(settings.previewLines??1)>0){
     const preview=node('p',row.summary,'tool-view-log-preview');
     preview.style.setProperty('--log-preview-lines',String(settings.previewLines??1));item.append(preview);
    }
   }
   return item;
  }
  function renderPins(data){
   const settings=data.presentation||{};
   pinsPanel.hidden=!filters.pinnedOnly&&!settings.showEmptyPins&&!data.pinned.length;
   pinsHeading.textContent='釘選紀錄'+(settings.showCount?' · '+data.pinned.length+' 筆':'');
   pinsList.dataset.layout=data.layout;
   pinsList.replaceChildren(...data.pinned.map(row=>logRow(row,data,true)));
   if(!data.pinned.length)pinsList.append(node('p','按紀錄旁的 ☆，加入要跟進的項目。','tool-view-pin-empty'));
  }
  function card(row){
   const item=node('article',undefined,'tool-view-result');
   const snippets=config.kind==='snippets',body=node(snippets?'span':'div',undefined,'tool-view-result-body');
   body.append(node(snippets?'strong':'h3',row.title));
   if(row.detail)body.append(node('small',row.detail));
   if(row.summary&&(!snippets||filters.layout==='preview')){
    body.append(node(snippets?'span':'p',row.summary,snippets?'tool-view-snippet-preview':undefined));
   }
   if(config.embedded&&snippets)body.title=row.summary||row.title;
   if(snippets){
    const copy=button('',()=>act('copy',row.id));
    copy.className='tool-view-snippet-copy';
    copy.title='複製 '+row.title;
    copy.setAttribute('aria-label',copy.title);
    const mark=node('span','⧉','tool-view-copy-mark');
    mark.setAttribute('aria-hidden','true');
    copy.append(mark,body);item.append(copy);if(config.embedded||api.close)item.append(button('貼上',()=>act('paste',row.id)));
   }else item.append(body,button('開啟紀錄',()=>act('visit',row.id)));
   if(row.eventKind)item.dataset.eventKind=row.eventKind;
   return item;
  }
  function showRows(data){
   if(compactLogs){collapseDetails.disabled=!expandedId;if(logContext){logContext.replaceChildren(node('strong',data.tables?.find(item=>item.id===data.sheetId)?.name||'紀錄'),node('span',data.layout==='cards'?'卡片檢視':'清單檢視'));logContext.hidden=Boolean(filters.pinnedOnly);}}
   const list=node('div',undefined,'tool-view-list');
   list.dataset.layout=data.layout||'list';
   if(config.kind==='planning'||config.kind==='snippets'){
    let current,group;
    for(const row of data.rows){
     if(!group||current!==row.group){
      current=row.group;
      group=node('section',undefined,'tool-view-group');
      group.append(node('h2',current));
      list.append(group);
     }
     group.append(card(row));
    }
   }else{
    for(const row of data.rows)list.append(compactLogs?logRow(row,data,false):card(row));
   }
   results.replaceChildren(list);
   if(!data.rows.length){
    const hint=data.restricted&&!data.tables.length?'目前沒有可用的指定表格。請到「設定 → 日曆與紀錄 → 查看紀錄」更新選擇。':
     data.masterRequired&&!inputs.masterId.value?'先選擇主紀錄，即可查看相關明細。':'沒有符合條件的項目。';
    results.append(node('p',hint,'tool-view-empty'));
   }
   if(data.last){
    const pager=node('div',undefined,'tool-view-pager');
    const go=page=>{filters.page=page;load(true);};
    const prev=button('上一頁',()=>go(data.page-1));
    const next=button('下一頁',()=>go(data.page+1));
    prev.disabled=data.page===0;next.disabled=data.page===data.last;
    pager.append(prev,node('span',(data.page+1)+' / '+(data.last+1)),next);
    results.append(pager);
   }
  }
  async function load(focusResults=false){
   if(disposed)return;
   const version=++request;
   results.setAttribute('aria-busy','true');
   try{
    const data=await api.data({...filters});if(version!==request)return;
    filters.page=data.page;
    if(compactLogs){latestLogData=data;if(![...data.rows,...(data.pinned||[])].some(row=>row.id===expandedId))expandedId=undefined;}
    if(config.kind==='logs'){
     choices('sheetId',data.tables.map(item=>[item.id,item.name]),data.sheetId);
     choices('layout',layouts,data.layout);
     choices('sort',sorts,data.sort);
     choices('masterId',[['',data.masterRequired?'選擇主紀錄':'全部主紀錄'],...data.masters.map(item=>[item.id,item.title])]);
     inputs.masterId.parentElement.hidden=!data.masters.length&&!data.masterRequired;
     choices('dateField',[['','依查看紀錄設定'],...data.dateFields.map(item=>[item.id,item.label])]);
     choices('stateField',[['','不限欄位'],...data.stateFields.map(item=>[item.id,item.label])]);
     choices('value',[['','全部值'],...data.states.map(value=>[value,data.checkbox?(value==='true'?'已勾選':'未勾選'):value])]);
     inputs.value.parentElement.hidden=!data.states.length;
     if(compactLogs){
      for(const key of ['sheetId','layout','sort','masterId','dateField','stateField','value'])filters[key]=inputs[key].value;
      updateFilterSummary();renderLogChips();
     }
    }
    if(config.kind==='planning'){
     const board=filters.mode==='board';
     inputs.month.parentElement.hidden=board;
     for(const key of ['sheetId','stateField','value'])inputs[key].parentElement.hidden=!board;
     if(board){
      choices('sheetId',data.tables.map(item=>[item.id,item.name]),data.sheetId);
      choices('stateField',data.stateFields.map(item=>[item.id,item.label]),data.stateField);
      choices('value',[['','全部狀態'],...data.states.map(value=>[value,value])]);
     }
    }
    if(config.kind==='snippets')choices('category',[['','全部分類'],...(data.categories||[]).map(value=>[value,value])]);
    if(calendarPlanning)renderMonth(data);
    const monthGrid=calendarPlanning&&Boolean(data.month);
    results.hidden=embeddedPlanning&&monthGrid||canPin&&Boolean(filters.pinnedOnly);
    if(monthGrid&&embeddedPlanning){
     inputs.month.value=data.month;
     results.replaceChildren();
     const count=Object.keys(data.counts).length;
     status.textContent=count?'點選日期開啟外部選單 · '+count+' 天有行程':'本月沒有符合條件的行程。';
    }else{
     status.textContent=(smallPlanning&&data.day?data.day+' · ':'')+'共 '+data.total+' 筆';
     showRows(data);
     if(compactLogs){
      const settings=data.presentation||{};
      if(canPin)renderPins(data);
      if(windowPinButton)windowPinButton.hidden=settings.showWindowPin===false;
      clearButton.hidden=Boolean(filters.pinnedOnly)||!hasLogFilters();
      status.textContent=data.filterError||(settings.showCount&&!filters.pinnedOnly?(canPin?'其他紀錄 ':'共 ')+data.total+' 筆':'');
     }
    }
    if(focusResults){const target=compactLogs&&!status.textContent?results:status;target.tabIndex=-1;target.focus();}
   }catch(error){
    if(version===request){status.textContent=error.message;results.replaceChildren();calendar.hidden=true;}
   }finally{
    if(version===request)results.setAttribute('aria-busy','false');
   }
  }
  load();return {refresh:()=>load(),dispose(){disposed=true;request++;clearTimeout(timer);}};
 }
 window.toolViewsUI={mount};

 const overlay=document.getElementById('tool-overlay'),api=window.toolOverlayAPI;
 if(overlay&&api){
  const header=node('header',undefined,'tool-overlay-bar');
  const tabs=node('div',undefined,'tool-overlay-tabs');
  tabs.setAttribute('role','group');
  tabs.setAttribute('aria-label','切換浮動工具');
  const notice=node('span');notice.setAttribute('role','status');
  const tabButtons={};
  for(const kind of ['planning','snippets']){
   tabButtons[kind]=button(kind==='planning'?'日曆／看板':titles[kind],()=>{
    api.switchTab(kind).catch(error=>notice.textContent=error.message);
   });
   tabs.append(tabButtons[kind]);
  }
  const viewRoot=node('section');
  const toggles={};let presentation={};for(const [key,label]of [['pin','固定'],['topmost','置頂'],['collapse','收合']]){const control=button(label,()=>api.control?.(key,!({pin:presentation.pinnedWindow,topmost:presentation.topmost,collapse:presentation.collapsed})[key]).catch(error=>notice.textContent=error.message));toggles[key]=control;header.append(control);}
  header.append(tabs,button('最小化',()=>api.control?.('minimize')),button('關閉',api.close),notice);
  overlay.append(header,viewRoot);
  let view,last;
  const states=new Map();
  const render=payload=>{const {config,theme,fontSize,logFilters,logContext,pinnedWindow}=payload;presentation=payload;for(const [key,control]of Object.entries(toggles))control.setAttribute('aria-pressed',String(Boolean(({pin:pinnedWindow,topmost:payload.topmost,collapse:payload.collapsed})[key])));viewRoot.hidden=payload.collapsed===true;
   document.documentElement.dataset.theme=theme;
   document.documentElement.dataset.fontSize=fontSize;
   const signature=JSON.stringify(config);
   if(signature===last){view?.refresh();return;}
   view?.dispose();last=signature;
   header.hidden=config.kind==='logs';
   for(const [kind,tab] of Object.entries(tabButtons))tab.setAttribute('aria-pressed',String(config.kind===kind));
   const prior=states.get(config.kind);
   const filters=prior?.signature===signature?prior.filters:{query:config.query||'',...logFilters,page:0};
   states.set(config.kind,{signature,filters});
   notice.textContent='';
   view=mount(viewRoot,{
    data:filters=>api.data(config.kind,filters),
    action:(action,value,customer)=>api.action(config.kind,action,value,customer),
    ...(config.kind==='logs'?{
     close:api.close,saveFilters:filters=>api.saveLogFilters(logContext,filters),
     ...(api.logRecord?{logRecord:(...args)=>api.logRecord(logContext,...args)}:{}),
     ...(api.pinLogWindow?{pinWindow:value=>api.pinLogWindow(logContext,value)}:{})
    }:{})
   },{...config,pinnedWindow,smallCalendar:config.kind==='planning'},filters);
   document.title=config.kind==='logs'?titles.logs:'日曆／看板與文字片段';
  };
  api.onRefresh(render);
  api.get().then(data=>{if(!last)render(data);})
   .catch(error=>notice.textContent=error.message);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing)api.close();});
 }
})();
