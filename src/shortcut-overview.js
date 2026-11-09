'use strict';
(() => {
 const $=id=>document.getElementById(id),M=window.shortcutInventoryModel;
 function init(){
  let settings={},snippets=[],request=0,writing=false,signature='';const drafts=new Map();
  const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
  const status=text=>$('shortcut-overview-status').textContent=text;
  const sourceSignature=value=>JSON.stringify([window.globalShortcutModel.KEYS.map(key=>value[key]),value.floatingQuickActions,value.favoriteShortcuts,value.draftLocalShortcuts,value.focusShortcutIds]);
  function focusEntry(row){const id=row.kind==='global'?'settings-'+row.key.replace(/Shortcut$/,'')+'-shortcut':'favorite-shortcut-'+row.key;const input=$(id);input?.scrollIntoView({block:'center'});input?.focus();}
  async function save(row,input){
   if(writing)return;writing=true;const value=window.shortcutControls.get(input);
   try{
    const fresh=await window.desktopAPI.get(),all=await window.productivityAPI.snippetList();
    if(row.kind==='action'){
     const actions=fresh.floatingQuickActions.map(item=>item.id===row.target?{...item,shortcut:value}:item);
     if(!actions.some(item=>item.id===row.target))throw new Error('快捷動作已移除');
     window.globalShortcutModel.validatePair({...fresh,floatingQuickActions:actions},all);await window.desktopAPI.configure({floatingQuickActions:actions});
    }else{const candidate=all.map(item=>item.id===row.target?{...item,shortcut:value}:item);window.globalShortcutModel.validatePair(fresh,candidate);await window.productivityAPI.snippetShortcut(row.target,value);}
    drafts.delete(row.id);status('快捷鍵已儲存');await refresh();
   }catch(error){status(String(error.message||error));}finally{writing=false;}
  }
  async function saveFocus(row,checked){
   if(writing){render();return;}writing=true;
   try{
    const fresh=await window.desktopAPI.get(),ids=new Set(fresh.focusShortcutIds);
    if(checked)ids.add(row.id);else ids.delete(row.id);
    const result=await window.desktopAPI.configure({focusShortcutIds:[...ids]});
    settings=result.settings;signature=sourceSignature(settings);status(result.warning||'專注模式的保留清單已儲存');render();
   }catch(error){status(String(error.message||error));render();}finally{writing=false;}
  }
  function render(){
   const rows=M.rows(settings,snippets,window.studioShortcuts.getBindings(),window.studioShortcutModel?.LABELS||{}),conflicts=M.conflicts(rows),bad=new Map();
   for(const [a,b] of conflicts){bad.set(a.id,b.label);bad.set(b.id,a.label);}
   const query=$('shortcut-overview-query').value.trim().toLocaleLowerCase(),scope=$('shortcut-overview-scope').value;
   const shown=rows.filter(row=>(!scope||row.scope===scope)&&[row.label,row.source,M.SCOPES[row.scope],row.shortcut].join(' ').toLocaleLowerCase().includes(query));
   $('shortcut-overview-count').textContent=shown.length+' / '+rows.length+' 項 · '+conflicts.length+' 組衝突';
   const root=$('shortcut-overview-list');root.replaceChildren();
   for(const row of shown){
    const tr=node('tr'),label=node('td'),name=node('strong',row.label);label.append(name,node('small',row.source+(row.enabled?'':'（已停用）')));tr.append(label,node('td',M.SCOPES[row.scope]));
    const binding=node('td'),actions=node('td');
    if(['action','snippet'].includes(row.kind)){
     const input=node('input');input.setAttribute('aria-label',row.label+'快捷鍵');window.shortcutControls.bind(input);window.shortcutControls.set(input,drafts.get(row.id)??row.shortcut);
     input.addEventListener('keydown',()=>drafts.set(row.id,window.shortcutControls.get(input)));
     const button=node('button','儲存');button.type='button';button.className='btn btn-ghost';button.addEventListener('click',()=>save(row,input));binding.append(input);actions.append(button);
    }else{binding.append(node('kbd',row.shortcut?row.shortcut.replace('CommandOrControl','Ctrl'):'未設定'));if(row.kind!=='fixed'){const edit=node('button','設定');edit.type='button';edit.className='btn btn-ghost';edit.addEventListener('click',()=>focusEntry(row));actions.append(edit);}else actions.append(node('small','依操作情境啟用'));}
    if(row.scope==='global'&&row.enabled&&row.shortcut){
     const label=node('label'),check=node('input');check.type='checkbox';check.checked=settings.focusShortcutIds?.includes(row.id)===true;
     check.setAttribute('aria-label','專注時保留 '+row.label);
     check.addEventListener('change',()=>saveFocus(row,check.checked));
     label.className='check-row';label.append(check,node('span','專注時保留'));actions.append(label);
    }
    if(bad.has(row.id)){tr.dataset.conflict='true';binding.append(node('small','與「'+bad.get(row.id)+'」重複'));}
    tr.append(binding,actions);root.append(tr);
   }
  }
  async function refresh(){const current=++request;try{const [prefs,list]=await Promise.all([window.desktopAPI.get(),window.productivityAPI.snippetList()]);if(current!==request)return;settings=prefs;snippets=list;signature=sourceSignature(settings);render();}catch(error){status(String(error.message||error));}}
  $('shortcut-overview-query').addEventListener('input',render);$('shortcut-overview-scope').addEventListener('change',render);$('shortcut-overview-refresh').addEventListener('click',refresh);
  for(const button of document.querySelectorAll('[data-open-shortcuts]'))button.addEventListener('click',()=>window.settingsUI.openCategory('shortcuts'));
  window.desktopAPI.onChanged(({settings})=>{if(settings&&sourceSignature(settings)!==signature)void refresh();});window.productivityAPI.onShortcutSources?.(()=>void refresh());void refresh();
 }
 window.shortcutOverviewUI=Object.freeze({init});
})();
