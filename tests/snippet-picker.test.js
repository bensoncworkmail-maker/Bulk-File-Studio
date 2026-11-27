'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{pathToFileURL}=require('node:url'),{SnippetPicker}=require('../src/snippet-picker');
test('picker uses showInactive with focusable false, validates own frame and allows one selection without focus restoration',async()=>{
 const windows=[],keys=new Map(),selected=[],commands=[];class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents={send:(...args)=>commands.push(args)};windows.push(this);}loadFile(file){this.url=pathToFileURL(file).href;}showInactive(){this.shown=true;}focus(){throw new Error('must never activate');}show(){throw new Error('must never activate');}isDestroyed(){return !!this.dead;}destroy(){this.dead=true;this.emit('closed');}}
 const picker=new SnippetPicker({BrowserWindow:Window,screen:{getAllDisplays:()=>[{workArea:{x:0,y:0,width:800,height:600}}]},globalShortcut:{register:(key,fn)=>(keys.set(key,fn),true),unregister:key=>keys.delete(key)},secureWindow(){},settings:()=>({theme:'light'}),onError:error=>{throw error;}}),target={handle:'5',pid:6};picker.open([{id:'one',title:'Hello',detail:'Work',summary:'text'}],target,(id,value)=>selected.push({id,value}));const win=windows[0];win.emit('ready-to-show');assert.equal(win.shown,true);assert.equal(picker.data().keyboard,true);keys.get('Down')();keys.get('Enter')();assert.deepEqual(commands,[['snippet-picker-key','Down'],['snippet-picker-key','Enter']]);assert.equal(win.options.focusable,false);assert.equal(win.options.skipTaskbar,true);assert.equal(picker.owns({sender:win.webContents,senderFrame:{url:win.url}}),true);assert.equal(picker.owns({sender:win.webContents,senderFrame:{url:'file:///wrong'}}),false);await assert.rejects(picker.select('forged'),/失效/);await picker.select('one');assert.equal(selected.length,1);assert.equal(selected[0].value.noActivate,true);assert.equal(win.dead,true);assert.equal(keys.size,0);await assert.rejects(picker.select('one'),/失效/);picker.open([],target,()=>{});keys.get('Escape')();assert.equal(windows[1].dead,true);assert.equal(keys.size,0);
});
test('picker reads custom geometry, clamps it to the display and only persists existing categories when memory is enabled',()=>{
 const saved=[];let remember=true;class Window extends EventEmitter{constructor(options){super();this.options=options;this.webContents={};}loadFile(){}isDestroyed(){return !!this.dead;}destroy(){this.dead=true;this.emit('closed');}}
 const picker=new SnippetPicker({BrowserWindow:Window,screen:{getCursorScreenPoint:()=>({x:550,y:490}),getDisplayNearestPoint:()=>({workArea:{x:100,y:50,width:500,height:450}})},globalShortcut:{register:()=>false},secureWindow(){},settings:()=>({theme:'light',snippetPicker:{width:700,height:800,rememberGroups:remember}}),groupStates:()=>[['Work',false]],saveGroups:changes=>{saved.push(changes);return {saved:true};},onError(){}});
 picker.open([{id:'1',title:'Hello',detail:'Work',summary:'text'}],{},()=>{});assert.equal(picker.window.options.width,500);assert.equal(picker.window.options.height,450);assert.equal(picker.window.options.x,100);assert.equal(picker.window.options.y,50);assert.equal(picker.data().groupStates[0][1],false);
 assert.throws(()=>picker.setGroups([['forged',true]]),/狀態無效/);assert.equal(picker.setGroups([['Work',true]]).saved,true);remember=false;assert.equal(picker.setGroups([['Work',false]]).saved,false);assert.equal(saved.length,1);picker.close();
});

test('an outside click in the same foreground app closes the nonactivating picker and releases its watcher',async()=>{
 class Window extends EventEmitter{
  constructor(){super();this.webContents={};}
  loadFile(){}
  showInactive(){}
  isDestroyed(){return Boolean(this.dead);}
  destroy(){this.dead=true;this.emit('closed');}
 }
 let outside=false,stopped=0;
 const picker=new SnippetPicker({
  BrowserWindow:Window,screen:{getAllDisplays:()=>[{workArea:{x:0,y:0,width:800,height:600}}]},
  globalShortcut:{register:()=>false},secureWindow(){},settings:()=>({}),
  watchPicker:()=>({handle:'992',ready:Promise.resolve(true),stop:()=>{stopped++;}}),
  isCurrentTarget:async(target,handle)=>target.handle==='500'&&handle==='992'&&!outside
 });
 picker.open([{id:'one'}],{handle:'500'},()=>assert.fail('dismissed picker must not paste'));
 const win=picker.window;
 win.emit('ready-to-show');
 await new Promise(resolve=>setTimeout(resolve,80));
 assert.equal(win.isDestroyed(),false);
 outside=true;
 await new Promise(resolve=>setTimeout(resolve,100));
 assert.equal(win.isDestroyed(),true);
 assert.equal(stopped,1);
 outside=false;
 picker.open([{id:'one'}],{handle:'500'},()=>assert.fail('dismissed picker must not paste'));
 const reopened=picker.window;
 reopened.emit('ready-to-show');
 outside=true;
 await assert.rejects(picker.select('one'),/已取消貼上/);
 assert.equal(reopened.isDestroyed(),true);
 assert.equal(stopped,2);
});

test('keyboard navigation skips closed categories and activates the highlighted snippet',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{documentFromHTML}=require('./helpers/dom');
 const doc=documentFromHTML(fs.readFileSync(require.resolve('../src/snippet-picker.html'),'utf8'));
 const selected=[];
 let navigate;
 const rows=[
  {id:'a',title:'First',groupKey:'A',summary:'one'},
  {id:'b',title:'Second',groupKey:'B',summary:'two'}
 ];
 const window={
  snippetPickerModel:require('../src/snippet-picker-model'),
  snippetPicker:{
   onKey:callback=>navigate=callback,
   get:async()=>({rows,keyboard:true,escape:true,prefs:{defaultExpanded:false}}),
   close:async()=>{},groups:async()=>{},select:async id=>selected.push(id)
  }
 };
 await vm.runInNewContext(fs.readFileSync(require.resolve('../src/snippet-picker-ui'),'utf8'),{window,document:doc});
 const active=()=>doc.querySelector('[data-active]');
 assert.equal(active().tagName,'SUMMARY');
 navigate('Down');assert.match(active().textContent,/^B/);
 navigate('Right');assert.equal(active().parentElement.open,true);
 navigate('Right');assert.equal(active().textContent,'Second');
 navigate('Left');assert.match(active().textContent,/^B/);
 navigate('Left');assert.equal(active().parentElement.open,false);
 navigate('Up');navigate('Right');navigate('Down');
 assert.equal(active().textContent,'First');
 active().click=()=>active().dispatch('click');
 navigate('Enter');
 assert.deepEqual(selected,['a']);
});
