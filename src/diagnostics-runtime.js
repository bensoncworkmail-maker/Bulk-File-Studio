'use strict';
(() => {
 function report(context,error){
  try{
   const message=typeof error==='string'?error:typeof error?.message==='string'?error.message:'未知錯誤';
   const entry={context:String(context).slice(0,120),message:message.slice(0,6000),stack:typeof error?.stack==='string'?error.stack.slice(0,12000):'',code:typeof error?.code==='string'?error.code.slice(0,64):''};
   const pending=window.diagnosticsAPI?.report(entry);pending?.catch(()=>{});
  }catch{/* Reporting must never replace the original error or recurse. */}
 }
 window.studioDiagnostics=Object.freeze({report});
 window.addEventListener('error',event=>report('window-error',event.error||event.message||'資源載入失敗'));
 window.addEventListener('unhandledrejection',event=>report('unhandledrejection',event.reason));
})();
