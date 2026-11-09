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
  control.setAttribute('aria-label',label);
  control.addEventListener('click',action);
  return control;
 }
 function editor(type,initial=[],changed=()=>{}){
  const element=node('div'),list=node('ol');
  element.className='structured-note';
  list.className='structured-note-rows';
  const rows=[];
  const value=()=>rows.map(({label,detail})=>{
   const text=label.value.trim();
   if(type==='checklist')return {label:text,done:detail.checked};
   if(type==='workflow')return {label:text,status:detail.value};
   return {label:text,date:detail.value};
  }).filter(item=>item.label);
  const redraw=()=>{
   rows.forEach(({label,detail,up,down},index)=>{
    label.setAttribute('aria-label','項目 '+(index+1));
    detail.setAttribute('aria-label',({checklist:'已完成',workflow:'狀態',timeline:'日期'})[type]+' '+(index+1));
    up.hidden=index===0;
    down.hidden=index===rows.length-1;
   });
   list.replaceChildren(...rows.map(row=>row.element));
   add.disabled=rows.length>=M.MAX_ROWS;
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
   label.addEventListener('input',changed);
   detail.addEventListener('change',changed);
   row.append(label,detail);
   if(type!=='timeline')row.append(up,down);
   row.append(remove);
   rows.push(entry);
   return label;
  };
  const add=button('＋ 新增項目','新增'+M.TYPES[type]+'項目',()=>{
   const label=insert();
   redraw();
   label.focus();
  });
  for(const item of initial)insert(item);
  element.append(list,add);
  redraw();
  return {element,value,clear(){rows.length=0;redraw();}};
 }
 window.structuredNoteUI=Object.freeze({editor});
})();
