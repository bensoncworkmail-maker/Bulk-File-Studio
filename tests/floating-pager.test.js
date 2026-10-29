'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const model=require('../src/favorites-model');
function harness(count,policy){
 const els=new Map(),events={};class El{constructor(){this.children=[];this.dataset={};this.style={};this.value='';this.events={};}append(...nodes){this.children.push(...nodes);}appendChild(node){this.append(node);}replaceChildren(){this.children=[];}setAttribute(k,v){this[k]=v;}addEventListener(k,fn){this.events[k]=fn;}focus(){}}
 const source=fs.readFileSync(path.join(__dirname,'../src/floating.js'),'utf8');for(const m of source.matchAll(/\$\('([^']+)'\)/g))els.set(m[1],new El());for(const id of ['mini-search-bar','mini-tools-bar','mini-tags','mini-view-list','mini-view-icons'])els.set(id,new El());
 const items=Array.from({length:count},(_,i)=>({path:'/file'+i+'.txt',label:'',type:'file',tags:[],status:'ready'}));let prefs={floatingPager:policy};let changed;
 const document={documentElement:new El(),getElementById:id=>els.get(id),createElement:()=>new El(),addEventListener:(k,fn)=>events[k]=fn};
 const window={favoritesModel:model,addEventListener(){},favoritesAPI:{list:async()=>({items}),onChanged(){}},desktopAPI:{get:async()=>prefs,onChanged:fn=>changed=fn}};
 vm.runInNewContext(source,{window,document});return {els,events,change:policy=>{prefs={floatingPager:policy};changed({settings:prefs});}};
}
test('floating pager auto hides for a single page, always shows and remains reachable when hidden',async()=>{const h=harness(2,'auto');await new Promise(setImmediate);assert.equal(h.els.get('mini-pager').hidden,true);h.change('always');assert.equal(h.els.get('mini-pager').hidden,false);h.change('hidden');assert.equal(h.els.get('mini-pager').hidden,true);});
test('hidden pagination supports keyboard access to every page and clamps at boundaries',async()=>{const h=harness(201,'hidden');await new Promise(setImmediate);assert.equal(h.els.get('mini-list').children.length,100);h.events.keydown({key:'PageDown',preventDefault(){}});assert.match(h.els.get('mini-count').textContent,/2\/3/);h.events.keydown({key:'PageDown',preventDefault(){}});assert.equal(h.els.get('mini-list').children.length,1);h.events.keydown({key:'PageDown',preventDefault(){}});assert.match(h.els.get('mini-count').textContent,/3\/3/);h.change('auto');assert.equal(h.els.get('mini-pager').hidden,false);});
