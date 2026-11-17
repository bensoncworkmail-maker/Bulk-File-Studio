'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),P=require('../src/productivity-model'),{viewData}=require('../src/tool-views-model');
function fixture(){
 const fields=[{id:randomUUID(),label:'跟進日期',type:'date'},{id:randomUUID(),label:'下次跟進',type:'date'},{id:randomUUID(),label:'歷程',type:'timeline'}],sheet={id:randomUUID(),name:'紀錄',fields};
 const record={id:randomUUID(),sheetId:sheet.id,title:'New timecard installation',notes:'Studio Clip',values:{[fields[0].id]:'2026-11-17',[fields[1].id]:'2026-11-17'}};
 return {fields,sheet,record,doc:{areas:[],sheets:[sheet],records:[record]}};
}
test('same-record date fields on the same day produce one calendar entry and one count with both field labels',()=>{
 const h=fixture(),before=JSON.stringify(h.doc),events=P.agenda(h.doc,[],'2026-11');assert.equal(events.length,1);assert.equal(events[0].label,'跟進日期、下次跟進');assert.equal(events[0].recordId,h.record.id);
 for(const mode of ['calendar','list']){
  const data=viewData(h.doc,[],[],{kind:'planning',query:''},{mode,month:'2026-11',day:'2026-11-17'});assert.equal(data.total,1);assert.equal(data.rows.length,1);assert.match(data.rows[0].detail,/跟進日期、下次跟進/);if(mode==='calendar')assert.equal(data.counts['2026-11-17'],1);
 }
 assert.equal(viewData(h.doc,[],[],{kind:'planning',query:''},{mode:'list',month:'2026-11',query:'下次跟進'}).total,1);assert.equal(JSON.stringify(h.doc),before);
});
test('distinct dates, different records, timeline items and reminders retain independent calendar entries',()=>{
 const h=fixture();h.record.values[h.fields[1].id]='2026-11-18';assert.deepEqual(P.agenda(h.doc,[],'2026-11').map(event=>event.date),['2026-11-17','2026-11-18']);
 h.record.values[h.fields[1].id]='2026-11-17';h.doc.records.push({...h.record,id:randomUUID()});h.record.values[h.fields[2].id]=[{date:'2026-11-17',label:'電話'},{date:'2026-11-17',label:'電郵'}];
 const reminders=[{recordId:h.record.id,at:new Date(2026,10,17,12).toISOString(),status:'pending'}],events=P.agenda(h.doc,reminders,'2026-11');assert.equal(events.filter(event=>event.kind==='date').length,2);assert.equal(events.filter(event=>event.kind==='timeline').length,4);assert.equal(events.filter(event=>event.kind==='reminder').length,1);
 h.record.deletedAt=new Date().toISOString();assert.equal(P.agenda(h.doc,[],'2026-11').filter(event=>event.recordId===h.record.id).length,0);
});
