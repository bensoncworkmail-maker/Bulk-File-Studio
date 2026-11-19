'use strict';
(() => {
 const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const text=(value,max=200)=>{if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw Error('文字格式或長度無效');return value.trim();};
 const id=value=>{if(!ID.test(value))throw Error('請選擇有效項目');return value;};
 function condition(input,depth=0,budget={left:100}){
  if(--budget.left<0)throw Error('每組最多 100 個條件節點');
  if(depth>4||!input||typeof input!=='object')throw Error('條件最多四層');
  if(input.rules){if(!['all','any'].includes(input.mode)||!Array.isArray(input.rules)||input.rules.length>20)throw Error('每組最多 20 個條件');return {mode:input.mode,rules:input.rules.map(value=>condition(value,depth+1,budget))};}
  const field=text(input.field,80),op=input.op;if(!field||!['eq','ne','contains','starts','ends','gt','gte','lt','lte','empty','notEmpty','in'].includes(op))throw Error('條件欄位／比較方式無效');
  if(!['string','number','boolean'].includes(typeof input.value)&&input.value!==null&&input.value!==undefined)throw Error('條件比較值無效');if(typeof input.value==='number'&&!Number.isFinite(input.value))throw Error('條件數字無效');return {field,op,value:input.value??''};
 }
 function evaluate(input,values){
  const value=condition(input);
  if(value.rules){const children=value.rules.map(rule=>evaluate(rule,values)),matched=value.mode==='all'?children.every(item=>item.matched):children.some(item=>item.matched);return {matched,mode:value.mode,children};}
  const actual=values[value.field]??'',left=String(actual).toLocaleLowerCase(),right=String(value.value).toLocaleLowerCase();let matched=false;
  switch(value.op){case'eq':matched=left===right;break;case'ne':matched=left!==right;break;case'contains':matched=left.includes(right);break;case'starts':matched=left.startsWith(right);break;case'ends':matched=left.endsWith(right);break;case'empty':matched=actual===''||Array.isArray(actual)&&actual.length===0;break;case'notEmpty':matched=actual!==''&&(!Array.isArray(actual)||actual.length>0);break;case'in':matched=right.split(/[;,，]/).map(item=>item.trim()).includes(left);break;default:{const numeric=typeof actual==='number'||typeof value.value==='number';if(numeric&&(actual===''||value.value===''))break;const a=numeric?Number(actual):left,b=numeric?Number(value.value):right;matched=value.op==='gt'?a>b:value.op==='gte'?a>=b:value.op==='lt'?a<b:a<=b;}}
  return {...value,actual,matched};
 }
 function legacyRule(rule){return {mode:'all',rules:[...(rule.extensions?[{field:'extension',op:'in',value:rule.extensions}]:[]),...(rule.contains?[{field:'name',op:'contains',value:rule.contains}]:[]),...(rule.after?[{field:'date',op:'gte',value:rule.after}]:[]),...(rule.before?[{field:'date',op:'lte',value:rule.before}]:[])]};}
 function parameters(body){text(body,20000);return [...new Set([...body.matchAll(/\{\{([a-zA-Z][\w.-]{0,49})\}\}/g)].map(match=>match[1]))];}
 function expand(body,values={},now=new Date()){
  const defaults={today:now.toLocaleDateString('sv-SE'),time:now.toLocaleTimeString('sv-SE'),year:String(now.getFullYear()),month:String(now.getMonth()+1).padStart(2,'0'),day:String(now.getDate()).padStart(2,'0')};
  const missing=parameters(body).filter(key=>!Object.hasOwn(values,key)&&!Object.hasOwn(defaults,key));if(missing.length)throw Error('請先填寫：'+missing.join('、'));
  const result=body.replace(/\{\{([a-zA-Z][\w.-]{0,49})\}\}/g,(_,key)=>{const value=String(values[key]??defaults[key]??'');text(value,20000);return value;});if(result.length>100000)throw Error('範本產出超過 100,000 字');return result;
 }
 function definition(kind,input){
  if(!input||typeof input!=='object')throw Error('設定格式無效');const base={id:id(input.id),name:text(input.name,100)};if(!base.name)throw Error('請輸入名稱');
  if(kind==='contexts'){const ids=values=>{if(!Array.isArray(values)||values.length>30)throw Error('最多選取 30 個項目');return [...new Set(values.map(id))];};return {...base,masterId:input.masterId?id(input.masterId):null,worksetId:input.worksetId?id(input.worksetId):null,trackingIds:ids(input.trackingIds||[]),viewIds:ids(input.viewIds||[]),snippetIds:ids(input.snippetIds||[])};}
  if(kind==='formulas'){if(!['count','sum','min','max','earliest','latest','daysUntil'].includes(input.op))throw Error('計算方式無效');return {...base,masterSheetId:id(input.masterSheetId),sourceSheetId:id(input.sourceSheetId),relationFieldId:input.relationFieldId?id(input.relationFieldId):null,valueFieldId:input.valueFieldId?id(input.valueFieldId):null,op:input.op,filter:condition(input.filter||{mode:'all',rules:[]})};}
  if(kind==='automations'){if(!['manual','created','updated'].includes(input.trigger)||!['set','draft','reminder'].includes(input.action))throw Error('觸發或動作無效');return {...base,sheetId:id(input.sheetId),trigger:input.trigger,enabled:input.enabled===true,filter:condition(input.filter||{mode:'all',rules:[]}),action:input.action,fieldId:input.fieldId?id(input.fieldId):null,value:typeof input.value==='boolean'||typeof input.value==='number'?input.value:text(input.value||'',1000),minutes:Math.max(1,Math.min(525600,Math.round(Number(input.minutes)||60)))};}
  throw Error('設定類型無效');
 }
 function values(record){return {title:record.title,notes:record.notes,...record.values};}

 const api={ID,text,id,condition,evaluate,legacyRule,parameters,expand,definition,values};if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.workflowModel=Object.freeze(api);
})();
