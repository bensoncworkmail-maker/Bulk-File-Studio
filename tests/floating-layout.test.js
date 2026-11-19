'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),L=require('../src/floating-layout');
const inside=(b,w,h)=>b.x>=0&&b.y>=0&&b.x+b.width<=w&&b.y+b.height<=h;
for(const [mode,edge]of [['bubble','bottom'],['bar','right'],...['left','right','top','bottom'].map(edge=>['dock',edge])]){
 test(`${mode}/${edge}: launcher footprint contains all controls and panel is separated`,()=>{
  const capsule=L.capsule(mode,edge),size=L.defaults(mode,edge),minimum=L.minimum(mode,edge);
  for(const collapsed of [true,false])for(const scale of [1,1.25,1.5]){
   // Electron geometry is already DIP. Device pixels must never be multiplied
   // into the client rectangle at fractional display scales.
   const w=collapsed?capsule.width:Math.max(minimum.width,Math.floor(960/scale)),h=collapsed?capsule.height:Math.max(minimum.height,Math.floor(780/scale));
   const {launcher,panel}=L.surfaces(mode,edge,collapsed,w,h);assert.ok(inside(launcher,w,h));
   if(panel){assert.ok(inside(panel,w,h));const gap=Math.max(launcher.x-(panel.x+panel.width),panel.x-(launcher.x+launcher.width),launcher.y-(panel.y+panel.height),panel.y-(launcher.y+launcher.height));assert.ok(gap>=12);}
   if(mode==='bubble')assert.deepEqual([launcher.width,launcher.height],[58,58]);
   else{const horizontal=L.horizontal(mode,edge),length=horizontal?launcher.width:launcher.height;assert.equal(L.visibleSlots(length),8);assert.ok(length>=8*42+7*8+18);}
  }
  assert.ok(size.width>=minimum.width&&size.height>=minimum.height);
 });
}
test('small work areas reserve a More button instead of clipping overflow actions',()=>{assert.equal(L.visibleSlots(410),8);assert.equal(L.visibleSlots(300),5);assert.equal(L.visibleSlots(118),2);});
test('floating entrypoint wraps real content and loads the same geometry before the UI',()=>{const fs=require('node:fs'),{documentFromHTML}=require('./helpers/dom'),text=fs.readFileSync(require.resolve('../src/floating.html'),'utf8'),document=documentFromHTML(text);assert.ok(text.indexOf('floating-layout.js')<text.indexOf('floating-workspace-ui.js'));for(const id of ['mini-header','mini-command-bar','mini-search-bar','mini-list','mini-panel-content','mini-status'])assert.equal(document.getElementById(id).closest('main').id,'workspace-panel');assert.equal(document.getElementById('operation-dialog').parentElement,document.body);});
test('embedded context template cannot auto-mount a second standalone desktop view',()=>{const vm=require('node:vm'),fs=require('node:fs'),calls=[],window={desktopContextAPI:{get(){calls.push('get');}}},document={getElementById:id=>id==='floating-context-template'?{}:null};vm.runInNewContext(fs.readFileSync(require.resolve('../src/desktop-context-ui'),'utf8'),{window,document});assert.equal(typeof window.desktopContextView.mount,'function');assert.deepEqual(calls,[]);});
