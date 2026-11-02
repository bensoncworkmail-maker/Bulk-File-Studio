'use strict';
(()=>{
 function create({getSettings,getQuery,api,onError=()=>{},setTimeoutFn=setTimeout,clearTimeoutFn=clearTimeout}){
  let timer=null,serial=0,active=false,composing=false,signature='';
  const enabled=()=>getSettings().floatingGlobalSearch!==false&&getSettings().floatingSearchMode==='live',minimum=()=>getSettings().floatingSearchMinLength||1,valid=query=>query.trim().length>=minimum();
  function clear(){clearTimeoutFn(timer);timer=null;}
  function fail(error,id){if(id===serial){active=false;onError(error);}}
  function cancel(){const handled=active;clear();const id=++serial;active=false;if(handled)Promise.resolve(api.cancelFloatingSearch(id)).catch(error=>fail(error,id));return handled;}
  function prepare(query){const id=++serial;active=true;let promise;try{promise=Promise.resolve(api.prepareFloatingSearch(query,id));}catch(error){promise=Promise.reject(error);}return {id,promise};}
  function input(event={}){clear();if(composing||event.isComposing)return;if(!enabled()||!valid(getQuery())){cancel();return;}const query=getQuery(),{id,promise}=prepare(query);promise.catch(error=>fail(error,id));timer=setTimeoutFn(async()=>{timer=null;try{await promise;if(id===serial&&enabled()&&!composing&&query===getQuery()){const result=await api.previewFloatingSearch(query,id,false);if(id===serial&&result?.opened===false)active=false;}}catch(error){fail(error,id);}},getSettings().floatingSearchDelay||300);}
  async function activate(){clear();if(!enabled()||composing||!valid(getQuery()))return false;const query=getQuery(),{id,promise}=prepare(query);try{await promise;if(id!==serial||!enabled()||composing)return false;const result=await api.previewFloatingSearch(query,id,true);if(id===serial&&result?.opened===false){active=false;return false;}return true;}catch(error){fail(error,id);return false;}}
  function settingsChanged(){const prefs=getSettings(),next=JSON.stringify([prefs.floatingGlobalSearch,prefs.floatingSearchMode,prefs.floatingSearchDelay,prefs.floatingSearchMinLength]);if(signature&&signature!==next)cancel();signature=next;}
  return Object.freeze({enabled,input,activate,cancel,isActive:()=>active,isComposing:()=>composing,settingsChanged,compositionStart:()=>{composing=true;cancel();},compositionEnd:()=>{composing=false;input();}});
 }
 const api={create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.studioLiveSearch=Object.freeze(api);
})();
