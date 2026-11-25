'use strict';
(() => {
 const controls='button,input,select,textarea,a,label,[contenteditable]';
 const editable=event=>Boolean(event.target?.closest?.('input:not([type=checkbox]),textarea,select,[contenteditable]'));
 const selectAll=event=>!event.altKey&&(event.ctrlKey||event.metaKey)&&event.key?.toLowerCase()==='a'&&!editable(event);
 const modifier=event=>Boolean(event.shiftKey||event.ctrlKey||event.metaKey);
 const control=event=>Boolean(event.target?.closest?.(controls));
 const primary=event=>event.button===undefined||event.button===0;
 function range(order,anchor,id){
  const from=order.indexOf(anchor),to=order.indexOf(id);
  return from<0||to<0?null:order.slice(Math.min(from,to),Math.max(from,to)+1);
 }
 function guard(row){
  row.addEventListener('mousedown',event=>{
   if(!primary(event)||!modifier(event)||editable(event))return;
   event.preventDefault();
   row.ownerDocument?.getSelection?.()?.removeAllRanges();
  });
 }
 function create({changed=()=>{},limit=Infinity,isBusy=()=>false}={}){
  let order=[],anchor;
  const selected=new Set(),visible=new Map();
  function paint(){
   for(const [key,{row,check}] of visible){
    const on=selected.has(key);
    row.classList.toggle('table-row-selected',on);
    row.setAttribute('aria-selected',String(on));
    if(check)check.checked=on;
   }
   changed(selected);
  }
  function reorder(ids){order=ids;}
  function begin(ids,valid=ids){
   order=ids;visible.clear();
   const existing=new Set(valid);
   for(const id of selected)if(!existing.has(id))selected.delete(id);
   if(!existing.has(anchor))anchor=undefined;
  }
  function add(ids){for(const id of ids)if(selected.size<limit)selected.add(id);}
  function choose(id,event={},checked){
   if(isBusy())return;
   const span=event.shiftKey?range(order,anchor,id):null;
   if(span)add(span);
   else{
    if(checked===undefined&&!modifier(event))selected.clear();
    if(checked??(!modifier(event)||!selected.has(id)))add([id]);else selected.delete(id);
    anchor=id;
   }
   paint();
  }
  function bind(row,id,check){
   visible.set(id,{row,check});row.tabIndex=0;guard(row);
   if(check){
    if(isBusy())check.disabled=true;
    check.checked=selected.has(id);
    let extend=false;
    check.addEventListener('click',event=>{extend=Boolean(event.shiftKey);});
    check.addEventListener('change',()=>{choose(id,{shiftKey:extend},check.checked);extend=false;});
   }
   row.addEventListener('click',event=>{
    if(!primary(event)||control(event)||event.detail>1||!modifier(event)&&row.ownerDocument?.getSelection?.()?.toString())return;
    choose(id,event);row.focus();
   });
   row.addEventListener('keydown',event=>{
    if(isBusy())return;
    if(selectAll(event)){
     event.preventDefault();event.stopPropagation();selected.clear();add(order);paint();
     return;
    }
    if(event.target!==row&&control(event))return;
    if(event.key===' '){
     event.preventDefault();choose(id,event,!selected.has(id));
    }else if(event.key==='Escape'&&selected.size){
     event.preventDefault();event.stopPropagation();clear();
    }
   });
  }
  function clear(){selected.clear();anchor=undefined;paint();}
  return {selected,begin,bind,reorder,paint,clear};
 }
 function enhance(table,{sortable=Infinity,values,state={}}={}){
  const head=table.querySelector('thead tr'),body=table.querySelector('tbody');
  if(!head||!body)return;
  const columns=[...head.children],rows=[...body.children];
  const document=table.ownerDocument,selection=create(),collator=new Intl.Collator('zh-Hant',{numeric:true,sensitivity:'base'});
  let key=state.key??-1,direction=state.direction??1;
  selection.begin(rows);
  const checkHeading=document.createElement('th');
  checkHeading.scope='col';checkHeading.setAttribute('aria-label','選取');checkHeading.className='table-select-heading';
  head.prepend(checkHeading);
  for(const row of rows){
   const cell=document.createElement('td'),check=document.createElement('input');
   check.type='checkbox';check.setAttribute('aria-label','選取 '+row.children[0].textContent.trim());
   cell.className='table-select-cell';cell.append(check);row.prepend(cell);selection.bind(row,row,check);
  }
  const buttons=columns.slice(0,sortable).map((heading,index)=>{
   const label=heading.textContent,button=document.createElement('button');
   button.className='table-sort-heading';button.type='button';button.textContent=label;heading.replaceChildren(button);
   button.addEventListener('click',()=>{
    direction=key===index?-direction:1;key=index;
    state.key=key;state.direction=direction;
    sort();
   });
   return {heading,button,label};
  });
  function sort(){
   const column=new Map(rows.map((row,index)=>[row,values?.[index]?.[key]??row.children[key+1]?.textContent??'']));
   const ordered=[...rows].sort((a,b)=>direction*collator.compare(column.get(a),column.get(b)));
   body.append(...ordered);selection.reorder(ordered);
   buttons.forEach(({heading,button,label},index)=>{
    const active=index===key;
    heading.setAttribute('aria-sort',active?(direction===1?'ascending':'descending'):'none');
    button.textContent=label+(active?(direction===1?' ▲':' ▼'):'');
   });
  }
  if(key>=0)sort();
 }
 const api={modifier,control,selectAll,range,guard,create,enhance};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.tableSelection=Object.freeze(api);
})();
