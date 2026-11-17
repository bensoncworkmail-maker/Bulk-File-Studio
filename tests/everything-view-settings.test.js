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

test('rename presentation and nullable tracking tag survive storage/export and reset within favorites',()=>{
 const settings=Settings.normalize({everythingRenameMode:'dialog',everythingSelectedTag:'  eLearning  '});assert.equal(settings.everythingRenameMode,'dialog');assert.equal(settings.everythingSelectedTag,'elearning');
 const saved=JSON.stringify(settings),storage={getItem:key=>key===Settings.KEY?saved:null};assert.equal(Settings.load(storage).everythingSelectedTag,'elearning');assert.equal(Settings.load(storage).everythingRenameMode,'dialog');
 for(const value of [null,{},33,'a'.repeat(33),'bad\ntag','bad\x7f'])assert.equal(Settings.normalize({everythingSelectedTag:value}).everythingSelectedTag,null);
 assert.equal(Settings.normalize({everythingSelectedTag:''}).everythingSelectedTag,'');assert.equal(Settings.normalize({everythingRenameMode:'unknown'}).everythingRenameMode,'inline');
 const exported=require('../src/settings-export').createSettingsExport({settings,rules:{}},{},'1.120.0');assert.equal(Settings.normalize(exported.settings).everythingSelectedTag,'elearning');assert.equal(Settings.normalize(exported.settings).everythingRenameMode,'dialog');
 const reset=require('../src/settings-catalog').resetPatch('renderer','favorites',Settings.DEFAULTS);assert.equal(reset.everythingSelectedTag,null);assert.equal(reset.everythingRenameMode,'inline');
});
