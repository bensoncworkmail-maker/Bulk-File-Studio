'use strict';
// A search result navigates to the original setting without editing its value.
(() => {
 const $=id=>document.getElementById(id),C=window.studioSettingsCatalog;
 function create({get,select,isBusy=()=>false}){
  const query=$('settings-query'),scope=$('settings-query-scope'),root=$('settings-query-results');
  const category=()=>C.groups.find(item=>item.id===get().settingsTab)||C.groups[0];
  const inCategory=()=>scope.value==='current';
  const entries=[];
  for(const group of C.groups){
   const panel=$('settings-panel-'+group.id);
   for(const card of panel.querySelectorAll('.settings-card')){
    const section=card.querySelector('h2')?.textContent||group.label;
    const add=(id,label)=>entries.push({id,label,section,group:group.id,groupLabel:group.label,keywords:group.keywords});
    for(const label of card.querySelectorAll('label')){
     if(label.hidden)continue;
     const control=label.querySelector('input[id],select[id],textarea[id]');
     if(control)add(control.id,label.querySelector('span')?.textContent||control.getAttribute('aria-label')||section);
    }
    for(const control of card.querySelectorAll('button[id]'))add(control.id,control.textContent);
   }
  }
  function reveal(item){
   if(isBusy())return;
   clear();
   select(item.group);
   const target=$(item.id),field=target.closest('label')||target;
   for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
   field.classList.add('settings-target');
   target.scrollIntoView?.({block:'center',behavior:'instant'});
   if(target.disabled){field.tabIndex=-1;field.focus();}else target.focus();
   setTimeout(()=>field.classList.remove('settings-target'),1800);
  }
  function search(){
   const term=query.value.trim(),group=category(),local=inCategory();
   query.placeholder=local?'搜尋「'+group.label+'」':'搜尋設定，例如卡片高度或快捷鍵';
   root.replaceChildren();
   root.hidden=!term;
   $('settings-panels').hidden=Boolean(term);
   $('settings-reset-category').hidden=Boolean(term)||group.id==='data';
   const title=$('settings-group-title'),description=$('settings-group-description');
   if(!term){title.textContent=group.label;description.textContent=group.description;return;}
   const results=C.find(local?entries.filter(item=>item.group===group.id):entries,term);
   title.textContent=local?'搜尋「'+group.label+'」':'搜尋全部設定';
   description.textContent=results.length+' 項符合'+(results.length>60?'，顯示前 60 項，請縮小關鍵字':'');
   for(const item of results.slice(0,60)){
    const button=document.createElement('button'),title=document.createElement('strong'),context=document.createElement('small');
    button.type='button';button.className='settings-search-result';
    title.textContent=item.label;context.textContent=item.groupLabel+' ／ '+item.section;
    button.append(title,context);
    button.addEventListener('click',()=>reveal(item));
    root.append(button);
   }
   if(!results.length){
    const empty=document.createElement('p');
    empty.className='notes-empty';
    empty.textContent=local?'此分類找不到符合的設定，可切換為「全部設定」。':'找不到設定，請試用其他關鍵字。';
    root.append(empty);
   }
  }
  function clear(){query.value='';search();}
  query.addEventListener('input',search);
  query.addEventListener('keydown',event=>{if(event.key==='Escape'){clear();event.preventDefault();}});
  scope.addEventListener('change',search);
  $('settings-query-clear').addEventListener('click',()=>{clear();query.focus();});
  search();
  return Object.freeze({sync:search,clear,beforeTab:()=>{if(!inCategory())clear();}});
 }
 window.studioSettingsWorkbench=Object.freeze({create});
})();
