'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),crypto=require('node:crypto');
const {NotesStore}=require('../src/notes-store'),M=require('../src/notes-model');
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function setup(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-notes-ui-')),store=new NotesStore(path.join(dir,'workspace.sqlite'));t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
 class El{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.events={};this.dataset={};this.value='';this.checked=false;this.disabled=false;this.open=false;this.hidden=false;this._text='';this.className='';this.classList={toggle:(name,on)=>{const values=new Set(this.className.split(' ').filter(Boolean));if(on===undefined)on=!values.has(name);on?values.add(name):values.delete(name);this.className=[...values].join(' ');},contains:name=>this.className.split(' ').includes(name)};}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(value){throw new Error('Unsafe HTML rendering: '+value);}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}setAttribute(key,value){this.attrs[key]=value;}addEventListener(event,callback){this.events[event]=callback;}focus(){}showModal(){this.open=true;}close(){this.open=false;}
 }
 const els=new Map(),html=fs.readFileSync(path.join(__dirname,'../src/index.html'),'utf8');for(const match of html.matchAll(/<([\w-]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new El(match[1]);if(match[0].includes(' hidden'))node.hidden=true;els.set(match[2],node);}
 for(const [id,value] of [['notes-sort','updated'],['notes-export-scope','all'],['notes-import-mode','copy']])els.get(id).value=value;
 const errors=[],toasts=[];let changed;
 const api={get:async()=>store.get(),favorites:async()=>({items:[]}),template:async()=>store.addTemplate(),saveSheet:async input=>store.saveSheet(input),saveRecord:async input=>store.saveRecord({...input,fileLinks:[]}),trash:async(...args)=>store.trash(...args),history:async id=>store.history(id),restoreHistory:async(...args)=>store.restoreHistory(...args),exportPreview:async options=>store.exportPreview(options),exportSave:async()=>({canceled:false,path:'share.json'}),onChanged:callback=>changed=callback};
 const window={notesModel:M,workspaceAPI:api,favoritesAPI:{onChanged(){}},favoritesModel:require('../src/favorites-model'),favoritesUI:{show(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/notes.js'),'utf8'),{window,document:{getElementById:id=>els.get(id),createElement:tag=>new El(tag)},crypto},{filename:'notes.js'});
 window.notesUI.init({showToast:value=>toasts.push(value),showFailure:(title,error)=>errors.push(String(error.message||error))});return {store,els,ui:window.notesUI,errors,toasts,changed:()=>changed({})};
}
test('workspace UI creates a template and page, renders literal notes and shows linked client information',async t=>{
 const h=setup(t);h.ui.activate();await flush();h.els.get('notes-template').events.click();h.els.get('notes-confirm-apply').events.click();await flush();assert.equal(h.store.get().document.sheets.length,4);
 h.els.get('notes-new-record').events.click();assert.equal(h.ui.canLeave(),false);h.els.get('notes-record-title').value='CLIENT_1';h.els.get('notes-record-body').value='<script>alert(1)</script>';h.els.get('notes-record-form').events.submit({preventDefault(){}});await flush();assert.equal(h.store.get().document.records.length,1);assert.equal(h.ui.canLeave(),true);assert.match(h.els.get('notes-detail-body').textContent,/<script>alert\(1\)<\/script>/);assert.equal(h.els.get('notes-detail').hidden,false);
 const state=h.store.get(),contactSheet=state.document.sheets[1],client=state.document.records[0];h.store.saveRecord({sheetId:contactSheet.id,title:'John',notes:'聯絡紀錄',tags:[],values:{[contactSheet.fields[0].id]:[client.id],[contactSheet.fields[2].id]:'01234567'},fileLinks:[]});h.changed();await flush();assert.match(h.els.get('notes-detail-body').textContent,/John/);assert.match(h.els.get('notes-detail-body').textContent,/電話：01234567/);assert.deepEqual(h.errors,[]);
});
test('workspace UI previews scoped sharing and supports cross-table searches without rendering HTML',async t=>{
 const h=setup(t);h.store.addTemplate();const sheet=h.store.get().document.sheets[0];h.store.saveRecord({sheetId:sheet.id,title:'ABC',notes:'聯絡資料',tags:['VIP'],values:{},fileLinks:[]});h.ui.activate();await flush();h.els.get('notes-export').events.click();h.els.get('notes-transfer-preview').events.click();await flush();assert.equal(h.els.get('notes-transfer-apply').disabled,false);assert.match(h.els.get('notes-transfer-summary').textContent,/1 筆/);assert.match(h.els.get('notes-transfer-preview-list').textContent,/ABC/);h.els.get('notes-transfer-cancel').events.click();h.els.get('notes-search').value='No match';h.els.get('notes-search').events.input();assert.match(h.els.get('notes-table').textContent,/尚無符合/);h.els.get('notes-search').value='VIP';h.els.get('notes-global-search').checked=true;h.els.get('notes-search').events.input();assert.match(h.els.get('notes-table').textContent,/ABC/);assert.deepEqual(h.errors,[]);
});
