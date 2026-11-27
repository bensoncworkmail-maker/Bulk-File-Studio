'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const L=require('../src/floating-tool-layout'),{ToolOverlay}=require('../src/tool-overlay'),{FloatingDisplays}=require('../src/floating-displays'),{PasteTargetSession}=require('../src/paste-target-session');
function registry(){const screen=new EventEmitter();screen.getAllDisplays=()=>[{id:1,workArea:{x:0,y:0,width:1600,height:1000}}];const settings={theme:'dark',fontSize:'13',floatingOnTop:true,floatingAutoCollapse:true,floatingRestorePanels:true,floatingToolLayout:L.normalize()},windows=[];
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.bounds={x:options.x,y:options.y,width:options.width,height:options.height};this.visible=false;this.topmost=options.alwaysOnTop;this.webContents={send(){}};windows.push(this);}loadFile(file){this.url=require('node:url').pathToFileURL(file).href;this.emit('ready-to-show');}getNormalBounds(){return {...this.bounds};}setBounds(value){this.bounds={...value};}setMinimumSize(){}setOpacity(value){this.opacity=value;}setParentWindow(value){this.parent=value;}setAlwaysOnTop(value){this.topmost=value;}isAlwaysOnTop(){return this.topmost;}isDestroyed(){return Boolean(this.destroyed);}isVisible(){return this.visible;}isFocused(){return false;}show(){this.visible=true;this.emit('show');}focus(){}hide(){this.visible=false;this.emit('hide');}moveTop(){}minimize(){this.minimized=true;}destroy(){this.destroyed=true;this.emit('closed');}close(){let prevented=false;this.emit('close',{preventDefault(){prevented=true;}});if(!prevented)this.destroy();}}
 const overlay=new ToolOverlay({BrowserWindow:Window,screen,settings:()=>settings,parent:()=>undefined,size:()=>null,secureWindow(){},remember(){},logFilters:()=>({}),error:error=>{throw error;},saveLayout:(kind,patch)=>settings.floatingToolLayout[kind]={...settings.floatingToolLayout[kind],...patch}});return {overlay,settings,windows,screen};}
test('layouts preserve independent placement, pinned and topmost states and validate schema',()=>{const old=require('../src/desktop-state').normalize({floatingOnTop:false});for(const row of Object.values(old.floatingToolLayout))assert.equal(row.topmost,false);const state=L.normalize({snippets:{placement:'pinned',pinned:true,topmost:false,bounds:{x:-2000,y:10,width:420,height:500}}},true);assert.equal(state.snippets.pinned,true);assert.equal(state.snippets.topmost,false);assert.equal(state.planning.placement,'quick');for(const input of [{unknown:{}},{snippets:{placement:'bad'}},{snippets:{topmost:'true'}},{snippets:{bounds:{x:0,y:0,width:0,height:500}}}])assert.throws(()=>L.normalize(input,true),/配置/);});
test('all five independent tools have unique windows, separate pin/topmost state and bounded restart restoration',t=>{const h=registry();t.after(()=>h.overlay.close());for(const kind of Object.keys(L.TOOLS)){h.settings.floatingToolLayout[kind]={...h.settings.floatingToolLayout[kind],placement:'pinned',pinned:true,visible:true};h.overlay.open({kind});}assert.equal(h.windows.length,5);let entry=h.overlay.windows.get('snippets');const calendar=h.overlay.windows.get('planning');h.overlay.open({kind:'snippets'});assert.equal(h.windows.length,5);assert.notEqual(entry.window,calendar.window);h.overlay.control(entry,'topmost',false);assert.equal(entry.pinned,true);assert.equal(entry.window.topmost,false);entry.window.emit('blur');assert.equal(entry.window.visible,true);h.overlay.control(entry,'collapse',true);assert.equal(entry.window.bounds.height,80);h.overlay.control(entry,'collapse',false);assert.ok(entry.window.bounds.height>=280);h.overlay.control(entry,'minimize');assert.equal(entry.window.minimized,true);entry.window.close();assert.equal(entry.window.isDestroyed(),true);assert.equal(h.settings.floatingToolLayout.snippets.visible,false);h.overlay.open({kind:'snippets'});assert.equal(h.windows.length,6);entry=h.overlay.windows.get('snippets');entry.window.bounds={x:99999,y:99999,width:420,height:500};h.overlay.recover(entry);assert.ok(entry.window.bounds.x<1600);assert.ok(entry.window.bounds.y<1000);h.overlay.close();h.overlay.restored=false;h.overlay.restore();h.overlay.restore();assert.equal(h.windows.length,11);assert.equal(h.overlay.windows.size,5);});
test('display changes coalesce and release every screen subscription',()=>{const screen=new EventEmitter(),queue=[];let canceled=0,recovered=0;const service=new FloatingDisplays(screen,()=>[()=>recovered++],{defer:task=>(queue.push(task),queue.length),cancel:()=>canceled++});screen.emit('display-removed');screen.emit('display-metrics-changed');assert.equal(queue.length,2);queue.at(-1)();assert.equal(recovered,1);service.close();for(const event of ['display-added','display-removed','display-metrics-changed'])assert.equal(screen.listenerCount(event),0);assert.ok(canceled>=3);});
test('paste target capture rejects stale asynchronous results, expires targets and never survives quit',async()=>{const pending=[];let now=100;const session=new PasteTargetSession({capture:()=>new Promise(resolve=>pending.push(resolve)),now:()=>now});const a=session.observe(),b=session.observe();pending[1]({handle:'2',pid:2,at:100});await b;pending[0]({handle:'1',pid:1,at:100});await a;assert.equal(session.get().handle,'2');now=60101;assert.equal(session.get(),null);const c=session.observe();session.close();pending[2]({handle:'3',pid:3,at:now});await c;assert.equal(session.get(),null);});
test('pin repair has a finite failure budget and explicit show recovery renews it without focus theft',()=>{const {FloatingPin}=require('../src/floating-pin'),events=new Map(),errors=[];let calls=0,poll;const window={on:(event,task)=>events.set(event,task),isDestroyed:()=>false,isVisible:()=>true,isAlwaysOnTop:()=>false,setAlwaysOnTop:()=>calls++,moveTop(){},focus:()=>assert.fail('must not focus')};new FloatingPin(window,()=>({floatingOnTop:true}),{setIntervalFn:task=>(poll=task,0),clearIntervalFn(){},onError:error=>errors.push(error)});for(let i=0;i<100;i++)poll();assert.equal(calls,6);assert.equal(errors.length,1);events.get('focus')();assert.equal(calls,6);events.get('show')();assert.equal(calls,8);});

test('a pinned panel reloads a crashed renderer once and can be manually reopened after another failure',async()=>{
 const {FloatingPin}=require('../src/floating-pin');
 let crashed=true,reloads=0,visible=true,pinned=true;
 const window=Object.assign(new EventEmitter(),{
  isDestroyed:()=>false,isVisible:()=>visible,isAlwaysOnTop:()=>false,
  webContents:{isCrashed:()=>crashed,reload(){reloads++;crashed=false;}}
 });
 const pin=new FloatingPin(window,()=>({floatingOnTop:false}),{
  setIntervalFn:()=>0,clearIntervalFn(){},canRecover:()=>pinned
 });
 pin.rendererGone('crashed');
 await new Promise(setImmediate);
 assert.equal(reloads,1);
 crashed=true;
 pin.rendererGone('crashed');
 await new Promise(setImmediate);
 assert.equal(reloads,1);
 pin.reloadCrashedRenderer();
 assert.equal(reloads,2);
 const other=new FloatingPin(window,()=>({floatingOnTop:false}),{
  setIntervalFn:()=>0,clearIntervalFn(){},canRecover:()=>pinned
 });
 crashed=true;
 other.rendererGone('killed');
 visible=false;pinned=false;
 await new Promise(setImmediate);
 assert.equal(reloads,2);
});

test('independent panel sizes validate, survive normalization and update only the selected live tool',t=>{
 for(const panelSize of [{width:379,height:500},{width:500,height:0},{width:NaN,height:500},{width:500.5,height:500},{width:500,height:500,unknown:true}])assert.throws(()=>L.normalize({files:{panelSize}},true),/配置/);
 const h=registry();t.after(()=>h.overlay.close());h.settings.floatingToolLayout.files.panelSize={width:600,height:650};h.overlay.open({kind:'files'});h.overlay.open({kind:'clipboard'});const file=h.overlay.windows.get('files'),peer=h.overlay.windows.get('clipboard'),before={...peer.window.bounds};assert.equal(file.window.bounds.width,600);assert.equal(file.window.bounds.height,650);
 const previous=structuredClone(h.settings);h.settings.floatingToolLayout.files.panelSize={width:700,height:750};h.overlay.updateSettings(previous);assert.equal(file.window.bounds.width,700);assert.equal(file.window.bounds.height,750);assert.deepEqual(peer.window.bounds,before);
 h.overlay.control(file,'collapse',true);const old=structuredClone(h.settings);h.settings.floatingToolLayout.files.panelSize={width:800,height:800};h.overlay.updateSettings(old);assert.equal(file.window.bounds.height,80);h.overlay.control(file,'collapse',false);assert.equal(file.window.bounds.height,800);
});
