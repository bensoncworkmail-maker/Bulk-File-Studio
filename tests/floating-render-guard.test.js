'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{create}=require('../src/floating-render-guard');
function setup(){let paints=0,id=0;const timers=new Map(),guard=create({paint:()=>paints++,setTimeoutFn:fn=>{timers.set(++id,fn);return id;},clearTimeoutFn:key=>timers.delete(key)});return {guard,paints:()=>paints,tick:()=>{const tasks=[...timers.values()];timers.clear();for(const task of tasks)task();}};}
test('refreshes coalesce through press, release and click before one final paint',()=>{
 const h=setup();h.guard.request();assert.equal(h.paints(),1);h.guard.begin({button:0,pointerId:1});
 h.guard.request();h.guard.request();assert.equal(h.paints(),1);h.guard.finish({pointerId:1});
 h.guard.request();assert.equal(h.paints(),1);h.tick();assert.equal(h.paints(),2);
});
test('blur and pointer cancellation release queued paints without waiting for another click',()=>{
 const h=setup();h.guard.begin({button:0,pointerId:1});h.guard.request();h.guard.cancel();h.tick();
 assert.equal(h.paints(),1);h.guard.request();assert.equal(h.paints(),2);
});
test('another pointer cannot release the pressed target and a rapid next press keeps it stable',()=>{
 const h=setup();h.guard.begin({button:0,pointerId:1});h.guard.request();h.guard.finish({pointerId:2});h.tick();assert.equal(h.paints(),0);
 h.guard.finish({pointerId:1});h.guard.begin({button:0,pointerId:2});h.tick();assert.equal(h.paints(),0);
 h.guard.finish({pointerId:2});h.tick();assert.equal(h.paints(),1);
});
test('keyboard and secondary button interactions do not lock rendering',()=>{
 const h=setup();h.guard.begin({button:2,pointerId:1});h.guard.request();assert.equal(h.paints(),1);
 h.guard.begin({button:0,isPrimary:false,pointerId:2});h.guard.request();assert.equal(h.paints(),2);
});
