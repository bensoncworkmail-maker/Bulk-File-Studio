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
  let state,draggedRecord=null,mode='calendar';
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
    (event.title+' '+event.sheet+' '+event.label).toLocaleLowerCase().includes(text));
   const byDate=new Map();
   for(const event of events){
    if(!byDate.has(event.date))byDate.set(event.date,[]);
    byDate.get(event.date).push(event);
   }

   for(const day of weekdays)calendar.append(node('strong',day,'planning-weekday'));
   for(let index=0;index<monthStart.getDay();index++){
    const gap=node('div');gap.setAttribute('aria-hidden','true');calendar.append(gap);
   }
   const currentDate=today();
   for(let day=1;day<=nextMonth.getDate();day++){
    const date=month.value+'-'+String(day).padStart(2,'0');
    const cell=node('section',undefined,'productivity-day');
    const label=node('strong',String(day),'planning-day-number');
    cell.dataset.today=String(currentDate===date);
    cell.setAttribute('aria-label',date);
    if(currentDate===date)label.setAttribute('aria-current','date');
    cell.append(label);
    for(const event of byDate.get(date)||[]){
     const open=button(event.title,()=>openRecord(event.recordId),'btn btn-ghost productivity-event');
     open.append(node('small',event.label));
     open.dataset.eventKind=event.kind;
     open.title=event.title+' · '+event.label+' ／ '+event.sheet+(event.at?' ／ '+new Date(event.at).toLocaleString():'');
     cell.append(open);
    }
    calendar.append(cell);
   }
   const count=node('p',events.length+' 個日期／提醒','tool-view-status');
   count.setAttribute('role','status');
   const legend=node('div',undefined,'planning-legend');
   legend.append(count,node('span','日期欄位','planning-date-key'),node('span','提醒','planning-reminder-key'));
   root.append(legend,calendar);
 }

 function renderBoard(doc,text){
  if(!sheet.value||!field.value){
   root.append(node('p','看板需要有單選狀態欄位的表格。','tool-view-empty'));
   return;
  }
  const table=doc.sheets.find(table=>table.id===sheet.value);
  const fieldId=field.value,columnLabel=table.fields.find(column=>column.id===fieldId).label;
  const columns=model.board(doc,sheet.value,fieldId);
  const board=node('div',undefined,'productivity-board');
  board.tabIndex=0;board.setAttribute('role','region');board.setAttribute('aria-label','依狀態瀏覽紀錄');
  for(const column of columns){
   const records=column.records.filter(record=>(record.title+' '+record.notes).toLocaleLowerCase().includes(text));
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
