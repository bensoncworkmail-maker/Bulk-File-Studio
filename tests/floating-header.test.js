'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {init}=require('../src/floating-header');
function setup(){
 const events={},calls=[],errors=[];let sequence=0;
 const header={addEventListener:(event,callback)=>events[event]=callback,setPointerCapture:id=>calls.push(['capture',id]),releasePointerCapture:id=>calls.push(['release',id])};
 const api={openFloatingHeaderMenu:async anchor=>calls.push(['menu',anchor]),beginFloatingDrag:async()=>{const token=String(++sequence);calls.push(['start',token]);return {token};},moveFloatingDrag:async(...args)=>calls.push(['move',...args]),endFloatingDrag:async token=>calls.push(['end',token])};
 const controller=init({header,api,onError:error=>errors.push(error.message)});
 const event=(extra={})=>({button:0,isPrimary:true,pointerId:1,screenX:100,screenY:200,target:{closest:()=>false},preventDefault(){},stopPropagation(){},...extra});
 return {api,events,calls,errors,controller,event};
}
test('cancel finishes a drag and failed moves still release the native gesture',async()=>{const h=setup();h.api.moveFloatingDrag=async()=>{throw new Error('move failed');};h.events.pointerdown(h.event());h.events.pointermove(h.event({screenX:140}));h.controller.cancel();await h.controller.settled();assert.deepEqual(h.errors,['move failed']);assert.ok(h.calls.some(call=>call[0]==='end'));h.events.pointerdown(h.event({target:{closest:()=>true}}));h.events.pointermove(h.event({screenX:160}));h.events.pointerup(h.event());await h.controller.settled();assert.equal(h.calls.filter(call=>call[0]==='start').length,1);});


test('toolbar drag serializes native moves and commits the final position',async()=>{
 const h=setup();h.events.pointerdown(h.event());h.events.pointermove(h.event({screenX:120,screenY:260}));h.events.pointerup(h.event({screenX:130,screenY:270}));await h.controller.settled();
 assert.deepEqual(h.calls.filter(call=>['start','move','end'].includes(call[0])),[['start','1'],['move','1',20,60],['move','1',30,70],['end','1']]);
});
test('resize handle passes the side and ordinary clicks do not capture the pointer',async()=>{
 const h=setup();let mode;
 h.api.beginFloatingDrag=async value=>{mode=value;return {token:'resize'};};
 h.events.pointerdown(h.event());h.events.pointermove(h.event({screenX:102}));h.events.pointerup(h.event({screenX:102}));
 assert.equal(h.calls.some(([name])=>name==='capture'),false);
 const target={closest:selector=>selector==='[data-resize]'?{dataset:{resize:'right'}}:null};
 h.events.pointerdown(h.event({target}));h.events.pointermove(h.event({target,screenX:150}));h.events.pointerup(h.event({target,screenX:155}));await h.controller.settled();
 assert.equal(mode,'resize-right');
});
test('right click and menu keys offer the configured action menu without moving the toolbar',async()=>{
 const h=setup(),target={closest:selector=>selector==='button'};
 await h.events.contextmenu(h.event({target,type:'contextmenu',button:2,clientX:40,clientY:10}));
 await h.events.keydown(h.event({target,key:'F10',shiftKey:true}));
 assert.deepEqual(h.calls,[['menu',{x:40,y:10}],['menu',undefined]]);
});
