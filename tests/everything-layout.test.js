'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),Settings=require('../src/settings-model'),{documentFromHTML}=require('./helpers/dom');
function setup(initial={}){const document=documentFromHTML(fs.readFileSync(require.resolve('../src/index.html'),'utf8'));let prefs=Settings.normalize(initial);const window={everythingResultColumns:require('../src/everything-result-columns'),settingsUI:{get:()=>prefs,update:patch=>{prefs=Settings.normalize({...prefs,...patch});}}};for(const file of ['resizable-split','everything-layout'])vm.runInNewContext(fs.readFileSync(require.resolve('../src/'+file),'utf8'),{window,document});window.everythingLayout.init();return {document,window,prefs:()=>prefs,$:id=>document.getElementById(id)};}
test('sidebar and table column geometry resize independently, persist, restore on reload and reset',async()=>{
 const h=setup(),root=h.$('everything-tracking-panel'),handle=root.querySelector('.split-handle');handle.setPointerCapture=()=>{};
 await handle.dispatch('pointerdown',{button:0,clientX:240,pointerId:1});await handle.dispatch('pointermove',{clientX:340});await handle.dispatch('pointerup');assert.equal(h.prefs().everythingSidebarWidth,340);
 const name=h.$('everything-column-resize-name');await name.dispatch('pointerdown',{button:0,clientX:280,pointerId:2});await name.dispatch('pointermove',{clientX:400});await name.dispatch('pointerup');assert.equal(h.prefs().everythingColumnWidths.name,400);assert.equal(root.querySelector('.tracking-name-col').style.width,'400px');
 const next=setup(h.prefs());assert.equal(next.$('everything-tracking-panel').querySelector('.tracking-name-col').style.width,'400px');assert.equal(next.$('everything-tracking-panel').querySelector('.split-handle').getAttribute('aria-valuenow'),'340');
 await next.$('everything-column-resize-location').dispatch('keydown',{key:'End'});assert.equal(next.prefs().everythingColumnWidths.location,1200);await next.$('everything-column-resize-location').dispatch('dblclick');assert.ok(next.prefs().everythingColumnWidths.location>=80&&next.prefs().everythingColumnWidths.location<1200);
 next.window.everythingLayout.reset();assert.equal(next.prefs().everythingSidebarWidth,240);assert.deepEqual(next.prefs().everythingColumnWidths,Settings.DEFAULTS.everythingColumnWidths);
});
test('favorites startup, query and geometry settings validate, export and reset within the favorites category',()=>{
 const id=require('node:crypto').randomUUID(),prefs=Settings.normalize({favoriteStartKind:'last',favoriteLastKind:'everything',everythingStartQuery:id,everythingSidebarWidth:999,everythingColumnWidths:{name:1,location:99999,modified:NaN}});
 assert.equal(prefs.favoriteStartKind,'last');assert.equal(prefs.everythingStartQuery,id);assert.equal(prefs.everythingSidebarWidth,520);assert.deepEqual(prefs.everythingColumnWidths,{...Settings.DEFAULTS.everythingColumnWidths,name:80,location:1200});
 const exported=require('../src/settings-export').createSettingsExport({settings:prefs,rules:{}},{},'1.106.0');assert.equal(exported.settings.everythingStartQuery,id);
 const reset=require('../src/settings-catalog').resetPatch('renderer','favorites',Settings.DEFAULTS);assert.equal(reset.everythingStartQuery,'');assert.equal(reset.everythingSidebarWidth,240);assert.deepEqual(reset.everythingColumnWidths,Settings.DEFAULTS.everythingColumnWidths);
 assert.equal(Settings.normalize({everythingStartQuery:'forged',favoriteLastKind:'invalid'}).everythingStartQuery,'');
});

test('copy column preference is normalized, exported and restored with favorites settings',()=>{
 assert.equal(Settings.normalize({}).everythingShowCopy,true);const value=Settings.normalize({everythingShowCopy:false});assert.equal(value.everythingShowCopy,false);
 const exported=require('../src/settings-export').createSettingsExport({settings:value,rules:{}},{},'1.115.0');assert.equal(exported.settings.everythingShowCopy,false);assert.equal(Settings.normalize(exported.settings).everythingShowCopy,false);
 const reset=require('../src/settings-catalog').resetPatch('renderer','favorites',Settings.DEFAULTS);assert.equal(reset.everythingShowCopy,true);
});
