'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {WindowsContextMenu,favoriteArguments,ROOTS}=require('../src/windows-context-menu');
function registry() {
  const values=new Map(),calls=[];
  const run=(program,args,options)=>{
    calls.push({program,args,options});const [verb,key]=args;
    if(verb==='add'){const name=args.includes('/ve')?'':args[args.indexOf('/v')+1];values.set(key+'|'+name,args[args.indexOf('/d')+1]);return {status:0,stdout:''};}
    if(verb==='delete'){for(const k of values.keys())if(k.startsWith(key+'|')||k.startsWith(key+'\\'))values.delete(k);return {status:0};}
    const found=[...values.entries()].filter(([k])=>k.startsWith(key+'|')||k.startsWith(key+'\\'));
    return {status:found.length?0:1,stdout:found.map(([k,value])=>k+' '+value).join('\n')};
  };
  return {run,values,calls};
}
test('CLI requires an explicit favorite marker and keeps absolute paths as data',()=>{
  const file='C:\\Work\\報表 & notes.txt';
  assert.deepEqual(favoriteArguments(['studio.exe','--favorite','--',file]),[file]);
  assert.deepEqual(favoriteArguments(['studio.exe','--favorite',file]),[]);
  assert.deepEqual(favoriteArguments(['studio.exe','--favorite','--','relative.txt','--option','C:\\Folder']),['C:\\Folder']);
});
test('right-click setup uses per-user keys, a quoted executable, no shell, and can be removed',()=>{
  const reg=registry(),exe='C:\\Apps\\A & B\\Studio.exe';
  const manager=new WindowsContextMenu({platform:'win32',packaged:true,executable:exe,run:reg.run});
  assert.equal(manager.status().enabled,false);assert.equal(manager.setEnabled(true).enabled,true);
  assert.equal(reg.values.get(ROOTS[0]+'\\command|'),`"${exe}" --favorite -- "%1"`);
  assert.ok(reg.calls.every(call=>call.program==='reg.exe'&&call.options.shell===false));
  assert.ok(reg.calls.filter(call=>call.args[0]==='add').every(call=>call.args[1].startsWith('HKCU\\')));
  assert.equal(manager.setEnabled(false).enabled,false);assert.equal(reg.values.size,0);
});
test('unsupported and portable builds never modify the registry',()=>{
  const reg=registry();
  for(const options of [{platform:'linux',packaged:true},{platform:'win32',packaged:false},{platform:'win32',packaged:true,portable:true}]) {
    const manager=new WindowsContextMenu({...options,run:reg.run});
    assert.equal(manager.status().supported,false);assert.throws(()=>manager.setEnabled(true),/安裝版/);
  }
  assert.equal(reg.calls.length,0);
});
test('partial registration errors clean up this app keys instead of reporting success',()=>{
  const reg=registry();let writes=0;
  const manager=new WindowsContextMenu({platform:'win32',packaged:true,executable:'C:\\Apps\\Studio.exe',run:(program,args,options)=>{
    if(args[0]==='add'&&++writes===5)return {status:1,stderr:'injected access denied'};
    return reg.run(program,args,options);
  }});
  assert.throws(()=>manager.setEnabled(true),/access denied/);assert.equal(reg.values.size,0);
});
