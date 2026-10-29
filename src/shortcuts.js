'use strict';
(() => {
 const DEFAULTS=Object.freeze({selectAll:'Ctrl+A',clear:'Escape',search:'Ctrl+F',open:'Enter',copy:'Ctrl+Shift+C',edit:'F2',remove:'Delete',refresh:'F5',add:'Ctrl+O',rename:'Ctrl+R',move:'Ctrl+M',undo:'Ctrl+Z',quickTag:'Ctrl+T',importPaths:'Ctrl+Shift+I'});
 const LABELS={selectAll:'選取全部搜尋結果（跨頁）',clear:'取消選取',search:'搜尋收藏',open:'批次開啟（最多 20 項）',copy:'複製所選完整路徑',edit:'編輯標籤',remove:'移除收藏紀錄',refresh:'重新整理',add:'收藏檔案',rename:'加入重新命名',move:'搬移所選檔案',undo:'復原上一批改名／搬移',quickTag:'加入標籤並保留原標籤',importPaths:'從每行路徑匯入收藏'};
 function chord(event){const key=event.key.length===1?event.key.toUpperCase():event.key;if(['Control','Meta','Shift','Alt'].includes(key))return '';return [event.ctrlKey||event.metaKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+');}
 function normalize(input={}) {
   if(!input||typeof input!=='object')input={};
   const out={},used=new Set();
   for(const key of Object.keys(DEFAULTS)) {
     let value=typeof input[key]==='string'?input[key]:DEFAULTS[key];
     if(value!==''&&!/^(?:(?:Ctrl\+)(?:Alt\+)?(?:Shift\+)?[A-Z0-9]|(?:Ctrl\+)?(?:Shift\+)?(?:Enter|Escape|Delete|F[1-9]|F1[0-2]))$/.test(value))value=DEFAULTS[key];
     out[key]=value&&used.has(value)?'':value;
     if(out[key])used.add(out[key]);
   }
   return out;
 }

 const exports={DEFAULTS,LABELS,chord,normalize};
 if(typeof module!=='undefined'&&module.exports){module.exports=exports;return;}
 let shortcuts;try{shortcuts=normalize(JSON.parse(localStorage.getItem('bfs-shortcuts-v1')||'{}'));}catch{shortcuts={...DEFAULTS};}
 function save(){try{localStorage.setItem('bfs-shortcuts-v1',JSON.stringify(shortcuts));return true;}catch{return false;}}
 function init(){const container=document.getElementById('shortcut-settings');container.replaceChildren();for(const key of Object.keys(DEFAULTS)){const label=document.createElement('label');label.className='field';const title=document.createElement('span');title.textContent=LABELS[key];const input=document.createElement('input');input.readOnly=true;input.value=shortcuts[key]||'未設定';input.setAttribute('aria-label',LABELS[key]+'快捷鍵');input.addEventListener('keydown',e=>{if(e.key==='Tab')return;e.preventDefault();e.stopPropagation();const value=e.key==='Backspace'?'':chord(e);if(!value&&e.key!=='Backspace')return;const candidate=normalize({...shortcuts,[key]:value});const status=document.getElementById('shortcut-status');if(Object.entries(shortcuts).some(([other,binding])=>other!==key&&value&&binding===value)){status.textContent='此組合已被其他操作使用';return;}if(candidate[key]!==value){status.textContent='請用 Ctrl 組合、Enter、Escape、Delete 或 F1–F12';return;}shortcuts=candidate;input.value=value||'未設定';status.textContent=save()?'快捷鍵已儲存':'只於本次生效，無法儲存';});label.append(title,input);container.appendChild(label);}
 }
 window.studioShortcuts=Object.freeze({init,getBindings:()=>({...shortcuts}),match:event=>Object.keys(shortcuts).find(key=>shortcuts[key]&&shortcuts[key]===chord(event)),reset:()=>{shortcuts={...DEFAULTS};save();init();}});
})();
