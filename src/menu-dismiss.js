'use strict';
(()=>{
 const selector='details.notes-overflow,details.toolbar-more';
 function closeOutside(target){for(const menu of document.querySelectorAll(selector))if(menu.open&&!menu.contains(target))menu.open=false;}
 document.addEventListener('pointerdown',event=>closeOutside(event.target));
 document.addEventListener('focusin',event=>closeOutside(event.target));
 document.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.isComposing)return;for(const menu of document.querySelectorAll(selector))if(menu.open){menu.open=false;menu.querySelector('summary')?.focus();event.preventDefault();event.stopPropagation();break;}});
 document.addEventListener('click',event=>{const menu=event.target.closest?.(selector);if(menu&&event.target.closest('button'))menu.open=false;});
})();
