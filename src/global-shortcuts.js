'use strict';
(() => {
 function normalize(value){
  if(typeof value!=='string'||value.length>100)return null;if(value==='')return '';
  const parts=value.split('+'),key=parts.pop(),mods=new Set(parts.map(p=>['Ctrl','Control','CmdOrCtrl','CommandOrControl'].includes(p)?'CommandOrControl':p));
  if(mods.size!==parts.length||[...mods].some(p=>!['CommandOrControl','Alt','Shift'].includes(p)))return null;
  if(!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Home|End|PageUp|PageDown|Up|Down|Left|Right|Insert|Delete)$/.test(key))return null;
  if(!mods.has('CommandOrControl')&&!mods.has('Alt')&&!/^F\d+$/.test(key))return null;
  if((mods.has('Alt')&&key==='F4')||(mods.has('CommandOrControl')&&mods.has('Alt')&&key==='Delete'))return null;
  return ['CommandOrControl','Alt','Shift'].filter(p=>mods.has(p)).concat(key).join('+');
 }
 function fromEvent(e){
  if(e.repeat||e.isComposing)return null;
  const key=/^Key[A-Z]$/.test(e.code||'')?e.code.slice(3):/^Digit[0-9]$/.test(e.code||'')?e.code.slice(5):e.key===' '?'Space':e.key?.replace(/^Arrow/,'');
  return normalize([e.ctrlKey||e.metaKey?'CommandOrControl':'',e.altKey?'Alt':'',e.shiftKey?'Shift':'',key?.length===1?key.toUpperCase():key].filter(Boolean).join('+'));
 }
 function validatePair(settings){const used=new Set();for(const key of ['mainShortcut','floatingShortcut','collapseShortcut']){const value=settings[key];if(value&&used.has(value))throw new Error('主視窗、浮動工具與收合／展開不能使用相同的全域快捷鍵');if(value)used.add(value);}}
 const api={normalize,fromEvent,validatePair,display:value=>value?value.replace('CommandOrControl','Ctrl'):'未設定'};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.globalShortcutModel=Object.freeze(api);
})();
