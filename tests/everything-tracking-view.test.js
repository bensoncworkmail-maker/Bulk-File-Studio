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
