'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{documentFromHTML}=require('./helpers/dom'),{create}=require('../src/workspace-images-ui');
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function fixture(){const document=documentFromHTML(fs.readFileSync(require.resolve('../src/index.html'),'utf8')),$=id=>document.getElementById(id),dialog=$('notes-record-dialog'),status=$('notes-record-image-status'),calls=[],source='data:image/png;base64,AAAA';let resolve;const api={prepareImage:bytes=>{calls.push(bytes);return new Promise(r=>resolve=r);},recordImage:async()=>source};let links=[{index:0,path:'C:\\images\\saved.png',type:'file'}],switched=false;const ui=create({document,api,dialog,host:$('notes-record-images'),status,record:()=> 'record',links:()=>links,remove:link=>links=links.filter(r=>r!==link),onPasted:()=>switched=true});dialog.showModal();const paste=target=>dialog.dispatch('paste',{target:target||$('notes-record-body'),clipboardData:{items:[{kind:'file',type:'image/png',getAsFile:()=>({size:3,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})}]}});return {document,$,dialog,status,calls,source,ui,api,paste,finish:()=>resolve(source),switched:()=>switched};}
test('paste preserves text, offers zoom/removal and keeps pending bytes until save or cancel',async()=>{const h=fixture();h.$('notes-record-body').value='Keep text';const task=h.paste();await flush();assert.equal(h.ui.isBusy(),true);h.finish();await task;assert.equal(h.ui.isBusy(),false);assert.equal(h.$('notes-record-body').value,'Keep text');assert.deepEqual(h.ui.value(),[h.source]);assert.equal(h.switched(),true);await flush();const zoom=h.$('notes-record-images').querySelectorAll('button').find(b=>b.className==='notes-image-zoom');await zoom.dispatch('click');assert.equal(h.$('notes-image-preview').open,true);await h.$('notes-image-preview-close').dispatch('click');assert.equal(h.$('notes-image-preview').open,false);const del=h.$('notes-record-images').querySelectorAll('button').find(b=>b.textContent==='移除');await del.dispatch('click');h.dialog.close();assert.deepEqual(h.ui.value(),[]);assert.equal(h.$('notes-record-images').hidden,true);});
test('closing or switching records during async paste discards stale response and title paste is untouched',async()=>{const h=fixture();await h.paste(h.$('notes-record-title'));assert.equal(h.calls.length,0);const task=h.paste();await flush();h.dialog.close();h.finish();await task;assert.deepEqual(h.ui.value(),[]);assert.equal(h.ui.isBusy(),false);assert.equal(h.$('notes-record-images').hidden,true);});
test('saved thumbnails reload through record links and can be unlinked independently of pending images',async()=>{const h=fixture();h.ui.render();await flush();assert.equal(h.$('notes-record-images').querySelectorAll('img').length,1);const del=h.$('notes-record-images').querySelectorAll('button').find(b=>b.textContent==='移除');await del.dispatch('click');assert.equal(h.$('notes-record-images').hidden,true);assert.deepEqual(h.ui.value(),[]);});


test('image preview navigates thumbnail order with arrows and buttons after out-of-order reads',async()=>{
 const h=fixture(),parent=h.document.createElement('div');
 const finish=[];
 h.api.recordImage=(_,index)=>new Promise(resolve=>finish[index]=resolve);
 h.ui.gallery(parent,{id:'entry',fileLinks:['first.png','second.png','third.png'].map(path=>({type:'file',path}))});
 finish[1]('second');await flush();
 const buttons=parent.querySelectorAll('button');
 await buttons[1].dispatch('click');
 assert.equal(h.$('notes-image-preview-position').textContent,'1 / 1');
 finish[2]('third');finish[0]('first');await flush();
 assert.equal(h.$('notes-image-preview-position').textContent,'2 / 3');
 const opened=h.$('notes-image-preview'),content=h.$('notes-image-preview-content');
 await opened.dispatch('keydown',{key:'ArrowLeft'});
 assert.equal(content.children[0].src,'first');
 assert.equal(h.$('notes-image-preview-previous').getAttribute('aria-disabled'),'true');
 await opened.dispatch('keydown',{key:'ArrowLeft'});
 assert.equal(content.children[0].src,'first');
 await h.$('notes-image-preview-next').dispatch('click');
 await opened.dispatch('keydown',{key:'ArrowRight'});
 assert.equal(content.children[0].src,'third');
 assert.equal(h.$('notes-image-preview-next').getAttribute('aria-disabled'),'true');
 await h.$('notes-image-preview-close').dispatch('click');
 await opened.dispatch('keydown',{key:'ArrowLeft'});
 assert.equal(content.children.length,0);
});
