'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const model=window.studioProductivity;
 const weekdays=['日','一','二','三','四','五','六'];
 const node=(tag,text,cls)=>{
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  if(cls)element.className=cls;
  return element;
 };
 const button=(text,action,cls='btn btn-ghost')=>{
  const control=node('button',text,cls);
  control.type='button';
  control.addEventListener('click',action);
  return control;
 };

 function init({openRecord,moveCard,isBusy}){
  const root=$('planning-content'),month=$('planning-month');
  const sheet=$('planning-sheet'),field=$('planning-field'),query=$('planning-query');
  const today=()=>new Date().toLocaleDateString('sv-SE');
  let state,draggedRecord=null,mode='calendar',selectedDate='';
  const selectedSheets={calendar:'',board:''};
  month.value=today().slice(0,7);

  function setOptions(input,items,placeholder,previous=input.value){
   input.replaceChildren();
   if(placeholder){
    const option=node('option',placeholder);option.value='';input.append(option);
   }
   for(const {id,label} of items){
    const option=node('option',label);option.value=id;input.append(option);
   }
   input.value=items.some(item=>item.id===previous)?previous:(placeholder?'':items[0]?.id||'');
  }

  function setSheets(){
   const board=mode==='board';
   const tables=state.workspace.document.sheets.filter(table=>!table.deletedAt&&
    (!board||table.fields.some(column=>column.type==='select')));
   setOptions(sheet,tables.map(table=>({id:table.id,label:table.name})),board?'':'全部表格',selectedSheets[mode]);
   setFields();
  }

  function setFields(){
   const table=state.workspace.document.sheets.find(table=>table.id===sheet.value);
   setOptions(field,(table?.fields||[]).filter(column=>column.type==='select'));
  }

  function renderCalendar(doc,text){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.value)){
    root.append(node('p','請選擇月份。','tool-view-empty'));
    return;
   }
   const monthStart=new Date(month.value+'-01T12:00:00');
   const nextMonth=new Date(monthStart);nextMonth.setMonth(nextMonth.getMonth()+1);nextMonth.setDate(0);
   const calendar=node('div',undefined,'productivity-month');
   const records=new Map(doc.records.map(record=>[record.id,record]));
   const events=model.agenda(doc,state.reminders.items,month.value).filter(event=>
    (!sheet.value||records.get(event.recordId)?.sheetId===sheet.value)&&
    (event.title+' '+event.sheet+' '+event.label+' '+event.master+' '+(records.get(event.recordId)?.notes||'')).toLocaleLowerCase().includes(text));
   const byDate=new Map();
   for(const event of events){
    if(!byDate.has(event.date))byDate.set(event.date,[]);
    byDate.get(event.date).push(event);
   }

   const currentDate=today();
   if(!selectedDate.startsWith(month.value+'-')){
    selectedDate=currentDate.startsWith(month.value+'-')?currentDate:month.value+'-01';
   }
   const summary=node('div',undefined,'planning-calendar-summary');
   const formatMonth=new Intl.DateTimeFormat('zh-Hant',{year:'numeric',month:'long'});
   summary.append(node('h2',formatMonth.format(monthStart)),node('span',events.length+' 項行程'));
   const legend=node('div',undefined,'planning-legend');
   legend.append(node('span','日期欄位','planning-date-key'),node('span','提醒','planning-reminder-key'));
   summary.append(legend);
   const region=node('div',undefined,'planning-calendar-layout');
   const agenda=node('section',undefined,'planning-agenda');
   agenda.setAttribute('aria-label','所選日期的行程');
   const dateLabel=new Intl.DateTimeFormat('zh-Hant',{month:'long',day:'numeric',weekday:'short'});
   const days=new Map();
   function select(date){
    days.get(selectedDate)?.setAttribute('aria-pressed','false');
    selectedDate=date;
    days.get(date)?.setAttribute('aria-pressed','true');
    const rows=byDate.get(date)||[];
    const heading=node('h3',dateLabel.format(new Date(date+'T12:00:00'))+' ');
    heading.append(node('span',rows.length+' 項','planning-count'));
    agenda.replaceChildren(heading);
    if(!rows.length)agenda.append(node('p','這一天沒有符合條件的行程。可選擇其他日期。','planning-column-empty'));
    for(const event of rows){
     const open=button(event.title,()=>openRecord(event.recordId),'btn btn-ghost productivity-event');
     const time=event.at?new Date(event.at).toLocaleTimeString('zh-Hant',{hour:'2-digit',minute:'2-digit'})+' · ':'';
     open.append(node('small',[time+event.sheet,event.master,event.label].filter(Boolean).join(' ／ ')));
     open.dataset.eventKind=event.kind;
     agenda.append(open);
    }
   }
   for(const day of weekdays)calendar.append(node('strong','週'+day,'planning-weekday'));
   for(let index=0;index<monthStart.getDay();index++){
    const gap=node('div');gap.className='planning-gap';gap.setAttribute('aria-hidden','true');calendar.append(gap);
   }
   for(let day=1;day<=nextMonth.getDate();day++){
    const date=month.value+'-'+String(day).padStart(2,'0'),rows=byDate.get(date)||[];
    const cell=button('',()=>select(date),'productivity-day');
    cell.dataset.today=String(currentDate===date);
    cell.dataset.date=date;
    cell.setAttribute('aria-label',dateLabel.format(new Date(date+'T12:00:00'))+'，'+rows.length+' 項行程');
    cell.setAttribute('aria-pressed','false');
    if(currentDate===date)cell.setAttribute('aria-current','date');
    const dayHeading=node('span',undefined,'planning-day-heading');
    dayHeading.append(node('strong',String(day),'planning-day-number'));
    if(rows.length)dayHeading.append(node('span',String(rows.length),'planning-count'));
    cell.append(dayHeading);
    for(const event of rows.slice(0,2)){
     const preview=node('span',event.master?event.master+' · '+event.title:event.title,'planning-day-preview');
     preview.dataset.eventKind=event.kind;
     cell.append(preview);
    }
    if(rows.length>2)cell.append(node('span','另有 '+(rows.length-2)+' 項','planning-day-more'));
    days.set(date,cell);
    calendar.append(cell);
   }
   select(selectedDate);
   region.append(calendar,agenda);
   root.append(summary,region);
  }

 function renderBoard(doc,text){
  if(!sheet.value||!field.value){
   root.append(node('p','看板需要有單選狀態欄位的表格。','tool-view-empty'));
   return;
  }
  const table=doc.sheets.find(table=>table.id===sheet.value);
  const fieldId=field.value,columnLabel=table.fields.find(column=>column.id===fieldId).label;
  const columns=model.board(doc,sheet.value,fieldId),masterLabel=model.masterLabels(doc);
  const board=node('div',undefined,'productivity-board');
  board.tabIndex=0;board.setAttribute('role','region');board.setAttribute('aria-label','依狀態瀏覽紀錄');
  for(const column of columns){
   const records=column.records.filter(record=>(record.title+' '+record.notes+' '+masterLabel(record)).toLocaleLowerCase().includes(text));
   const group=node('section',undefined,'productivity-column');
   const heading=node('h3',column.label+' ');
   heading.append(node('span',String(records.length),'planning-count'));
   group.append(heading);
   group.addEventListener('dragover',event=>{
    if(draggedRecord&&!isBusy())event.preventDefault();
   });
   group.addEventListener('drop',event=>{
    if(!draggedRecord||isBusy())return;
    event.preventDefault();
    const {id,value}=draggedRecord;
    draggedRecord=null;
    if(value!==column.value)moveCard(id,fieldId,column.value);
   });
   for(const record of records){
    const card=node('article',undefined,'productivity-card productivity-board-card');
    card.draggable=true;
    card.addEventListener('dragstart',event=>{
     if(isBusy()){event.preventDefault();return;}
     draggedRecord={id:record.id,value:column.value};
     event.dataTransfer.setData('application/x-bfs-board',record.id);
    });
    card.addEventListener('dragend',()=>draggedRecord=null);
    card.append(button(record.title,()=>openRecord(record.id),'btn btn-ghost planning-card-title'));
    const master=masterLabel(record);
    if(master)card.append(node('small','所屬：'+master,'planning-column-empty'));
    if(record.notes)card.append(node('p',record.notes.slice(0,200)));
    const select=node('select');
    select.setAttribute('aria-label',record.title+' 的'+columnLabel);
    for(const target of columns){
     const option=node('option',target.label);option.value=target.value;select.append(option);
    }
    select.value=column.value;
    select.addEventListener('change',()=>{
     const value=select.value;
     select.value=column.value;
     if(!isBusy()&&value!==column.value)moveCard(record.id,fieldId,value);
    });
    card.append(select);
    group.append(card);
   }
   if(!records.length)group.append(node('p','目前沒有紀錄','planning-column-empty'));
   board.append(group);
  }
  root.append(board);
 }

 function render(){
  if(!state)return;
  const board=mode==='board';
  $('planning-month-wrap').hidden=board;
  $('planning-field-wrap').hidden=!board;
  $('planning-calendar-mode').setAttribute('aria-pressed',String(!board));
  $('planning-board-mode').setAttribute('aria-pressed',String(board));
  root.replaceChildren();
  const doc=state.workspace.document,text=query.value.trim().toLocaleLowerCase();
  if(board)renderBoard(doc,text);
  else renderCalendar(doc,text);
 }

 for(const value of ['calendar','board']){
  $('planning-'+value+'-mode').addEventListener('click',()=>{
   if(isBusy()||mode===value)return;
   mode=value;
   if(state)setSheets();
   render();
  });
 }
 for(const [id,offset] of [['planning-month-prev',-1],['planning-month-today',0],['planning-month-next',1]]){
  $(id).addEventListener('click',()=>{
   if(!offset)selectedDate=today();
   const date=new Date((month.value||today().slice(0,7))+'-01T12:00:00');
   if(offset)date.setMonth(date.getMonth()+offset);
   month.value=offset?date.toLocaleDateString('sv-SE').slice(0,7):today().slice(0,7);
   render();
  });
 }
 sheet.addEventListener('change',()=>{
  selectedSheets[mode]=sheet.value;
  if(state)setFields();
  render();
 });
 month.addEventListener('change',render);
 field.addEventListener('change',render);
 query.addEventListener('input',render);

 return {update(value){state=value;setSheets();render();}};
 }

 window.planningView={init};
})();
