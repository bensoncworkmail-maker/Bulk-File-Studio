'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),M=require('../src/everything-view-settings'),Settings=require('../src/settings-model');
test('sort memory remembers each column direction, preserves explicit choices and uses a non-destructive hidden-column fallback',()=>{
 let state=M.select(undefined,'modified','desc');state=M.select(state,'size');assert.equal(state.direction,'asc');state=M.select(state,'size');assert.equal(state.direction,'desc');state=M.select(state,'name');assert.equal(state.direction,'asc');state=M.select(state,'modified');assert.equal(state.direction,'desc');
 const hidden=M.effective(state,['name','size']);assert.equal(hidden.key,'name');assert.equal(state.key,'modified');assert.equal(M.effective(state,['name','modified']).direction,'desc');assert.equal(M.select(state,'unknown').key,'modified');
});
test('sort settings validate IDs and keys, bound old queries, and participate in export and category reset',()=>{
 const id=crypto.randomUUID(),input={[id]:{key:'size',direction:'desc',directions:{size:'desc',modified:'desc',path:'bad'}},bad:{key:'size'}},settings=Settings.normalize({everythingSortStates:input,everythingToolsExpanded:false});
 assert.equal(Object.keys(settings.everythingSortStates).length,1);assert.equal(settings.everythingSortStates[id].direction,'desc');assert.equal(settings.everythingSortStates[id].directions.path,undefined);
 assert.equal(M.sort({key:'constructor',direction:'invalid'}).key,'name');assert.equal(Object.keys(M.normalize(Object.fromEntries(Array.from({length:120},()=>[crypto.randomUUID(),{key:'size'}])))).length,M.MAX_SAVED);
 const exported=require('../src/settings-export').createSettingsExport({settings,rules:{}},{},'1.108.0');assert.equal(exported.settings.everythingSortStates[id].key,'size');assert.equal(exported.settings.everythingToolsExpanded,false);
 const reset=require('../src/settings-catalog').resetPatch('renderer','favorites',Settings.DEFAULTS);assert.deepEqual(reset.everythingSortStates,{});assert.equal(reset.everythingToolsExpanded,true);
});
