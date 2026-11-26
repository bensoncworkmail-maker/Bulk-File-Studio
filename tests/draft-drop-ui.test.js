'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{documentFromHTML}=require('./helpers/dom');
const tick=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function fixture(){
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/draft-notes.html'),'utf8')),$=id=>document.getElementById(id),events=new Map(),calls=[];
 document.addEventListener=(name,handler)=>events.set(name,handler);
 const draft={id:crypto.randomUUID(),version:1,title:'Note',body:'Text',type:'text',items:[],attachments:[]};let settings,stickerUpdate;
 const api={data:async()=>({drafts:[draft],sheets:[],preferences:{draftDropMode:'link'}}),read:async()=>structuredClone(draft),pathForFile:file=>file.path,onClose(){},onSettings:fn=>settings=fn,onStickerBodySaved:fn=>stickerUpdate=fn,attach:async(...args)=>{calls.push(args);return {...draft,version:2,attachments:[{path:'/managed/a.txt',type:'file',managed:true,originalPath:args[2][0]}]};}};
 const window={confirm:()=>true,draftAPI:api,structuredNoteModel:require('../src/structured-note-model'),draftExportTypes:require('../src/draft-export-types'),resizableSplit:{attach(){}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/draft-notes-ui.js'),'utf8'),{window,document,setTimeout,clearTimeout,ResizeObserver:class{observe(){}}});
 return {$,events,calls,api,draft,stickerUpdate:value=>stickerUpdate(value),settings:value=>settings(value)};
}
test('draft drop selector defaults to links and forwards the explicit copy or move choice',async()=>{
 const h=fixture();await tick();assert.equal(h.$('draft-drop-mode').value,'link');
 h.$('draft-drop-mode').value='copy';await h.$('draft-drop-mode').dispatch('change');assert.match(h.$('draft-drop-hint').textContent,/保留原位置/);assert.match(h.$('draft-drop-hint').textContent,/同一份草稿共用一個附件資料夾/);assert.match(h.$('draft-drop-hint').textContent,/既有附件不會重新搬移/);
 const transfer={types:['Files'],files:[{path:'/source/a.txt'}]};h.events.get('dragover')({dataTransfer:transfer,preventDefault(){}});assert.equal(transfer.dropEffect,'copy');
 h.events.get('drop')({dataTransfer:transfer,preventDefault(){}});await tick();assert.equal(h.calls[0][3],'copy');assert.deepEqual(Array.from(h.calls[0][2]),['/source/a.txt']);assert.match(h.$('attachments').textContent,/草稿附件/);assert.match(h.$('attachments').querySelector('span').title,/草稿儲存位置：.*\n原位置：/);
 h.settings({draftDropMode:'move'});assert.equal(h.$('draft-drop-mode').value,'move');assert.match(h.$('draft-drop-hint').textContent,/確認/);
});
test('draft attachment warnings remain visible after a completed file transfer',async()=>{
 const h=fixture();await tick();const attach=h.api.attach;h.api.attach=async(...args)=>({...await attach(...args),attachmentWarning:'部分來源未移除'});h.$('draft-drop-mode').value='move';h.events.get('drop')({dataTransfer:{types:['Files'],files:[{path:'/source/a.txt'}]},preventDefault(){}});await tick();assert.equal(h.$('status').textContent,'部分來源未移除');assert.equal(h.$('status').dataset.error,'true');
});


test('draft editor receives sticker saves and preserves local text on a conflict until reloading',async()=>{
 const h=fixture();await tick();
 const {id,title}=h.draft;
 h.stickerUpdate({id,title,summary:'便條儲存',body:'便條儲存',previousVersion:1,version:2});
 assert.equal(h.$('body').value,'便條儲存');
 h.$('body').value='另一段未儲存的文字';
 h.stickerUpdate({id,title,summary:'後來內容',body:'後來內容',previousVersion:2,version:3});
 assert.equal(h.$('body').value,'另一段未儲存的文字');
 assert.equal(h.$('reload-draft').hidden,false);
 h.api.read=async()=>({...h.draft,version:3,body:'後來內容'});
 await h.$('reload-draft').dispatch('click');
 assert.equal(h.$('body').value,'後來內容');
 assert.equal(h.$('reload-draft').hidden,true);
});
