'use strict';
(() => {
 const M=window.structuredNoteModel;
 function node(tag,text){
  const element=document.createElement(tag);
  if(text!==undefined)element.textContent=text;
  return element;
 }
 function button(text,label,action){
  const control=node('button',text);
  control.type='button';
  control.className='structured-note-button';
  control.title=label;
  control.setAttribute('aria-label',label);
  control.addEventListener('click',action);
  return control;
 }
 function editor(type,initial=[],changed=()=>{}){
  const element=node('div'),list=node('ol'),summary=node('span');
  element.className='structured-note';
  element.dataset.type=type;
  summary.className='structured-note-summary';
  list.className='structured-note-rows';
  const rows=[];
  const value=()=>rows.map(({label,detail})=>{
   const text=label.value.trim();
   if(type==='checklist')return {label:text,done:detail.checked};
   if(type==='workflow')return {label:text,status:detail.value};
   return {label:text,date:detail.value};
  }).filter(item=>item.label);
  const updateSummary=()=>{
   summary.textContent=M.summary(type,value());
  };
  const notify=()=>{updateSummary();changed();};
  const redraw=()=>{
   rows.forEach(({label,detail,up,down},index)=>{
    label.setAttribute('aria-label','項目 '+(index+1));
    detail.setAttribute('aria-label',({checklist:'已完成',workflow:'狀態',timeline:'日期'})[type]+' '+(index+1));
    up.setAttribute('aria-disabled',String(index===0));
    down.setAttribute('aria-disabled',String(index===rows.length-1));
   });
   list.replaceChildren(...rows.map(row=>row.element));
   add.disabled=rows.length>=M.MAX_ROWS;
   updateSummary();
  };
  const insert=(item={})=>{
   const row=node('li'),label=node('input'),detail=node(type==='workflow'?'select':'input');
   label.type='text';
   label.maxLength=M.MAX_LABEL;
   label.placeholder='項目名稱';
   label.value=item.label||'';
   if(type==='checklist'){
    detail.type='checkbox';
    detail.checked=item.done===true;
   }else if(type==='workflow'){
    for(const [key,text] of Object.entries(M.STATES)){
     const option=node('option',text);
     option.value=key;
     detail.append(option);
    }
    detail.value=item.status||'pending';
   }else{
    detail.type='date';
    detail.value=item.date||'';
   }
   const move=offset=>{
    const index=rows.indexOf(entry),target=index+offset;
    if(target<0||target>=rows.length)return;
    [rows[index],rows[target]]=[rows[target],rows[index]];
    redraw();
    label.focus();
    changed();
   };
   const up=button('↑','上移項目',()=>move(-1)),down=button('↓','下移項目',()=>move(1));
   const remove=button('×','移除項目',()=>{
    const index=rows.indexOf(entry);
    rows.splice(index,1);
    redraw();
    (rows[Math.min(index,rows.length-1)]?.label||add).focus();
    changed();
   });
   const entry={element:row,label,detail,up,down};
   const actions=node('div');
   actions.className='structured-note-actions';
   const updateState=()=>{
    if(type==='workflow')detail.dataset.status=detail.value;
    if(type==='checklist')row.dataset.done=String(detail.checked);
   };
   label.addEventListener('input',notify);
   detail.addEventListener('change',()=>{updateState();notify();});
   updateState();
   if(type==='checklist')row.append(detail,label);
   else row.append(label,detail);
   if(type!=='timeline')actions.append(up,down);
   actions.append(remove);row.append(actions);
   rows.push(entry);
   return label;
  };
  const add=button('＋ 新增項目','新增'+M.TYPES[type]+'項目',()=>{
   if(rows.length>=M.MAX_ROWS)return;
   const label=insert();
   redraw();
   label.focus();
  });
  add.className+=' structured-note-add';
  const footer=node('div');
  footer.className='structured-note-footer';
  footer.append(add);
  if(type==='timeline')footer.append(button('依日期排序','依日期排序時間軸',()=>{
   const ordered=M.ordered(type,rows.map(row=>({date:row.detail.value,row})));
   rows.splice(0,rows.length,...ordered.map(item=>item.row));
   redraw();changed();
  }));
  footer.append(summary);
  for(const item of initial)insert(item);
  element.append(list,footer);
  redraw();
  return {element,value,clear(){rows.length=0;redraw();}};
 }
 function view(type,items){
  const element=node('div'),list=node('ol'),summary=node('p',M.summary(type,items));
  element.className='structured-note structured-note-view';
  element.dataset.type=type;
  summary.className='structured-note-summary';
  list.className='structured-note-rows';
  for(const item of M.ordered(type,items)){
   const row=node('li'),label=node('span',item.label);
   label.className='structured-note-label';
   if(type==='checklist'){
    row.dataset.done=String(item.done);
    const mark=node('span',item.done?'✓':'');
    mark.className='structured-note-check';
    mark.setAttribute('role','img');
    mark.setAttribute('aria-label',item.done?'已完成':'未完成');
    row.append(mark,label);
   }else{
    const meta=node('span',type==='timeline'?(item.date||'未設定日期'):M.STATES[item.status]);
    meta.className='structured-note-meta';
    if(type==='workflow')meta.dataset.status=item.status;
    row.append(label,meta);
   }
   list.append(row);
  }
  element.append(summary,list);
  return element;
 }
 window.structuredNoteUI=Object.freeze({editor,view});
})();
