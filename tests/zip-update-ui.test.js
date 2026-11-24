'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{documentFromHTML}=require('./helpers/dom');
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function fixture(preferences={},sourceRows){const document=documentFromHTML(fs.readFileSync(require.resolve('../src/index.html'),'utf8')),calls=[],shown=[];let progress,resolvePreview,cancel=false,pickedTarget;const rows=[{id:'add',name:'els1104/new.dart',size:123,status:'added',destination:'C:\\learning\\els1104\\new.dart'},{id:'nested',name:'els1104/widgets/picker.dart',size:50,status:'changed',destination:'C:\\learning\\els1104\\widgets\\picker.dart'},{id:'same',name:'els1104/same.dart',size:10,status:'same',destination:'C:\\learning\\els1104\\same.dart'},{id:'bad',name:'els1104/bad.dart',size:1,status:'blocked',destination:'C:\\learning\\els1104\\bad.dart',error:'無法寫入'}];const source={root:'C:\\Downloads',folder:'C:\\Downloads',canUp:false,rows:[{id:'archive',name:'patch.zip',kind:'zip',size:200,modified:''},{id:'folder',name:'other',kind:'folder',size:0,modified:''}]},target={root:'C:\\learning',folder:'C:\\learning',canUp:false,rows:[{id:'target-folder',name:'els1104',kind:'folder',size:0,modified:''},{id:'target-file',name:'existing.dart',kind:'file',size:100,modified:''}]};if(sourceRows)source.rows=sourceRows;let state={batchLimit:50,files:[],sourceFolders:['C:\\Downloads'],targetFolders:['C:\\learning'],roots:[],runs:[],selected:{},browsers:{source,target}},api={onProgress:fn=>progress=fn,command:async(action,value)=>{calls.push([action,value]);if(['state','refresh-locations','refresh-browser','browse-source','choose-source-folder'].includes(action))return state;if(['choose-zip','choose-latest','source-open'].includes(action)){state={...state,files:rows,roots:['els1104'],selected:{...state.selected,zipPath:'C:\\Downloads\\patch.zip'}};return state;}if(action==='save-target'){state={...state,savedTargets:[state.selected.target,...(state.savedTargets||[]).filter(path=>path!==state.selected.target)]};return state;}if(action==='select-saved-target'){state={...state,selected:{...state.selected,target:state.savedTargets[value]}};return state;}if(action==='forget-target'){state={...state,savedTargets:[],targetFolders:[]};return state;}if(action==='choose-target'){if(pickedTarget===null)return {canceled:true};state={...state,selected:{...state.selected,target:pickedTarget??target.folder}};return state;}if(action==='target-enter'){state={...state,selected:{...state.selected,target:'C:\\learning\\els1104'},browsers:{source,target:{...target,folder:'C:\\learning\\els1104',canUp:true,rows:[]}}};return state;}if(action==='preview')return new Promise(resolve=>resolvePreview=structureWarning=>resolve({token:'plan',rows,target:state.selected.target,sourceRoot:value,structureWarning}));if(action==='apply')return cancel?{canceled:true}:{id:'run',status:'completed',applied:2,restored:0,rows:[]};if(action==='batch-extract')return {rows:[{status:'completed',archive:'C:/Downloads/patch.zip',destination:'C:/projects/patch',count:1}]};if(action==='cancel')return {requested:true};}},window={zipUpdateView:require('../src/zip-update-view'),settingsUI:{get:()=>preferences,update:patch=>Object.assign(preferences,patch)},zipUpdateAPI:api,zipUpdateTree:require('../src/zip-update-tree'),favoritesUI:{show:key=>{shown.push(key);document.getElementById('zip-update-page').classList.remove('hidden');window.zipUpdateUI.activate();return true;}}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/zip-update-ui'),'utf8'),{window,document,console,setTimeout});const $=id=>document.getElementById('zip-update-'+id),click=async id=>{$(id).dispatch('click');await flush();},check=id=>$('rows').querySelectorAll('input').find(el=>el.dataset.id===id),folder=name=>$('rows').querySelectorAll('input').find(el=>el.dataset.folder===name);return {preferences,document,window,$,calls,shown,click,check,folder,progress:(...a)=>progress(...a),finish:warning=>resolvePreview(warning),pickTarget:value=>pickedTarget=value,cancel:v=>cancel=v,async compare(){await click('choose');$('target').dispatch('click');await flush();}};}
test('ZIP is a real page and inline source and target lists load alongside remembered locations',async()=>{const h=fixture();h.window.zipUpdateUI.open();await flush();assert.deepEqual(h.shown,['zip']);assert.equal(h.$('page').tagName,'SECTION');assert.equal(h.document.getElementById('zip-update-dialog'),null);assert.ok(h.$('sources').textContent.includes('Downloads'));assert.ok(h.$('source-browser-rows').textContent.includes('patch.zip'));assert.ok(h.$('target-browser-rows').textContent.includes('existing.dart'));const zip=h.$('source-browser-rows').querySelectorAll('button').find(b=>b.textContent.includes('patch.zip'));zip.dispatch('click');await flush();assert.ok(h.calls.some(c=>c[0]==='source-open'&&c[1]==='archive'));assert.ok(h.$('rows').textContent.includes('els1104'));});
test('folder selection is tri-state, supports nested collapse and never enables same or blocked files',async()=>{const h=fixture();h.window.zipUpdateUI.open();await flush();await h.compare();assert.equal(h.window.zipUpdateUI.isBusy(),true);h.progress({phase:'compare',current:1,total:4,name:'new.dart'});assert.ok(h.$('status').textContent.includes('1／4'));h.finish();await flush();h.$('filter').value='all';await h.$('filter').dispatch('change');assert.ok(h.folder('els1104').checked);assert.equal(h.check('same'),undefined);const parent=h.$('rows').querySelectorAll('button').find(b=>b.title==='els1104');await parent.dispatch('click');assert.equal(h.check('same').disabled,true);assert.equal(h.check('bad').disabled,true);assert.equal(h.check('nested'),undefined);const widgets=h.$('rows').querySelectorAll('button').find(b=>b.title==='els1104/widgets');await widgets.dispatch('click');assert.ok(h.check('nested'));h.check('add').checked=false;await h.check('add').dispatch('change');assert.ok(h.folder('els1104').indeterminate);assert.equal(h.check('same').disabled,true);h.folder('els1104').checked=true;await h.folder('els1104').dispatch('change');assert.ok(h.check('add').checked);await h.click('collapse-all');assert.equal(h.check('add'),undefined);assert.ok(h.$('apply').textContent.includes('2'));await h.click('apply');const call=h.calls.find(c=>c[0]==='apply');assert.equal([...call[1].ids].sort().join(','),'add,nested');assert.equal(h.$('apply').disabled,true);assert.ok(h.$('status').textContent.includes('已套用 2'));});
test('target browser navigation and source root changes invalidate comparison while native cancel preserves selection',async()=>{const h=fixture();h.window.zipUpdateUI.open();await flush();await h.compare();h.finish();await flush();h.cancel(true);await h.click('apply');assert.equal(h.$('apply').disabled,false);const folder=h.$('target-browser-rows').querySelectorAll('button').find(b=>b.textContent.includes('els1104'));folder.dispatch('click');await flush();assert.equal(h.$('target-path').textContent,'C:\\learning\\els1104');assert.equal(h.$('apply').disabled,true);assert.equal(h.calls.filter(c=>c[0]==='preview').length,2);h.finish();await flush();h.$('root').value='els1104';h.$('root').dispatch('change');await flush();assert.equal(h.calls.at(-1)[0],'preview');assert.equal(h.calls.at(-1)[1],'els1104');h.finish();await flush();assert.equal(h.$('apply').disabled,false);});
test('search reveals nested matching files and folder toggles affect only filtered eligible descendants',async()=>{const h=fixture();h.window.zipUpdateUI.open();await flush();await h.compare();h.finish();await flush();h.$('query').value='picker.dart';await h.$('query').dispatch('input');assert.ok(h.check('nested'));assert.equal(h.check('add'),undefined);h.folder('els1104').checked=false;await h.folder('els1104').dispatch('change');h.$('query').value='';await h.$('query').dispatch('input');assert.equal(h.check('add'),undefined);const parent=h.$('rows').querySelectorAll('button').find(b=>b.title==='els1104');await parent.dispatch('click');assert.equal(h.check('add').checked,true);assert.equal(h.$('apply').textContent.includes('1'),true);});
test('folder expansion is collapsed by default, remembered across reloads, and preview moves to results',async()=>{const preferences={},h=fixture(preferences);h.window.zipUpdateUI.open();await flush();await h.compare();h.finish();await flush();assert.equal(h.check('add'),undefined);assert.equal(h.$('setup').open,true);assert.equal(h.$('comparison').scrolled.block,'start');let toggle=h.$('rows').querySelectorAll('button').find(b=>b.title==='els1104');await toggle.dispatch('click');assert.ok(h.check('add'));assert.deepEqual([...preferences.zipUpdateView.expanded],['els1104']);const next=fixture(JSON.parse(JSON.stringify(preferences)));next.window.zipUpdateUI.open();await flush();await next.compare();next.finish();await flush();assert.ok(next.check('add'));await next.click('collapse-all');assert.equal(next.check('add'),undefined);const final=fixture(next.preferences);final.window.zipUpdateUI.open();await flush();await final.compare();final.finish();await flush();assert.equal(final.check('add'),undefined);await final.click('go-setup');assert.equal(final.$('setup').open,true);assert.equal(final.$('setup').scrolled.block,'start');});
test('each table header saves its own sort and updates accessible sort direction',async()=>{const preferences={},h=fixture(preferences);h.window.zipUpdateUI.open();await flush();const sort=key=>h.$('page').querySelectorAll('[data-zip-sort]').find(b=>b.getAttribute('data-zip-sort')===key);await sort('source:size').dispatch('click');assert.equal(preferences.zipUpdateView.sorts.source.key,'size');await sort('source:size').dispatch('click');assert.equal(preferences.zipUpdateView.sorts.source.direction,'desc');assert.equal(sort('source:size').parentElement.getAttribute('aria-sort'),'descending');await sort('target:modified').dispatch('click');await sort('compare:destination').dispatch('click');assert.equal(preferences.zipUpdateView.sorts.target.key,'modified');assert.equal(preferences.zipUpdateView.sorts.compare.key,'destination');assert.equal(preferences.zipUpdateView.sorts.source.direction,'desc');const next=fixture(preferences);next.window.zipUpdateUI.open();await flush();const restored=next.$('page').querySelectorAll('[data-zip-sort]').find(b=>b.getAttribute('data-zip-sort')==='source:size');assert.equal(restored.parentElement.getAttribute('aria-sort'),'descending');});

test('saved target controls keep the active comparison and removal only clears location lists',async()=>{const h=fixture();h.window.zipUpdateUI.open();await flush();await h.compare();h.finish();await flush();await h.click('save-target');assert.equal(h.$('save-target').disabled,true);assert.ok(h.$('targets').querySelectorAll('optgroup').some(g=>g.label==='已儲存的常用位置'));assert.equal(h.$('apply').disabled,false);await h.click('forget-target');const call=h.calls.find(c=>c[0]==='forget-target');assert.equal(call[1].kind,'saved');assert.equal(call[1].index,0);assert.equal(h.$('targets').value,'');assert.equal(h.$('target-path').textContent,'C:\\learning');assert.equal(h.$('apply').disabled,false);assert.equal(h.$('forget-target').disabled,true);});

test('target panel picker updates the destination and structure warning in the comparison',async()=>{
 const h=fixture();h.window.zipUpdateUI.open();await flush();
 assert.ok(h.$('target-panel').contains(h.$('target')));
 assert.notEqual(h.$('target').parentElement,h.$('apply').parentElement);
 await h.compare();h.finish('目錄結構可能不符。');await flush();
 assert.equal(h.$('compare-target').textContent,'C:\\learning');
 assert.match(h.$('compare-root').textContent,/保留 ZIP 完整層級/);
 assert.equal(h.$('structure-warning').hidden,false);
 assert.ok(h.$('rows').querySelectorAll('td').some(cell=>cell.textContent==='C:\\learning\\els1104'));
 h.pickTarget(null);await h.click('target');
 assert.equal(h.$('apply').disabled,false);
 assert.equal(h.$('structure-warning').hidden,false);
 h.pickTarget('C:\\new-target');await h.click('target');
 assert.equal(h.$('compare-target').textContent,'C:\\new-target');
 assert.equal(h.$('apply').disabled,true);
 assert.equal(h.calls.filter(([action])=>action==='preview').length,2);
 h.finish();await flush();
 assert.equal(h.$('structure-warning').hidden,true);
 assert.equal(h.$('apply').disabled,false);
});

test('footer quick switch lists saved locations and rebuilds the comparison for the selected target',async()=>{
 const h=fixture();h.window.zipUpdateUI.open();await flush();
 const quick=h.$('quick-target');
 assert.equal(quick.parentElement,h.$('apply').parentElement);
 assert.equal(quick.disabled,true);
 assert.equal(quick.querySelectorAll('option').length,1); // Recent locations are not in this list.
 await h.compare();h.finish();await flush();
 await h.click('save-target');
 assert.equal(quick.disabled,false);
 assert.match(quick.textContent,/C:\\learning（目前）/);
 h.pickTarget('C:\\models');await h.click('target');h.finish();await flush();
 await h.click('save-target');
 const choices=quick.querySelectorAll('option');
 assert.deepEqual(choices.map(option=>option.textContent),['常用目標','C:\\models（目前）','C:\\learning']);
 const previews=h.calls.filter(call=>call[0]==='preview').length;
 quick.value=choices[1].value;await quick.dispatch('change');await flush();
 assert.equal(h.calls.filter(call=>call[0]==='preview').length,previews);
 quick.value=choices[2].value;await quick.dispatch('change');await flush();
 assert.deepEqual(h.calls.slice(-2),[['select-saved-target',1],['preview','']]);
 assert.equal(h.$('compare-target').textContent,'C:\\learning');
 assert.equal(h.$('apply').disabled,true);
 h.finish();await flush();
 assert.equal(h.$('apply').disabled,false);
 assert.equal(quick.value,'');
 assert.match(quick.textContent,/C:\\learning（目前）/);
 await h.click('forget-target');
 assert.equal(quick.disabled,true);
});

test('ZIP panel handles remember mouse and keyboard changes independently',async()=>{
 const prefs={},h=fixture(prefs),handle=(kind,ui=h)=>ui.$('page').querySelector('[data-zip-resize="'+kind+'"]');
 const source=handle('source');source.setPointerCapture=()=>{};
 await source.dispatch('pointerdown',{button:0,pointerId:1,clientY:300});
 await source.dispatch('pointermove',{pointerId:1,clientY:364});
 assert.equal(source.getAttribute('aria-valuenow'),'244');
 assert.equal(prefs.zipUpdateView,undefined);
 await source.dispatch('pointerup',{pointerId:1});
 await handle('target').dispatch('keydown',{key:'ArrowUp'});
 await handle('compare').dispatch('keydown',{key:'ArrowDown'});
 await handle('split').dispatch('keydown',{key:'ArrowRight'});
 const reopened=fixture(prefs);
 for(const [kind,value] of [['source',244],['target',164],['compare',316],['split',52]])assert.equal(handle(kind,reopened).getAttribute('aria-valuenow'),String(value));
 await handle('target',reopened).dispatch('dblclick');
 assert.equal(prefs.zipUpdateView.layout.target,180);
 assert.equal(prefs.zipUpdateView.layout.source,244);
});

test('ZIP source, target and comparison rows dispatch their own menu selection',async()=>{
 const h=fixture();h.window.zipUpdateUI.open();await flush();
 const row=(kind,text)=>h.$(kind+'-browser-rows').querySelectorAll('tr').find(tr=>tr.textContent.includes(text));
 await row('source','patch.zip').dispatch('contextmenu');await flush();
 assert.equal(h.calls.at(-1)[1].id,'archive');assert.equal(h.calls.at(-1)[1].panel,'source');
 await row('target','existing.dart').dispatch('keydown',{key:'F10',shiftKey:true});await flush();
 assert.equal(h.calls.at(-1)[1].kind,'file');assert.equal(h.calls.at(-1)[1].panel,'target');
 await h.compare();h.finish();await flush();
 await h.$('rows').querySelector('tr').dispatch('contextmenu');await flush();
 assert.equal(h.calls.at(-1)[1].folder,'els1104');assert.equal(h.calls.at(-1)[1].target,'C:\\learning');
});

test('ZIP drop notice is visible only during an external file drag',async()=>{
 const h=fixture(),page=h.$('page'),drop=h.$('drop');
 const dataTransfer={types:['Files'],files:[{name:'plain.txt'}]};
 assert.equal(drop.hidden,true);
 await page.dispatch('dragover',{dataTransfer:{types:['text/plain']}});
 assert.equal(drop.hidden,true);
 await page.dispatch('dragenter',{dataTransfer});
 assert.equal(drop.hidden,false);
 await page.dispatch('dragleave',{dataTransfer,relatedTarget:h.$('choose')});
 assert.equal(drop.hidden,false);
 await page.dispatch('dragleave',{dataTransfer,relatedTarget:null});
 assert.equal(drop.hidden,true);
 await page.dispatch('dragover',{dataTransfer});
 await page.dispatch('drop',{dataTransfer});
 assert.equal(drop.hidden,true);
 assert.match(h.$('status').textContent,/一個或多個 ZIP/);
});

test('source list can send selected ZIP rows to batch extraction',async()=>{
 const h=fixture();h.window.zipUpdateUI.open();await flush();
 assert.ok(h.$('source-panel').contains(h.$('extract-batch')));
 assert.equal(h.$('extract-batch').disabled,false);
 const check=h.$('source-browser-rows').querySelector('input');
 assert.equal(check.getAttribute('aria-label'),'批次解壓 patch.zip');
 check.checked=true;await check.dispatch('change');
 assert.match(h.$('extract-batch').textContent,/（1）/);
 await h.click('extract-batch');
 const call=h.calls.find(item=>item[0]==='batch-extract');
 assert.equal(Array.from(call[1]).join(','),'archive');
 assert.match(h.$('batch-list').textContent,/patch\.zip/);
 assert.equal(h.$('batch-results').open,true);
 await h.click('extract-batch');
 assert.equal(h.calls.filter(([action])=>action==='batch-extract').at(-1)[1].length,0);
 let dropped=[];
 h.window.zipUpdateAPI.dropBatch=async files=>{dropped=Array.from(files,file=>file.name);return {canceled:true};};
 await h.$('page').dispatch('drop',{dataTransfer:{types:['Files'],files:[{name:'first.zip'},{name:'second.ZIP'}]}});
 await flush();
 assert.deepEqual(dropped,['first.zip','second.ZIP']);
 assert.equal(h.$('drop').hidden,true);
});

test('ZIP source modifiers select the sorted ZIP range, toggle and move focus without opening archives',async()=>{
 const h=fixture({},[
  {id:'c',name:'c.zip',kind:'zip',size:10},
  {id:'dir',name:'b-folder',kind:'folder',size:0},
  {id:'a',name:'a.zip',kind:'zip',size:10},
  {id:'b',name:'b.zip',kind:'zip',size:10}
 ]);
 h.window.zipUpdateUI.open();await flush();
 const row=id=>h.$('source-browser-rows').querySelectorAll('tr').find(tr=>tr.textContent.includes(id+'.zip'));
 const checked=()=>h.$('source-browser-rows').querySelectorAll('input').filter(el=>el.checked).map(el=>el.getAttribute('aria-label').split(' ')[1]);
 await row('a').querySelector('button').dispatch('click',{ctrlKey:true});
 assert.deepEqual(checked(),['a.zip']);
 await row('a').dispatch('keydown',{key:'ArrowRight',shiftKey:true});
 assert.deepEqual(checked(),['a.zip','b.zip']);assert.equal(h.document.activeElement,row('b'));
 await row('b').dispatch('keydown',{key:'ArrowDown',ctrlKey:true});
 assert.deepEqual(checked(),['a.zip','b.zip']);assert.equal(h.document.activeElement,row('c'));
 await row('c').querySelector('input').dispatch('click',{shiftKey:true});
 assert.deepEqual(checked(),['a.zip','b.zip','c.zip']);
 await row('c').dispatch('keydown',{key:'ArrowLeft',shiftKey:true});
 assert.deepEqual(checked(),['a.zip','b.zip']);
 await row('b').dispatch('contextmenu',{ctrlKey:true});
 assert.deepEqual(checked(),['a.zip']);
 await row('b').dispatch('keydown',{key:' ',ctrlKey:true});
 assert.deepEqual(checked(),['a.zip','b.zip']);
 await row('c').dispatch('contextmenu',{shiftKey:true});
 assert.deepEqual(checked(),['a.zip','b.zip','c.zip']);
 assert.ok(!h.calls.some(([action])=>['source-open','entry-menu'].includes(action)));
 await row('b').dispatch('contextmenu');
 assert.equal(h.calls.at(-1)[0],'entry-menu');
 h.$('source-browser-query').value='c.zip';await h.$('source-browser-query').dispatch('input');
 await row('c').dispatch('keydown',{key:'a',ctrlKey:true});
 assert.deepEqual(checked(),['c.zip']);
 h.$('source-browser-query').value='';await h.$('source-browser-query').dispatch('input');
 assert.deepEqual(checked(),['c.zip']);
});

test('ZIP source keyboard selection moves between pages and respects the batch limit',async()=>{
 const h=fixture({},Array.from({length:101},(_,i)=>({id:'zip-'+i,name:'archive-'+i+'.zip',kind:'zip',size:10})));
 h.window.zipUpdateUI.open();await flush();
 const row=name=>h.$('source-browser-rows').querySelectorAll('tr').find(tr=>tr.textContent.includes(name+'.zip'));
 await row('archive-99').dispatch('keydown',{key:'ArrowDown',shiftKey:true});
 assert.equal(h.document.activeElement,row('archive-100'));
 assert.match(h.$('extract-batch').textContent,/（2）/);
 await row('archive-100').dispatch('keydown',{key:'a',ctrlKey:true});
 assert.match(h.$('extract-batch').textContent,/（50）/);
 assert.match(h.$('status').textContent,/最多勾選 50 個 ZIP/);
});
