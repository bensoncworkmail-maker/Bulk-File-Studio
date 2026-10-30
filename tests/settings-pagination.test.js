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
  const root={dataset:{},style:{setProperty(key,value){this[key]=value;}}};applyRoot(root,normalize({showSource:true,showRules:false,showPaths:true,density:'comfortable'}));
  assert.equal(root.dataset.sourceOpen,'true');assert.equal(root.dataset.rulesOpen,'false');assert.equal(root.dataset.showPaths,'true');assert.equal(root.dataset.density,'comfortable');assert.equal(root.style['--tag-panel-width'],'220px');
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

test('tag panel width accepts numeric pixels, clamps to usable bounds and migrates old settings',()=>{assert.equal(normalize({tagPanelWidth:360}).tagPanelWidth,360);assert.equal(normalize({tagPanelWidth:1}).tagPanelWidth,140);assert.equal(normalize({tagPanelWidth:999}).tagPanelWidth,480);assert.equal(normalize({tagPanelWidth:'wide'}).tagPanelWidth,220);assert.equal(normalize({tagPanelWidth:NaN}).tagPanelWidth,220);});

test('rules width migrates old options and accepts continuous bounded values',()=>{assert.equal(normalize({rulesWidth:'500'}).rulesWidth,'500');assert.equal(normalize({rulesWidth:615}).rulesWidth,'615');assert.equal(normalize({rulesWidth:'100'}).rulesWidth,'280');assert.equal(normalize({rulesWidth:'900'}).rulesWidth,'720');assert.equal(normalize({rulesWidth:'wide'}).rulesWidth,'420');assert.equal(normalize({rulesWidth:Infinity}).rulesWidth,'420');});

test('favorite view migrates existing settings to list and persists only supported modes',()=>{assert.equal(load(storage({[KEY]:JSON.stringify({favoriteSort:'name'})})).favoriteView,'list');assert.equal(load(storage({[KEY]:JSON.stringify({favoriteView:'icons'})})).favoriteView,'icons');assert.equal(normalize({favoriteView:'arbitrary'}).favoriteView,'list');});
test('workspace layout and operation preferences migrate, clamp and apply before paint',()=>{
 const settings=normalize({notesPanelWidth:999,notesDetailWidth:1,notesRowHeight:0,notesPageSize:25,notesOpenAfterSave:true,notesOpenMode:'double',notesLinkMode:'tags',settingsTab:'notes'});assert.equal(settings.notesPanelWidth,480);assert.equal(settings.notesDetailWidth,280);assert.equal(settings.notesRowHeight,28);assert.equal(settings.notesPageSize,25);assert.equal(settings.notesOpenAfterSave,true);assert.equal(settings.notesOpenMode,'double');assert.equal(settings.settingsTab,'notes');assert.equal(DEFAULTS.notesOpenAfterSave,false);assert.equal(normalize({notesPanelWidth:NaN,notesOpenAfterSave:'true',notesPageSize:5}).notesPageSize,100);const root={dataset:{},style:{setProperty(key,value){this[key]=value;}}};applyRoot(root,settings);assert.equal(root.style['--notes-panel-width'],'480px');assert.equal(root.style['--notes-detail-width'],'280px');assert.equal(root.style['--notes-row-height'],'28px');
});
test('workspace cards and compact display preferences do not carry folder access authorization',()=>{const settings=normalize({notesView:'cards',notesCardSize:'small',notesCompact:false,workspaceShareEnabled:true});assert.equal(settings.notesView,'cards');assert.equal(settings.notesCardSize,'small');assert.equal(settings.notesCompact,false);assert.equal(settings.workspaceShareEnabled,undefined);assert.equal(normalize({notesView:'invalid'}).notesView,'list');});

test('workspace per-table fields and search settings normalize and round-trip safely',()=>{
 const id='11111111-1111-4111-8111-111111111111',field='22222222-2222-4222-8222-222222222222';const input={notesPanelView:'cards',notesCardFields:{[id]:[field,field,{},'bad'],'__proto__':[],'garbage':[]},notesCardShowNotes:false,notesSearchScope:'all',notesSearchMatch:'any',notesSearchCase:true,notesSearchParent:false};
 const result=normalize(input);assert.deepEqual(result.notesCardFields,{[id]:[field]});assert.equal(result.notesCardShowNotes,false);assert.equal(result.notesPanelView,'cards');assert.equal(result.notesSearchMatch,'any');assert.equal(result.notesSearchCase,true);assert.equal(result.notesSearchParent,false);assert.deepEqual(normalize(JSON.parse(JSON.stringify(result))),result);assert.deepEqual(normalize({notesCardFields:[]}).notesCardFields,{});assert.equal(normalize({notesSearchScope:'network',notesSearchCase:'yes'}).notesSearchScope,'sheet');assert.equal(normalize({notesSearchCase:'yes'}).notesSearchCase,false);assert.deepEqual(normalize({notesCardFields:{[id]:[]}}).notesCardFields,{[id]:[]});
});
