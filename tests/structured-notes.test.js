'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const M=require('../src/notes-model');
const {NotesStore}=require('../src/notes-store');
const {DraftNotes}=require('../src/draft-notes');

function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-structured-'));
 const store=new NotesStore(path.join(dir,'workspace.sqlite'));
 t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 const addSheet=(name,types)=>store.saveSheet({name,fields:types.map(type=>({
  id:randomUUID(),type,label:M.TYPES[type],options:type==='select'||type==='multiselect'?['進行中','已完成']:[],
  ...(type==='select'||type==='multiselect'?{optionColors:{進行中:'#12ABCD',已移除:'#aabbcc'}}:{})
 }))}).document.sheets.at(-1);
 return {store,addSheet,dir};
}

test('structured workspace fields and option colors survive Excel and workspace data round trips',async t=>{
 const {store,addSheet}=setup(t);
 const sheet=addSheet('工作',['checklist','workflow','timeline','select','multiselect']);
 const [checklist,workflow,timeline,select,multiselect]=sheet.fields;
 const values={
  [checklist.id]:[{label:'核對報價',done:true},{label:'寄出文件',done:false}],
  [workflow.id]:[{label:'草擬',status:'done'},{label:'覆核',status:'active'}],
  [timeline.id]:[{label:'交付',date:'2026-11-20'},{label:'啟動',date:'2026-11-10'},{label:'後續',date:''}],
  [select.id]:'進行中',[multiselect.id]:['進行中','已完成']
 };
 assert.deepEqual(select.optionColors,{進行中:'#12abcd'});
 assert.deepEqual(multiselect.optionColors,select.optionColors);
 const saved=store.saveRecord({sheetId:sheet.id,title:'報價',values,notes:'',tags:[],fileLinks:[]});
 const doc=saved.document;
 assert.match(M.cell(doc,checklist,values[checklist.id]),/\[x\] 核對報價/);
 assert.match(M.cell(doc,workflow,values[workflow.id]),/2\. \[進行中\] 覆核/);
 assert.equal(M.cell(doc,timeline,values[timeline.id]),'2026-11-10 · 啟動\n2026-11-20 · 交付\n未設定日期 · 後續');
 assert.equal(M.searchRecords(doc,{query:'核對報價',sheetId:sheet.id}).length,1);
 const X=require('../src/notes-xlsx');
 const xlsx=await X.writeXlsx(M.tabularExport(doc,sheet.id,[saved.result.id]));
 const rows=(await X.readXlsx(xlsx)).sheets[0].rows;
 const input={rows,sheetId:sheet.id,mapping:M.suggestMapping(sheet,rows,true),header:true};
 const roundTrip=M.createTabular(doc,input,randomUUID,new Date().toISOString());
 assert.deepEqual(roundTrip.errors,[]);
 assert.deepEqual(roundTrip.records[0].values,values);
 assert.deepEqual(M.normalizeDocument(JSON.parse(JSON.stringify(doc))),doc);
 assert.throws(()=>M.gridValue(timeline,'[{"label":"日期","date":"2026-02-30"}]'),/日期無效/);
 const invalid=structuredClone(doc);
 invalid.sheets[0].fields.find(field=>field.id===select.id).optionColors.進行中='red';
 assert.throws(()=>M.normalizeDocument(invalid),/色碼/);
});

test('drafts preserve existing text and transfer structured items to the only matching field or to notes',async t=>{
 const {store,addSheet,dir}=setup(t);
 const target=addSheet('工作',['workflow']);
 const fallback=addSheet('備忘',['workflow','workflow']);
 let policy='ask',prompts=0;
 const drafts=new DraftNotes({store:()=>store,settings:()=>({draftAfterTransfer:policy}),imageDir:path.join(dir,'draft-images'),
  dialog:{showMessageBox:async()=>{prompts++;return {response:0};}},
  onSent(){},onError(error){throw error;}});
 const legacy=store.createDraft();
 assert.equal(legacy.type,'text');
 assert.deepEqual(legacy.items,[]);
 const items=[{label:'測試',status:'active'}];
 const saved=drafts.save(legacy.id,legacy.version,{title:'',body:'備註',type:'workflow',items});
 assert.deepEqual(store.draft(legacy.id).items,items);
 assert.throws(()=>drafts.save(legacy.id,legacy.version,{title:'',body:'',type:'workflow',items}),/草稿已變更/);
 const first=await drafts.send(saved.id,saved.version,target.id,'');
 const structured=store.get().document.records.find(record=>record.id===first.id);
 assert.equal(structured.notes,'備註');
 assert.deepEqual(structured.values[target.fields[0].id],items);
 assert.equal(first.draftDeleted,false);
 assert.equal(store.draft(saved.id).version,saved.version);
 assert.equal(prompts,1);
 policy='keep';

 const empty=store.createDraft();
 const listOnly=drafts.save(empty.id,empty.version,{title:'',body:'',type:'workflow',items});
 assert.equal(store.draftList()[0].summary,'測試');
 const second=await drafts.send(listOnly.id,listOnly.version,fallback.id,'');
 const plain=store.get().document.records.find(record=>record.id===second.id);
 assert.equal(plain.title,'測試');
 assert.equal(plain.notes,'1. [進行中] 測試');
 assert.deepEqual(plain.values,{});
 assert.equal(second.draftDeleted,false);
 assert.equal(store.draft(listOnly.id).version,listOnly.version);
 policy='delete';
 await assert.rejects(drafts.send(listOnly.id,listOnly.version,randomUUID(),''),/可用表格/);
 assert.equal(store.draft(listOnly.id).version,listOnly.version);
 assert.equal((await drafts.send(listOnly.id,listOnly.version,fallback.id,'')).draftDeleted,true);
 assert.throws(()=>store.draft(listOnly.id),/草稿已移除/);
 assert.equal(prompts,1);
});


test('structured notes render explicit states, completion progress and dates in chronological order',async()=>{
 const {documentFromHTML}=require('./helpers/dom'),vm=require('node:vm');
 const document=documentFromHTML('<html><body></body></html>'),window={structuredNoteModel:M.structured};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/structured-note-ui.js'),'utf8'),{window,document});
 const {view,editor}=window.structuredNoteUI;
 const checklist=view('checklist',[{label:'核對報價',done:true},{label:'寄出',done:false}]);
 assert.match(checklist.textContent,/1 \/ 2 已完成/);
 assert.equal(checklist.querySelector('[aria-label="未完成"]').textContent,'');
 const workflow=view('workflow',[{label:'覆核',status:'active'}]);
 assert.equal(workflow.querySelector('.structured-note-meta').dataset.status,'active');
 assert.match(workflow.textContent,/覆核進行中/);
 const items=[{label:'交付',date:'2026-11-20'},{label:'啟動',date:'2026-11-10'}];
 assert.match(view('timeline',items).textContent,/啟動2026-11-10交付2026-11-20/);
 const timeline=editor('timeline',items);
 assert.deepEqual(Array.from(timeline.value(),row=>row.label),['交付','啟動']);
 await timeline.element.querySelector('[aria-label="依日期排序時間軸"]').dispatch('click');
 assert.deepEqual(Array.from(timeline.value(),row=>row.label),['啟動','交付']);
});

test('draft thumbnails resize and zoom while dragged images can still expand inline',async()=>{
 const {documentFromHTML}=require('./helpers/dom'),vm=require('node:vm');
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/draft-notes.html'),'utf8'));
 const $=id=>document.getElementById(id);
 document.addEventListener=()=>{};
 const styles={};let updateSettings;
 $('draft-images').style.setProperty=(key,value)=>styles[key]=value;
 const source='data:image/png;base64,AA==';
 const draft={id:randomUUID(),title:'草稿',body:'正文',version:1,type:'text',items:[],attachments:[
  {image:true,path:'/images/paste.png'},{path:'/files/dragged.png'}
 ]};
 const window={structuredNoteModel:M.structured,draftExportTypes:require('../src/draft-export-types'),
  resizableSplit:{attach(){}},
  draftAPI:{data:async()=>({drafts:[draft],sheets:[],fontSize:13,preferences:{draftImageHeight:120}}),read:async()=>draft,onClose(){},onSettings:callback=>{updateSettings=callback;},
   image:async()=>source,preview:async()=>({type:'image',data:source,name:'dragged.png'})}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/draft-notes-ui.js'),'utf8'),
  {window,document,ResizeObserver:class{observe(){}},clearTimeout,setTimeout});
 await new Promise(setImmediate);
 assert.equal($('draft-images').hidden,false);
 assert.equal($('draft-images').querySelector('img').src,source);
 assert.equal(styles['--draft-image-height'],'120px');
 updateSettings({draftImageHeight:72});
 assert.equal(styles['--draft-image-height'],'72px');
 const zoom=$('draft-images').querySelector('.draft-image-zoom');
 await zoom.dispatch('click');
 assert.equal($('attachment-preview').open,true);
 assert.equal($('attachment-preview-content').querySelector('img').src,source);
 await $('preview-image-size').dispatch('click');
 assert.ok($('attachment-preview-content').classList.contains('preview-original'));
 await $('preview-close').dispatch('click');
 assert.equal($('attachment-preview-content').children.length,0);
 assert.equal($('attachment-preview-content').classList.contains('preview-original'),false);
 assert.equal($('attachments').children.length,1);
 const button=$('attachments').querySelector('button'),image=$('attachments').querySelector('img');
 assert.equal(image.hidden,true);
 await button.dispatch('click');
 assert.equal(image.hidden,false);
 assert.equal(image.src,source);
 assert.equal($('attachment-preview').open,false);
 await button.dispatch('click');
 assert.equal(image.hidden,true);
});

test('draft transfer maps chosen columns and validates duplicates before creating a record',async t=>{
 const {store,addSheet,dir}=setup(t),sheet=addSheet('工作',['text','longtext','timeline','timeline','checkbox']);
 const [subject,body,,milestones,done]=sheet.fields;
 const drafts=new DraftNotes({store:()=>store,settings:()=>({draftAfterTransfer:'keep'}),imageDir:path.join(dir,'draft-images'),
  onSent(){},onError(error){throw error;}});
 const initial=store.createDraft(),items=[{label:'交付',date:'2026-11-15'}];
 const draft=drafts.save(initial.id,initial.version,{title:'專案 A',body:'原始筆記',type:'timeline',items});
 const send=mapping=>drafts.send(draft.id,draft.version,sheet.id,'',false,mapping);
 await assert.rejects(send({title:subject.id,body:subject.id}),/不同欄位/);
 await assert.rejects(send({items:done.id}),/欄位已變更/);
 assert.equal(store.get().document.records.length,0);
 const {id}=await send({title:subject.id,body:body.id,items:milestones.id,extraField:done.id,extraValue:'false'});
 const record=store.get().document.records.find(item=>item.id===id);
 assert.equal(record.title,'專案 A');
 assert.equal(record.notes,'原始筆記');
 assert.deepEqual(record.values,{[subject.id]:'專案 A',[body.id]:'原始筆記',[milestones.id]:items,[done.id]:false});
});

test('pasted images share a folder per draft and older root-level images still open',t=>{
 const {store,dir}=setup(t),imageDir=path.join(dir,'draft-images');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSOkAAAAASUVORK5CYII=','base64');
 const drafts=new DraftNotes({store:()=>store,imageDir,nativeImage:{createFromBuffer:()=>({isEmpty:()=>false,toPNG:()=>png})}});
 const initial=store.createDraft(),first=drafts.paste(initial.id,initial.version,png),second=drafts.paste(first.id,first.version,png);
 const other=store.createDraft(),otherImage=drafts.paste(other.id,other.version,png);
 assert.deepEqual(second.attachments.map(item=>path.dirname(item.path)),[path.join(imageDir,first.id),path.join(imageDir,first.id)]);
 assert.equal(path.dirname(otherImage.attachments[0].path),path.join(imageDir,other.id));
 const legacy=path.join(imageDir,randomUUID()+'.png');
 fs.writeFileSync(legacy,png);
 store.saveDraft(second.id,second.version,{attachments:[...second.attachments,{path:legacy,type:'file',image:true}]});
 assert.equal(drafts.image(second.id,0),drafts.image(second.id,2));
 store.saveDraft(otherImage.id,otherImage.version,{attachments:[second.attachments[0]]});
 assert.throws(()=>drafts.image(other.id,0),/圖片附件不存在/);
});
