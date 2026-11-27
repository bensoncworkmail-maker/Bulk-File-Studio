'use strict';
// One owner for page visibility and active navigation. Data stays with each feature.
(() => {
 const PAGES=Object.freeze({home:{tab:'tab-home',sections:['home-page']},rename:{tab:'tab-rename',sections:['rename-intro','rename-workspace','rename-footer']},tracking:{tab:'tab-tracking',sections:['tracking-page']},favorites:{tab:'tab-favorites',sections:['favorites-page']},notes:{tab:'tab-notes',sections:['notes-page']},search:{tab:'tab-search',sections:['search-page']},zip:{tab:'tab-zip',sections:['zip-update-page']},planning:{tab:'tab-planning',sections:['planning-page']},logs:{tab:'tab-logs',sections:['logs-page']},snippets:{tab:'tab-snippets',sections:['snippets-page']},productivity:{tab:'tab-productivity',sections:['productivity-page']},settings:{tab:'tab-settings',sections:['settings-page']},info:{tab:'tab-info',sections:['info-page']}});
 function create({document,canNavigate=()=>true,onShow=()=>{}}){
  let current=null;const groups=[...document.querySelectorAll('.app-nav-group')];
  for(const group of groups){group.addEventListener('toggle',()=>{if(group.open)for(const other of groups)if(other!==group)other.open=false;});group.addEventListener('keydown',event=>{if(event.key==='Escape'){group.open=false;group.querySelector('summary')?.focus();}});}
  document.addEventListener?.('click',event=>{for(const group of groups)if(!group.contains(event.target))group.open=false;});
  function groupState(){const selected=current?document.getElementById(PAGES[current].tab):null;for(const group of groups){const active=selected&&group.contains(selected),summary=group.querySelector('summary'),label=summary.querySelector('.app-nav-label');summary.classList.toggle('active',Boolean(active));if(group.id==='nav-files'){if(label)label.textContent='更多';summary.setAttribute('aria-label',active?'更多，目前頁面：'+selected.textContent.trim():'更多頁面');}else if(label)label.textContent=active?selected.textContent.trim():label.getAttribute('data-default-label');}}
  function configure(value){const model=typeof module!=='undefined'&&module.exports?require('./navigation-model'):window.studioNavigationModel;if(!model)return;const prefs=model.normalize(value),bar=document.querySelector('.studio-tabs'),more=document.getElementById('nav-files'),menu=more?.querySelector('.app-nav-menu');if(!bar||!menu)return;const focused=document.activeElement;for(const key of prefs.order){const tab=document.getElementById(PAGES[key].tab);(prefs.collapsed.includes(key)?menu:bar).append(tab);}bar.append(more);more.hidden=!prefs.collapsed.length;more.classList.toggle('hidden',!prefs.collapsed.length);if(focused&&menu.contains(focused))more.querySelector('summary').focus();groupState();}
  return Object.freeze({current:()=>current,configure,show(view){
   if(!Object.hasOwn(PAGES,view)||!canNavigate(view))return false;
   for(const [key,page] of Object.entries(PAGES)){const active=key===view;for(const id of page.sections)document.getElementById(id)?.classList.toggle('hidden',!active);const tab=document.getElementById(page.tab);if(tab){tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active));if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}}
   current=view;groupState();for(const group of groups){const focused=group.contains(document.activeElement);group.open=false;if(focused)group.querySelector('summary')?.focus();}
   for(const id of ['btn-undo','btn-export','btn-favorite-selected'])document.getElementById(id)?.classList.toggle('hidden',view!=='rename');current=view;onShow(view);return true;
  }});
 }
 const api={PAGES,create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.studioNavigation=Object.freeze(api);
})();
