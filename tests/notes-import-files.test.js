'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {packageImportPath:P,packageImportName,readImportPackageFile}=require('../src/notes-import-files');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-import-file-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
function remoteReader(filename,{change=false,replaced=false}={}){
 const bytes=Buffer.from(JSON.stringify({title:'合約 <script>literal</script>'})),calls=[],state={closed:false},stat={size:bytes.length,mtimeMs:123,dev:4,ino:5,isFile:()=>true,isDirectory:()=>false,isSymbolicLink:()=>false};let stats=0;
 const module={exports:{}},fake={constants:fs.constants,promises:{lstat:async current=>{calls.push(['stat',current]);return current===filename?stat:{...stat,isFile:()=>false,isDirectory:()=>true};},open:async current=>{calls.push(['open',current]);return {stat:async()=>({...stat,...(replaced?{ino:99}:{}),...(change&&stats++?{mtimeMs:456}:{})}),read:async(buffer,offset,length)=>{const remaining=bytes.length-offset,n=Math.max(0,Math.min(length,remaining));if(n)bytes.copy(buffer,offset,offset,offset+n);return {bytesRead:n};},close:async()=>{state.closed=true;}};}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/notes-import-files'),'utf8'),{module,exports:module.exports,process:{platform:'win32'},Buffer,require:name=>name==='node:fs'?fake:name==='node:path'?path:name==='node:util'?require('node:util'):name==='./notes-model'?{LIMITS:{bytes:20*1024*1024}}:name==='./intranet-path'?{withIntranetPaths:(paths,action)=>require('../src/intranet-path').withIntranetPaths(paths,action,async()=>[{address:'10.0.0.4'}])}:null});return {reader:module.exports.readImportPackageFile,calls,state};
}
test('import paths accept UNC, mapped disks, extended UNC/drives and filesystem device volume paths',()=>{
 const cases=[['\\\\Server\\Share\\資料.json','\\\\Server\\Share\\資料.json'],['T:\\Shared\\source.json','T:\\Shared\\source.json'],['\\\\?\\UNC\\Server\\Share\\source.json','\\\\?\\UNC\\Server\\Share\\source.json'],['\\\\?\\C:\\Packages\\source.json','\\\\?\\C:\\Packages\\source.json'],['\\\\.\\C:\\Packages\\source.json','\\\\?\\C:\\Packages\\source.json'],['\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\source.json','\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\source.json']];for(const [input,expected] of cases){assert.equal(P(input,'win32'),expected);assert.equal(packageImportName(expected),input.endsWith('資料.json')?'資料.json':'source.json');}assert.ok(P('\\\\?\\C:\\'+'a'.repeat(5000)+'\\data.json','win32').length>4096);
});
test('device support is limited to real filesystem paths and rejects raw hardware, pipes, URLs, aliases and alternate streams',()=>{
 for(const input of ['https://server/source.json','file://server/share/source.json','relative.json','C:source.json','\\\\Server','\\\\.\\PhysicalDrive0','\\\\.\\pipe\\data.json','\\\\?\\GLOBALROOT\\Device\\Harddisk0','C:\\NUL','C:\\data.json:stream','\\\\?\\C:\\..\\data.json','C:\\data\0.json'])assert.throws(()=>P(input,'win32'),undefined,input);
});
test('asynchronous manual import reads only JSON data and preserves source contents including literal text',async t=>{
 const dir=temp(t),file=path.join(dir,'資料.json'),data={title:'<script>not executed</script>'},text='\ufeff'+JSON.stringify(data);fs.writeFileSync(file,text);const pending=readImportPackageFile(file);assert.equal(typeof pending.then,'function');assert.deepEqual(await pending,data);assert.equal(fs.readFileSync(file,'utf8'),text);
});
test('bounded manual reads reject directories, oversized files, malformed JSON, UTF-8 and symlink ancestors',async t=>{
 const dir=temp(t),file=path.join(dir,'bad.json');await assert.rejects(readImportPackageFile(dir),/一般 JSON/);fs.writeFileSync(file,'{}');fs.truncateSync(file,20*1024*1024+1);await assert.rejects(readImportPackageFile(file),/20 MB/);fs.writeFileSync(file,'not JSON');await assert.rejects(readImportPackageFile(file));fs.writeFileSync(file,Buffer.from([255]));await assert.rejects(readImportPackageFile(file));const link=path.join(dir,'linked');fs.symlinkSync(dir,link,'dir');await assert.rejects(readImportPackageFile(path.join(link,'bad.json')),/連結/);await assert.rejects(readImportPackageFile(path.join(dir,'missing.json')),/連線.*讀取權限/);
});
test('UNC and extended network package reads use native file IO and close the selected handle',async()=>{
 for(const filename of ['\\\\Server\\Share\\source.json','\\\\?\\UNC\\Server\\Share\\source.json','\\\\?\\Volume{12345678-1234-1234-1234-123456789abc}\\source.json']){const h=remoteReader(filename),data=await h.reader(filename);assert.equal(data.title,'合約 <script>literal</script>');assert.deepEqual(h.calls.filter(call=>call[0]==='open'),[['open',filename]]);assert.equal(h.state.closed,true);}
});
test('a package replaced or modified during a network read is rejected and its handle always closes',async()=>{
 const filename='\\\\Server\\Share\\source.json';for(const options of [{change:true},{replaced:true}]){const h=remoteReader(filename,options);await assert.rejects(h.reader(filename),/替換|正在更新/);assert.equal(h.state.closed,true);}
});
