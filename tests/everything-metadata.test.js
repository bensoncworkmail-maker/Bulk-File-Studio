'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parse,date,FLAGS}=require('../src/everything-metadata'),{EverythingBridge}=require('../src/everything-bridge');
const time=ms=>String(BigInt(ms)*10000n+116444736000000000n),csv=fields=>fields.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(',');
test('metadata CSV retains comma filenames, FILETIME dates, missing properties, counts and index file names',()=>{
 const now=Date.UTC(2026,10,16),fields=['C:\\Work\\a,b.pdf',time(now),time(now+1000),'RA',time(now+2000),'12',time(now+3000),'C:\\lists\\a,b.efu'];
 const result=parse(Buffer.from('\uFEFF'+csv(fields)+'\r\n'+csv(['C:\\other.txt','','','','','0','',''])+'\r\n'+csv(['c:\\work\\A,B.PDF','','','','','','',''])+'\r\n'+csv(['\\\\server\\a','','','','','','',''])+'\r\n'));
 assert.equal(result.rows.length,2);assert.equal(result.rows[0].name,'a,b.pdf');assert.equal(result.rows[0].createdMs,now);assert.equal(result.rows[0].accessedMs,now+1000);assert.equal(result.rows[0].dateRunMs,now+3000);assert.equal(result.rows[0].runCount,12);assert.equal(result.rows[0].attributes,'RA');assert.equal(result.rows[0].fileList,'C:\\lists\\a,b.efu');assert.equal(result.rows[1].runCount,0);assert.equal(result.rows[1].createdMs,null);assert.equal(result.skipped,1);
 assert.equal(date('0'),null);assert.equal(date('invalid'),null);assert.equal(date('9'.repeat(20)),null);
});
test('CSV validation rejects invalid UTF-8, malformed quotes, unexpected columns and unbounded output',()=>{
 for(const value of [Buffer.from([0xff]),Buffer.from('"C:\\a"bad,1,2,3,4,5,6,7'),Buffer.from('"unterminated'),Buffer.from('C:\\a,1,2'),Buffer.alloc(20*1024*1024+1)])assert.throws(()=>parse(value));
 const line=csv(['C:\\a','','','','','','','']);assert.throws(()=>parse(Buffer.from(Array(502).fill(line).join('\n'))),/結果上限/);
 const truncated=parse(Buffer.from(Array.from({length:501},(_,i)=>csv(['C:\\a'+i,'','','','','','',''])).join('\n')));assert.equal(truncated.rows.length,500);assert.equal(truncated.truncated,true);
 assert.equal(parse(Buffer.from('')).rows.length,0);
});
function bridge(t,run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bfs-metadata-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const exe=path.join(dir,'es.exe');fs.writeFileSync(exe,'MZtest');const value=new EverythingBridge(path.join(dir,'engine.json'),{platform:'win32',tempRoot:dir,run});value.choose(exe);value.configure(true,'');return {value,dir};}
test('tracked metadata exports fixed columns with shell disabled and leaves interactive tokens untouched',async t=>{
 const calls=[],h=bridge(t,(exe,args,options,done)=>{calls.push({args,options});const metadata=args.includes('-export-csv'),file=args[args.indexOf(metadata?'-export-csv':'-export-txt')+1];setImmediate(()=>{fs.writeFileSync(file,metadata?csv(['C:\\a.txt',time(1000),'','A','','2','','']):'C:\\a.txt\r\n');done(null);});return {kill(){}};});
 const input={text:'*',type:'all',mode:'syntax'},interactive=await h.value.search(input),result=await h.value.search(input,{publish:false,metadata:true});assert.equal(result.rows[0].runCount,2);assert.equal(result.rows[0].createdMs,1000);assert.deepEqual(h.value.selection(interactive.token,[0]),['C:\\a.txt']);
 const call=calls[1];assert.equal(call.options.shell,false);assert.equal(call.args.at(-1),'*');assert.equal(call.args.at(-2),'--');assert.ok(FLAGS.every(flag=>call.args.includes(flag)));assert.equal(fs.readdirSync(h.dir).some(name=>name.startsWith('bfs-everything-')),false);
});
test('older ES metadata switches fall back to the original path-only query without failing tracking',async t=>{
 const calls=[],h=bridge(t,(exe,args,options,done)=>{calls.push(args);setImmediate(()=>{if(args.includes('-export-csv'))done(Object.assign(Error('unsupported'),{code:6}));else {fs.writeFileSync(args[args.indexOf('-export-txt')+1],'C:\\keep.txt\r\n');done(null);}});return {kill(){}};});
 const result=await h.value.search({text:'*',mode:'syntax',type:'file'},{publish:false,metadata:true});assert.equal(result.rows[0].path,'C:\\keep.txt');assert.equal(result.metadataUnavailable,true);assert.equal(calls.length,2);assert.equal(fs.readdirSync(h.dir).some(name=>name.startsWith('bfs-everything-')),false);
});

test('metadata replaces saved ES columns, including extra properties and conflicting column order',async t=>{
 const savedColumns=['size','date-run','name','date-created','system.comment'],original=[...savedColumns],layouts=[],now=Date.UTC(2026,10,16);
 const values={'full-path-and-name':'C:\\Work\\a,b.txt','date-created':time(now),'date-accessed':time(now+1000),attributes:'A','date-recently-changed':time(now+2000),'run-count':'7','date-run':time(now+3000),'file-list-file-name':'C:\\lists\\work.efu',size:'999',name:'a,b.txt','system.comment':'custom property'};
 const h=bridge(t,(exe,args,options,done)=>{
  // Model ES loading es.ini, replacing on -columns, and otherwise only adding named properties.
  let columns=[...savedColumns];for(let i=0;i<args.indexOf('--');i++){if(args[i]==='-columns')columns=args[++i].split(';');else if(Object.hasOwn(values,args[i].slice(1))&&!columns.includes(args[i].slice(1)))columns.push(args[i].slice(1));}
  layouts.push(columns);assert.equal(args.includes('-save-settings'),false);assert.equal(args.includes('-clear-settings'),false);
  setImmediate(()=>{fs.writeFileSync(args[args.indexOf('-export-csv')+1],csv(columns.map(key=>values[key])));done(null);});return {kill(){}};
 });
 const result=await h.value.search({text:'*',type:'file',mode:'syntax'},{publish:false,metadata:true});assert.deepEqual(layouts[0],['full-path-and-name','date-created','date-accessed','attributes','date-recently-changed','run-count','date-run','file-list-file-name']);
 assert.equal(result.rows[0].path,'C:\\Work\\a,b.txt');assert.equal(result.rows[0].createdMs,now);assert.equal(result.rows[0].dateRunMs,now+3000);assert.equal(result.rows[0].runCount,7);assert.deepEqual(savedColumns,original);
});
