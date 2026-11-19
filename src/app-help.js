'use strict';
(() => {
 const $=id=>document.getElementById(id);
 function init({isBusy=()=>false,showFailure=()=>{}}={}){
  const finder=$('function-finder-dialog'),guide=$('user-guide-dialog'),search=$('function-finder-search'),results=$('function-finder-results');let returnFocus=null,guideView,running=false,buttons=[];
  const blocked=()=>isBusy()||running;
  function close(dialog){dialog.close();}
  for(const dialog of [finder,guide])dialog.addEventListener('close',()=>{if(returnFocus?.isConnected!==false)returnFocus?.focus();});
  function open(dialog){if(blocked()||document.querySelector('dialog[open]'))return false;returnFocus=document.activeElement;dialog.showModal();return true;}
  async function navigate(title,dialog){
   if(blocked())return;const item=window.studioFunctionDirectory.entries.find(item=>item.title===title);if(!item)return;
   running=true;close(dialog);
   try{const result=await window.homeUI.openFeature(item);if(result===false){dialog.showModal();(dialog===finder?search:$('user-guide-close')).focus();}}
   catch(error){showFailure('無法開啟功能',error);}
   finally{running=false;}
  }
  function render(){const matches=window.studioFunctionDirectory.search(search.value);buttons=[];results.replaceChildren();$('function-finder-count').textContent=matches.length+' 項功能'+(search.value.trim()&&matches.length?' · Enter 開啟第一項':'');for(const item of matches){const button=document.createElement('button'),label=document.createElement('strong'),description=document.createElement('small'),group=document.createElement('span');button.type='button';button.className='btn btn-ghost function-finder-result';label.textContent=item.title;description.textContent=item.description;group.textContent=item.group;group.className='function-finder-group';button.append(group,label,description);button.addEventListener('click',()=>navigate(item.title,finder));results.append(button);buttons.push(button);}if(!matches.length){const empty=document.createElement('p');empty.textContent='找不到功能，請試試其他關鍵字。';results.append(empty);}}
  function showFinder(){if(open(finder)){search.value='';render();search.focus();}}
  function showGuide(){if(!open(guide))return;if(!guideView)guideView=window.userGuideUI.mount($('user-guide-root'),{openFeature:title=>navigate(title,guide)});guideView.focus();}
  $('app-guide').addEventListener('click',showGuide);
  $('app-function-finder').addEventListener('click',showFinder);$('function-finder-close').addEventListener('click',()=>close(finder));$('user-guide-close').addEventListener('click',()=>close(guide));search.addEventListener('input',render);
  search.addEventListener('keydown',event=>{if(event.isComposing||event.repeat)return;if(event.key==='ArrowDown'&&buttons.length){event.preventDefault();buttons[0].focus();}else if(event.key==='Enter'&&search.value.trim()&&buttons.length){event.preventDefault();void navigate(window.studioFunctionDirectory.search(search.value)[0].title,finder);}});
  results.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing||!['ArrowDown','ArrowUp'].includes(event.key))return;const index=buttons.indexOf(document.activeElement);if(index<0)return;event.preventDefault();const next=index+(event.key==='ArrowDown'?1:-1);if(next<0)search.focus();else buttons[next%buttons.length].focus();});
  document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.isComposing||event.repeat||event.altKey||event.shiftKey)return;const key=event.key.toLowerCase(),help=key==='f1'&&!event.ctrlKey&&!event.metaKey,finding=(event.ctrlKey||event.metaKey)&&key==='k';if(!help&&!finding||blocked()||document.querySelector('dialog[open]'))return;event.preventDefault();if(help)showGuide();else showFinder();});
  return {showGuide,showFinder};
 }
 window.appHelpUI=Object.freeze({init});
})();
