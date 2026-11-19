'use strict';
(() => {
 const dialog=document.getElementById('app-context-dialog'),api=window.desktopContextAPI;let view;
 async function close(){if(!view||!await view.requestClose())return false;dialog.close();document.getElementById('context-toggle')?.focus();return true;}
 api.onOpen(async()=>{if(!view)view=window.desktopContextView.mount(dialog,api,{inApp:true});else await view.refresh();if(!dialog.open)dialog.showModal();});
 api.onClose(()=>{dialog.close();});
 document.getElementById('app-context-close').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();void close();});
})();
