'use strict';
(()=>{
 function mount(root,api){let rows=[],query='',request=0,busy=false;const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;},button=(label,task,parent)=>{const el=node('button',label);el.type='button';el.addEventListener('click',()=>run(task));parent.append(el);return el;};
 const intro=node('p','只保存你按「擷取」的文字；本次執行最多 20 項，關閉程式即清除。'),tools=node('div'),search=node('input'),status=node('p'),list=node('div');intro.className='workspace-hint';tools.className='workspace-actions';search.type='search';search.placeholder='搜尋已擷取的文字…';search.setAttribute('aria-label','搜尋剪貼簿項目');status.setAttribute('role','status');root.append(intro,tools,search,status,list);
 async function run(task){if(busy)return;busy=true;request++;try{await task();}catch(error){status.textContent=String(error.message||error);}finally{busy=false;}}
 const capture=button('＋ 擷取目前文字',async()=>{rows=await api.workspace('capture');status.textContent='已擷取';render();},tools);button('清空',async()=>{rows=await api.workspace('clear');render();},tools);
 function render(){list.replaceChildren();for(const row of rows.filter(row=>row.text.toLocaleLowerCase().includes(query))){const card=node('article'),text=node('pre',row.text),actions=node('div');card.className='workspace-card';text.className='workspace-clip-text';actions.className='workspace-actions';card.append(text,node('small',new Date(row.createdAt).toLocaleString()),actions);button('複製',async()=>{await api.workspace('copy',row.id);status.textContent='已複製，請在目標欄位貼上';},actions);button('移除',async()=>{rows=await api.workspace('remove',row.id);render();},actions);list.append(card);}if(!list.children.length)list.append(node('p','沒有符合的剪貼文字'));}
 search.addEventListener('input',()=>{query=search.value.toLocaleLowerCase();render();});async function refresh(){const id=++request;try{const next=await api.workspace('list');if(id===request){rows=next;render();}}catch(error){status.textContent=String(error.message||error);}}void refresh();return {refresh,dispose(){request++;}};
 }
 window.floatingClipboardUI={mount};
})();
