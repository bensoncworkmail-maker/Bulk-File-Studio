'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFAULTS,KEY,load,normalize,applyRoot}=require('../src/settings-model');
const {paginate}=require('../src/list-pagination');
function storage(values) {return {getItem:key=>values[key]??null};}
test('settings migrate the existing theme and font without changing other defaults',()=>{
  const settings=load(storage({'brs-theme':'light','brs-font-size':'17'}));
  assert.equal(settings.theme,'light');assert.equal(settings.fontSize,'17');assert.equal(settings.showSource,false);assert.equal(settings.density,'compact');
  assert.equal(settings.rememberRules,true);
});
test('persisted settings take priority over legacy values and reject invalid configuration',()=>{
  const settings=load(storage({[KEY]:JSON.stringify({theme:'dark',fontSize:'19',pageSize:250,rememberRules:false,showSource:true}), 'brs-theme':'light'}));
  assert.equal(settings.theme,'dark');assert.equal(settings.pageSize,250);assert.equal(settings.rememberRules,false);assert.equal(settings.showSource,true);
  assert.deepEqual(normalize({pageSize:0,fontSize:'99',showSource:'true',startPage:'unknown'}),{...DEFAULTS});
  assert.deepEqual(load(storage({[KEY]:'corrupt JSON'})),{...DEFAULTS});
  assert.deepEqual(load({getItem(){throw new Error('storage disabled');}}),{...DEFAULTS});
});
test('persisted layout can be applied before the first paint',()=>{
  const root={dataset:{}};applyRoot(root,normalize({showSource:true,showRules:false,showPaths:true,density:'comfortable'}));
  assert.equal(root.dataset.sourceOpen,'true');assert.equal(root.dataset.rulesOpen,'false');assert.equal(root.dataset.showPaths,'true');assert.equal(root.dataset.density,'comfortable');
});
test('pagination exposes every item, including records beyond the old truncation limits',()=>{
  const items=Array.from({length:1057},(_,i)=>i);
  for(const size of [100,250,500]) {
    const visited=[];
    for(let page=0;page<paginate(items,0,size).pageCount;page++)visited.push(...paginate(items,page,size).rows);
    assert.deepEqual(visited,items);assert.equal(items.length,1057);
    const last=paginate(items,9999,size);assert.equal(last.end,1057);assert.equal(last.hasNext,false);
  }
});
test('empty or newly filtered lists clamp page indexes and keep display boundaries valid',()=>{
  assert.deepEqual(paginate([],99,100),{rows:[],page:0,pageCount:1,start:0,end:0,total:0,hasPrevious:false,hasNext:false});
  const filtered=paginate(['a','b'],12,100);assert.equal(filtered.page,0);assert.equal(filtered.start,1);assert.equal(filtered.end,2);
  assert.equal(paginate(Array(550).fill('x'),1,250).start,251);
});
