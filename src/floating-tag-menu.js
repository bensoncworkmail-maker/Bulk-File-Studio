'use strict';
const model=require('./favorites-model');
// Build menus from catalog records only. Revalidate the record at activation time.
function tagMenu(items,tag,query,actions){
 if(tag!==null&&(typeof tag!=='string'||tag.length>64))throw new Error('標籤無效');
 if(typeof query!=='string'||query.length>256)throw new Error('搜尋文字過長');
 const key=tag===null?null:tag.toLocaleLowerCase(),q=query.trim().toLocaleLowerCase();
 if(key&& !items.some(item=>item.tags.some(value=>value.toLocaleLowerCase()===key)))throw new Error('標籤已不存在，請重新整理');
 const found=model.sortItems(items.filter(item=>(key===null||(key===''?!item.tags.length:item.tags.some(value=>value.toLocaleLowerCase()===key)))&&(!q||[item.label,item.path,...item.tags].some(value=>value.toLocaleLowerCase().includes(q)))),'name','asc');
 const escape=value=>value.replaceAll('&','&&').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,180);
 const title=key===null?'全部收藏':key===''?'未分類':items.flatMap(item=>item.tags).find(value=>value.toLocaleLowerCase()===key);
 const entry=item=>({label:(item.type==='folder'?'📁 ':'📄 ')+escape(item.label||model.basename(item.path))+(item.status==='ready'?'':'（無法使用）'),enabled:item.status==='ready',toolTip:item.path,click:()=>actions.open(item.id)});
 const template=[{label:escape(title)+' · '+found.length+' 項',enabled:false},{label:'在主視窗顯示此分類',click:()=>actions.main(tag)},{label:'複製此篩選結果全部路徑',enabled:found.length>0,click:()=>actions.copy(found.map(item=>item.id))},{type:'separator'}];
 if(!found.length)template.push({label:'沒有符合條件的收藏',enabled:false});
 else if(found.length<=40)template.push(...found.map(entry));
 else for(let index=0;index<found.length;index+=40)template.push({label:`第 ${index+1}–${Math.min(index+40,found.length)} 項`,submenu:found.slice(index,index+40).map(entry)});
 return {template,count:found.length};
}
module.exports={tagMenu};
