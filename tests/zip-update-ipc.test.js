'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),JSZip=require('jszip'),{register}=require('../src/zip-update-ipc');
test('ZIP IPC remembers picker folders, requires native confirmation and rejects forged selections',async t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-zip-ipc-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const source=path.join(root,'downloads'),target=path.join(root,'target');fs.mkdirSync(source);fs.mkdirSync(target);const z=new JSZip();z.file('file.txt','new');const archive=path.join(source,'patch.zip');fs.writeFileSync(archive,await z.generateAsync({type:'nodebuffer'}));let invoke,reply={canceled:false,filePaths:[source]},confirm=1,lock=false;const dialogs=[],service=register({handle:(channel,handler)=>{assert.equal(channel,'zip-update');invoke=(action,value)=>handler({},action,value);},root:path.join(root,'profile'),parent:()=>null,progress(){},dialog:{showOpenDialog:async(_,options)=>{dialogs.push(options);return reply;},showMessageBox:async()=>({response:confirm})},fileOperation:async task=>{assert.equal(lock,false);lock=true;try{return await task();}finally{lock=false;}},openPath:async()=>''});await invoke('choose-source-folder');reply={canceled:false,filePaths:[archive]};await invoke('choose-zip',0);assert.equal(dialogs.at(-1).defaultPath,source);reply={canceled:false,filePaths:[target]};await invoke('choose-target');const p=await invoke('preview','');await assert.rejects(invoke('apply',{token:p.token,ids:['forged']}),/無效/);let r=await invoke('apply',{token:p.token,ids:[p.rows[0].id]});assert.equal(r.canceled,true);assert.equal(fs.readdirSync(target).length,0);assert.ok(service.plan);confirm=0;r=await invoke('apply',{token:p.token,ids:[p.rows[0].id]});assert.equal(r.applied,1);assert.equal((await invoke('details',r.id)).applied,1);assert.equal((await invoke('state')).sourceFolders[0],source);await assert.rejects(invoke('select-target',99),/變更/);const undo=await invoke('undo',r.id);assert.equal(undo.restored,1);assert.equal(fs.existsSync(path.join(target,'file.txt')),false);});
test('inline ZIP and target browsing uses issued tokens, keeps source browsing separate and invalidates plans when target changes',async t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-zip-browse-ipc-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const source=path.join(root,'source'),target=path.join(root,'target');fs.mkdirSync(source);fs.mkdirSync(target);fs.mkdirSync(path.join(source,'child'));fs.mkdirSync(path.join(target,'els1104'));fs.writeFileSync(path.join(target,'existing.dart'),'old');const zip=new JSZip();zip.file('form.dart','new');fs.writeFileSync(path.join(source,'changes.zip'),await zip.generateAsync({type:'nodebuffer'}));let invoke,folder=source;const service=register({handle:(_,fn)=>invoke=(action,value)=>fn({},action,value),root:path.join(root,'profile'),parent:()=>null,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[folder]})},fileOperation:task=>task(),openPath:async()=>''});let state=await invoke('choose-source-folder');const archive=state.browsers.source.rows.find(r=>r.kind==='zip');state=await invoke('source-open',archive.id);assert.ok(state.selected.zipPath.endsWith('changes.zip'));assert.equal(state.files.length,1);await assert.rejects(invoke('source-open','../changes.zip'),/清單已變更/);folder=target;state=await invoke('choose-target');assert.ok(state.browsers.target.rows.some(r=>r.name==='existing.dart'));const dir=state.browsers.target.rows.find(r=>r.kind==='folder');state=await invoke('target-enter',dir.id);assert.equal(state.selected.target,path.join(target,'els1104'));assert.ok(state.browsers.target.canUp);const p=await invoke('preview','');assert.equal(p.rows[0].destination,path.join(target,'els1104','form.dart'));state=await invoke('source-enter',state.browsers.source.rows.find(r=>r.kind==='folder').id);assert.equal(state.selected.zipPath,path.join(source,'changes.zip'));assert.equal(service.plan.token,p.token);await invoke('source-up');state=await invoke('target-up');assert.equal(state.selected.target,target);assert.equal(service.plan,null);await assert.rejects(invoke('target-enter',dir.id),/清單已變更/);});
test('saved targets survive restart and removal forgets both lists without deleting folders or changing the active preview',async t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-zip-saved-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const target=path.join(root,'target');fs.mkdirSync(target);let invoke,pick=target;const options={handle:(_,fn)=>invoke=(action,value)=>fn({},action,value),root:path.join(root,'profile'),parent:()=>null,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[pick]})},fileOperation:task=>task(),openPath:async()=>''};let service=register(options);await invoke('choose-target');let state=await invoke('save-target');assert.deepEqual(state.savedTargets,[target]);for(let i=0;i<12;i++){pick=path.join(root,'other'+i);fs.mkdirSync(pick);await invoke('choose-target');}state=await invoke('state');assert.equal(state.targetFolders.includes(target),false);assert.equal(state.savedTargets.includes(target),true);service=register(options);state=await invoke('select-saved-target',0);assert.equal(state.selected.target,target);service.plan={token:'unchanged'};state=await invoke('forget-target',{kind:'saved',index:0});assert.equal(state.savedTargets.length,0);assert.equal(state.targetFolders.includes(target),false);assert.equal(state.selected.target,target);assert.equal(service.plan.token,'unchanged');assert.equal(fs.statSync(target).isDirectory(),true);await assert.rejects(invoke('forget-target',{kind:'saved',index:0}),/變更/);register(options);state=await invoke('state');assert.equal(state.savedTargets.length,0);});

test('opening ZIP page reloads locations and newest ZIP comparison needs no picker or manual refresh',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-zip-latest-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const downloads=path.join(root,'Downloads'),target=path.join(root,'project');
 fs.mkdirSync(downloads);fs.mkdirSync(target);
 let invoke,picker=0;
 const options={handle:(_,fn)=>invoke=(action,value)=>fn({},action,value),root:path.join(root,'profile'),downloads,
  parent:()=>null,dialog:{showOpenDialog:async()=>{picker++;return {canceled:false,filePaths:[target]};}},fileOperation:task=>task(),openPath:async()=>''};
 register(options);
 await invoke('choose-target');
 register(options);
 let state=await invoke('refresh-locations');
 assert.equal(state.browsers.source.folder,downloads);
 assert.equal(state.selected.target,target);
 assert.equal(state.browsers.source.rows.length,0);
 for(const [name,time] of [['a-new.zip',2000],['z-old.zip',1000]]){
  const zip=new JSZip();zip.file('change.txt',name);
  const file=path.join(downloads,name);fs.writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));
  fs.utimesSync(file,time,time);
 }
 state=await invoke('choose-latest');
 assert.equal(state.selected.zipPath,path.join(downloads,'a-new.zip'));
 const plan=await invoke('preview','');
 assert.equal(plan.rows[0].destination,path.join(target,'change.txt'));
 assert.deepEqual(fs.readdirSync(target),[]);
 assert.equal(picker,1);
});

test('ZIP folder mismatch warns before writing and choosing the correct source root removes the warning',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-zip-structure-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const target=path.join(root,'project'),archive=path.join(root,'patch.zip'),zip=new JSZip();
 for(const folder of ['forms','models','views','target-only'])fs.mkdirSync(path.join(target,folder),{recursive:true});
 fs.mkdirSync(path.join(target,'project','forms'),{recursive:true});
 zip.file('project/forms/main.txt','new');
 zip.file('project/forms/other.txt','new');
 zip.file('project/models/data.txt','new');
 zip.file('project/views/page.txt','new');
 fs.writeFileSync(archive,await zip.generateAsync({type:'nodebuffer'}));
 let invoke,confirmation;
 register({handle:(_,fn)=>invoke=(action,value)=>fn({},action,value),root:path.join(root,'profile'),parent:()=>null,
  dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[target]}),showMessageBox:async(_,options)=>{confirmation=options;return {response:1};}},
  fileOperation:task=>task(),openPath:async()=>''});
 await invoke('drop-zip',archive);
 await invoke('choose-target');
 let plan=await invoke('preview','');
 assert.match(plan.structureWarning,/3 個資料夾直接存放檔案，其中 2 個/);
 const apply=()=>invoke('apply',{token:plan.token,ids:plan.rows.map(row=>row.id)});
 assert.deepEqual(await apply(),{canceled:true});
 assert.equal(confirmation.type,'warning');
 assert.equal(confirmation.buttons[0],'仍要套用');
 assert.equal(confirmation.buttons[confirmation.defaultId],'取消');
 assert.ok(confirmation.detail.includes(plan.structureWarning));
 assert.ok(confirmation.detail.includes(target));
 assert.deepEqual(fs.readdirSync(path.join(target,'project','forms')),[]);
 plan=await invoke('preview','project');
 assert.equal(plan.structureWarning,'');
 assert.equal(plan.rows[0].destination,path.join(target,'forms','main.txt'));
 assert.deepEqual(await apply(),{canceled:true});
 assert.equal(confirmation.type,'question');
 assert.match(confirmation.detail,/ZIP 來源層級：project\//);
});
