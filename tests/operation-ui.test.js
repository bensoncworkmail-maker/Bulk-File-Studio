'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom'),{create}=require('../src/operation-ui');
function harness(options={}){
 const document=documentFromHTML('<html><body><button id="previous">Run</button><dialog id="form" open></dialog><dialog id="dialog"><h2 id="title"></h2><p id="detail"></p><ul id="list"></ul></dialog></body></html>'),$=id=>document.getElementById(id),timers=new Map();let token=0;
 $('previous').focus();const controller=create({dialog:$('dialog'),title:$('title'),detail:$('detail'),list:$('list'),root:document.body,activeElement:()=>document.activeElement,schedule:(fn,ms)=>{timers.set(++token,{fn,ms});return token;},cancel:id=>timers.delete(id),...options});
 return {document,$,controller,timers,tick:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(t=>t.fn());}};
}
test('quick operations do not flash an overlay, while slow operations preserve the underlying form',async()=>{
 const h=harness(),c=h.controller;c.receive({type:'start',id:1,title:'搬移'});assert.equal(h.document.body.getAttribute('aria-busy'),'true');assert.equal([...h.timers.values()][0].ms,180);
 c.receive({type:'end',id:1});h.tick();assert.equal(h.$('dialog').open,false);assert.equal(h.document.body.getAttribute('aria-busy'),'false');
 c.receive({type:'start',id:2,title:'搬移檔案',detail:'校驗中'});h.tick();assert.equal(h.$('dialog').open,true);assert.equal(h.$('title').textContent,'搬移檔案');assert.equal(h.$('detail').textContent,'校驗中');assert.equal(h.$('form').open,true);
 let prevented=false;await h.$('dialog').dispatch('cancel',{preventDefault(){prevented=true;}});assert.equal(prevented,true);
 c.receive({type:'end',id:2});h.tick();assert.equal(h.$('dialog').open,false);assert.equal(h.$('form').open,true);assert.equal(h.document.activeElement,h.$('previous'));
});
test('concurrent operations close only after the last completion and a new operation cancels pending dismissal',()=>{
 const h=harness(),c=h.controller;c.receive({type:'start',id:1,title:'第一項'});h.tick();c.receive({type:'start',id:2,title:'第二項'});assert.match(h.$('detail').textContent,/另有 1/);assert.equal(h.$('list').children.length,2);
 c.receive({type:'end',id:1});h.tick();assert.equal(c.pending(),1);assert.equal(h.$('dialog').open,true);c.receive({type:'end',id:2});c.receive({type:'start',id:3,title:'第三項'});h.tick();assert.equal(h.$('dialog').open,true);assert.equal(h.$('title').textContent,'第三項');c.receive({type:'end',id:3});h.tick();assert.equal(c.pending(),0);assert.equal(h.$('dialog').open,false);
});
function bridge(){const api={},calls=[];const ipcRenderer={invoke:(channel,...args)=>new Promise((resolve,reject)=>calls.push({channel,args,resolve,reject})),on(){},removeListener(){}};vm.runInNewContext(fs.readFileSync(require.resolve('../src/preload'),'utf8'),{require:name=>{assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(name,value)=>api[name]=value},ipcRenderer,webUtils:{}};}});return {api,calls};}
test('sandboxed bridge emits completion on success and rejection, replays active jobs and isolates UI listener errors',async()=>{
 const {api,calls}=bridge(),events=[];api.operationAPI.onChange(()=>{throw new Error('UI');});api.operationAPI.onChange(e=>events.push(e));
 const pending=api.renameAPI.moveFiles(['source'],'target',[],{});assert.equal(events[0].type,'start');assert.equal(calls[0].channel,'move-files');const replay=[];const unsubscribe=api.operationAPI.onChange(e=>replay.push(e));assert.equal(replay.length,1);calls[0].resolve({changed:1});assert.equal((await pending).changed,1);assert.equal(events.at(-1).type,'end');unsubscribe();
 const failed=api.renameAPI.rename([],{},[]);calls[1].reject(new Error('Disk error'));await assert.rejects(failed,/Disk error/);assert.equal(events.at(-1).type,'end');const after=[];api.operationAPI.onChange(e=>after.push(e));assert.equal(after.length,0);
 const before=events.length,drag=api.desktopAPI.beginFloatingDrag('move');calls[2].resolve('token');await drag;assert.equal(events.length,before);
});

test('collapsed floating tools never leave an invisible modal blocking the header and resume indication after expansion',()=>{
 let visible=false;const h=harness({isVisible:()=>visible}),c=h.controller;c.receive({type:'start',id:1,title:'讀取'});h.tick();assert.equal(h.$('dialog').open,false);visible=true;c.visibilityChanged();h.tick();assert.equal(h.$('dialog').open,true);visible=false;c.visibilityChanged();assert.equal(h.$('dialog').open,false);assert.equal(c.pending(),1);c.receive({type:'end',id:1});h.tick();assert.equal(h.document.body.getAttribute('aria-busy'),'false');
});
