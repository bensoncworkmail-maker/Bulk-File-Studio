'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {location,sortedRows}=require('../src/everything-tracking-view');
test('table locations display the containing directory including Windows drive and POSIX roots',()=>{
 assert.equal(location({path:'C:\\Work\\video.mp4'}),'C:\\Work');assert.equal(location({path:'C:\\root.txt'}),'C:\\');assert.equal(location({path:'/root.txt'}),'/');assert.equal(location({path:'/tmp/album'}),'/tmp');
});
test('table sorting is numeric, stable and retains original snapshot indices without mutating rows',()=>{
 const rows=[{name:'File10',path:'C:\\B\\10.txt',size:10,modifiedMs:20},{name:'File2',path:'C:\\A\\2.txt',size:2,modifiedMs:10},{name:'File2',path:'C:\\C\\2.txt',size:null,modifiedMs:null},{name:'folder',path:'C:\\D\\folder',type:'folder',size:999,modifiedMs:30}];
 const original=structuredClone(rows),ids=(key,dir)=>sortedRows(rows,key,dir).map(row=>row.index);
 assert.deepEqual(ids('name','asc'),[1,2,0,3]);assert.deepEqual(ids('name','desc'),[3,0,1,2]);assert.deepEqual(ids('location','asc'),[1,0,2,3]);
 assert.deepEqual(ids('size','asc'),[1,0,2,3]);assert.deepEqual(ids('size','desc'),[0,1,2,3]);assert.deepEqual(ids('modified','desc'),[3,0,1,2]);assert.deepEqual(rows,original);
});

test('optional columns normalize, format and sort dates, extension, type and run counts with original result indices',()=>{
 const M=require('../src/everything-result-columns'),rows=[{name:'z.MP4',path:'C:\\z.MP4',type:'file',createdMs:20,runCount:10},{name:'a.pdf',path:'C:\\a.pdf',type:'file',createdMs:10,runCount:2},{name:'folder.with.dot',path:'C:\\folder.with.dot',type:'folder',createdMs:null,runCount:null}];
 assert.deepEqual(M.normalizeColumns(),['name','location','size','modified']);assert.deepEqual(M.normalizeColumns(['extension','extension','unknown']),['name','extension']);assert.deepEqual(M.normalizeColumns([]),['name']);
 assert.equal(M.value(rows[0],'extension'),'mp4');assert.equal(M.value(rows[2],'extension'),'');assert.equal(M.value(rows[1],'fullPath'),'C:\\a.pdf');assert.equal(M.display(rows[2],'created'),'—');assert.equal(M.display({runCount:0},'runCount'),'0');assert.equal(M.display(rows[2],'type'),'資料夾');
 assert.deepEqual(sortedRows(rows,'created','desc').map(row=>row.index),[0,1,2]);assert.deepEqual(sortedRows(rows,'runCount','asc').map(row=>row.index),[1,0,2]);
});


test('result filter matches literal name/path terms without changing rows or their source indices',()=>{
 const {filterRows}=require('../src/everything-tracking-view'),rows=[{name:'Report[1].PDF',path:'C:\\Work\\Report[1].PDF'},{name:'report2.pdf',path:'C:\\Other\\report2.pdf'},{name:'Work',path:'C:\\Work',type:'folder'}],entries=sortedRows(rows),before=structuredClone(rows);
 assert.deepEqual(filterRows(entries,'WORK report[1]').map(row=>row.index),[0]);assert.deepEqual(filterRows(entries,'REPORT').map(row=>row.index),[0,1]);assert.deepEqual(filterRows(entries,'not-found'),[]);assert.deepEqual(filterRows(entries,'   '),entries);assert.deepEqual(rows,before);
});

test('size display units are binary, handle small values and leave numeric sort values unchanged',()=>{
 const M=require('../src/everything-result-columns'),item={size:18432,type:'file'};assert.equal(M.formatSize(1024),'1 KB');assert.equal(M.display(item,'size',{sizeUnit:'KB'}),'18 KB');assert.equal(M.display(item,'size',{sizeUnit:'bytes'}),'18,432 bytes');assert.equal(M.display(item,'size',{sizeUnit:'MB'}),'0.02 MB');assert.equal(M.display(item,'size',{sizeUnit:'GB'}),'<0.01 GB');assert.equal(M.formatSize(1073741824,'GB'),'1 GB');assert.equal(M.formatSize(0,'KB'),'0 KB');assert.equal(M.formatSize(null,'MB'),'—');assert.equal(M.display({size:20,type:'folder'},'size',{sizeUnit:'KB'}),'—');assert.equal(M.value(item,'size'),18432);assert.equal(M.normalizeSizeUnit('invalid'),'auto');
});
