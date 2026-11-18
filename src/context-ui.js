'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.workflowAPI,M=window.contextModel;if(!api?.contextState||!M)return;
 const listeners=new Set();let state=null,initialized=false,working=false,switching=false,request=0,timer,lastPublished,options={isBusy:()=>false};
 const current=()=>M.current(state),defaults=()=>M.defaults(state);
 const message=(text,error=false)=>{$('context-status').textContent=text;$('context-status').classList.toggle('error',error);$('context-toggle').classList.toggle('context-error',error);};
 function position(){
  const panel=$('context-panel');if(panel.hidden)return;const anchor=$('context-toggle').getBoundingClientRect?.()||{right:window.innerWidth||1024,bottom:70},width=window.innerWidth||1024,height=window.innerHeight||768,panelWidth=Math.min(420,Math.max(0,width-24)),top=Math.min(anchor.bottom+8,Math.max(12,height-160));
  panel.style.width=panelWidth+'px';panel.style.left=Math.max(12,Math.min(anchor.right-panelWidth,width-panelWidth-12))+'px';panel.style.top=Math.max(12,top)+'px';panel.style.maxHeight=Math.max(0,height-Math.max(12,top)-12)+'px';
 }
 function close(focus=false){const panel=$('context-panel');if(!panel.hidden&&panel.matches?.(':popover-open'))panel.hidePopover?.();panel.hidden=true;$('context-toggle').setAttribute('aria-expanded','false');if(focus)$('context-toggle').focus();}
 function open(){if(document.querySelector('dialog[open]'))return false;const panel=$('context-panel');render();panel.hidden=false;position();panel.showPopover?.();$('context-toggle').setAttribute('aria-expanded','true');($('context-select').disabled?$('context-manage'):$('context-select')).focus();return true;}
 function render(){
  const select=$('context-select'),selected=current();select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='未使用情境';select.append(empty);
  for(const row of state?.contexts||[]){const item=document.createElement('option');item.value=row.id;item.textContent=row.name;select.append(item);}select.value=selected?.id||'';select.disabled=working||!state?.contexts.length;
  $('context-open-master').disabled=working||!selected?.masterId;$('context-manage').disabled=working;$('context-refresh').disabled=working;
  $('context-manage').textContent=state?.contexts.length?'管理情境':'建立情境';$('context-current').textContent=selected?(selected.masterTitle?'主紀錄：'+selected.masterTitle:selected.missingMaster?'主紀錄已移除，請編輯情境':'尚未連結主紀錄'):'先選一個客戶或專案，相關工具會預選資料。';
  $('context-panel').setAttribute('aria-busy',String(working));$('context-toggle').disabled=working;$('context-trigger-name').textContent=selected?.name||'未使用';$('context-toggle').title=selected?'目前情境：'+selected.name+'；點擊切換或開啟常用資源':'開啟工作情境，選擇客戶或專案';
  const list=$('context-resource-list');list.replaceChildren();const names={record:'主紀錄',workset:'工作集',tracking:'追蹤搜尋',view:'儲存檢視',snippet:'文字範本'};
  $('context-resources-title').textContent=selected?'「'+selected.name+'」的常用資源':'情境常用資源';
  for(const item of selected?.resources||[]){const button=document.createElement('button');button.type='button';button.className='btn btn-ghost context-resource';button.textContent=names[item.kind]+' · '+item.name+(item.available?'':'（請重新連結）');button.disabled=working||!item.available;button.addEventListener('click',()=>openResource(item.kind,item.id));list.append(button);}
  if(!selected?.resources.length){const hint=document.createElement('p');hint.textContent='還沒有常用資源，可到「管理情境」加入追蹤、工作集或範本。';list.append(hint);}
 }
 async function publish(reason){render();const serialized=JSON.stringify(defaults());if(serialized===lastPublished&&reason!=='switch')return;lastPublished=serialized;await Promise.allSettled([...listeners].map(listener=>Promise.resolve().then(()=>listener(defaults(),{reason}))));}
 async function refresh(){const version=++request;try{const next=await api.contextState();if(version!==request)return false;state=next;await publish('refresh');return true;}catch(error){if(version===request)message('情境資料讀取失敗：'+error.message,true);return false;}}
 function guard(mode='navigate'){
  if(working||options.isBusy()||window.notesUI?.isBusy?.()||window.workflowHub?.isBusy?.()||document.querySelector('dialog[open]')||window.notesUI?.canLeave?.()===false){message('請先完成或取消目前操作，再切換情境。',true);return false;}
  const allowed=mode==='switch'&&window.productivityUI?.canChangeContext?window.productivityUI.canChangeContext():window.productivityUI?.canLeave?.();if(allowed===false){message('已保留目前內容，情境未切換。');return false;}return true;
 }
 async function switchTo(id){
  id=id||null;if(working)return false;if(!state){message('情境資料尚未載入，請重新整理。',true);return false;}if(state.activeContextId===id){render();return true;}if(!guard('switch')){render();return false;}
  working=true;switching=true;window.workflowHub?.setContextSwitching?.(true);request++;render();message('正在切換情境…');
  try{const next=await api.context(id,state.revision);state=next;switching=false;await publish('switch');message(current()?'已切換至「'+current().name+'」；搜尋與日曆範圍保持原設定。':'已清除情境預選；搜尋與日曆範圍保持原設定。');return true;}
  catch(error){message('切換未能完成：'+error.message+'。請核對目前情境後重試。',true);await refresh();return false;}
  finally{switching=false;working=false;window.workflowHub?.setContextSwitching?.(false);render();if(!$('context-panel').hidden)($('context-select').disabled?$('context-manage'):$('context-select')).focus();}
 }
 async function action(task){if(!guard())return false;working=true;render();message('');try{const result=await task();if(result===false){message('已保留目前內容，未開啟資源。');return false;}close();return true;}catch(error){message('無法開啟：'+error.message,true);return false;}finally{working=false;render();}}
 function openResource(kind,id){return action(async()=>{const resource=current()?.resources.find(row=>row.kind===kind&&row.id===id&&row.available);if(!resource)throw Error('資源已移除，請重新整理或編輯情境。');if(kind==='record'||kind==='view')return window.notesUI.openSearchTarget(kind,id);if(kind==='tracking')return window.everythingTrackingUI.open(id);if(kind==='snippet')return window.workflowHub.openSnippet(id);if(kind==='workset'){const result=await window.productivityAPI.worksetOpen(id);if(result.recordId&&await window.notesUI.openSearchTarget('record',result.recordId)===false)return false;if(result.failures?.length)message('部分位置未能開啟：'+result.failures.join('；'),true);return result;}throw Error('不支援的資源類型');});}
 function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(!switching)void refresh();},100);}
 function init(config={}){
  if(initialized)return;initialized=true;options={...options,...config};render();
  $('context-select').addEventListener('change',()=>switchTo($('context-select').value));
  $('context-open-master').addEventListener('click',()=>openResource('record',current()?.masterId));
  $('context-manage').addEventListener('click',()=>action(()=>window.productivityUI.openSection('contexts')));
  $('context-refresh').addEventListener('click',()=>{if(!working)void refresh();});
  $('context-toggle').addEventListener('click',()=>{if(!$('context-panel').hidden)close(true);else open();});
  $('context-panel-close').addEventListener('click',()=>close(true));
  $('context-panel').addEventListener('toggle',event=>{if(event.newState==='closed'){$('context-panel').hidden=true;$('context-toggle').setAttribute('aria-expanded','false');}});
  $('context-panel').addEventListener('focusout',event=>{const target=event.relatedTarget;if(target&&!$('context-panel').contains(target)&&target!==$('context-toggle'))close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('context-panel').hidden){event.preventDefault();close(true);}});
  document.addEventListener('pointerdown',event=>{if(!$('context-panel').contains(event.target)&&!$('context-toggle').contains(event.target))close();});
  window.addEventListener?.('resize',position);
  api.onContextChanged?.(()=>{if(!switching)void refresh();});window.workspaceAPI?.onChanged?.(schedule);window.productivityAPI?.onShortcutSources?.(schedule);window.everythingAPI?.onTrackingChanged?.(schedule);
  void refresh();
 }
 window.contextUI=Object.freeze({init,current:defaults,ready:()=>Boolean(state),switchTo,refresh,openResource,isSwitching:()=>switching,subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);}});
})();
