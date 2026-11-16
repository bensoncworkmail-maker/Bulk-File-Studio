'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {documentFromHTML}=require('./helpers/dom'),model=require('../src/everything-query');
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
function setup(){
 const document=documentFromHTML(fs.readFileSync(require.resolve('../src/index.html'),'utf8')),saved=[];let busy=false,changes=0;
 const window={everythingQuery:model,everythingAPI:{saveFileType:async input=>{saved.push(input);return {fileTypes:[{name:input.name,extensions:model.normalizeExtensions(input.extensions)}]};},removeFileType:async name=>{saved.push(name);return {fileTypes:[]};}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/everything-workbench'),'utf8'),{window,document});
 const ui=window.everythingWorkbench;ui.setup({key:'everything-rule',text:'everything-rule-text',mode:'everything-rule-mode',type:'everything-rule-type',blocked:()=>busy,changed:()=>changes++});
 return {document,window,ui,saved,$:id=>document.getElementById(id),busy:value=>busy=value,changes:()=>changes,root:document.querySelector('.everything-workbench')};
}
const find=(root,label)=>root.querySelectorAll('button').find(item=>item.textContent===label);
test('presets replace intentionally and quick conditions preserve OR and quoted keyword grouping',async()=>{
 const h=setup(),text=h.$('everything-rule-text'),mode=h.$('everything-rule-mode');text.value='ext:pdf | ext:docx';mode.value='syntax';
 await find(h.root,'＋ 最近 7 天').dispatch('click');assert.equal(text.value,'<ext:pdf | ext:docx> dm:7days');
 mode.value='simple';text.value='Annual Report';await find(h.root,'＋ 大於 1 GB').dispatch('click');assert.equal(text.value,'<"Annual" "Report"> size:>1gb');assert.equal(mode.value,'syntax');
 h.root.querySelector('select').value='video';await find(h.root,'套用預設（取代條件）').dispatch('click');assert.equal(text.value,'dm:7days size:>200mb');assert.equal(h.$('everything-rule-type').value,'video');
 h.busy(true);await find(h.root,'＋ 今天修改').dispatch('click');assert.equal(text.value,'dm:7days size:>200mb');assert.equal(h.changes(),3);
});
test('custom profiles can be saved, selected and deleted across both query editors without rewriting the query text',async()=>{
 const h=setup();h.ui.setup({key:'everything-search',text:'everything-query',mode:'everything-mode',type:'everything-type'});
 const text=h.$('everything-rule-text');text.value='size:>200mb';h.$('everything-rule-type').value='custom';await h.$('everything-rule-type').dispatch('change');h.$('everything-rule-extensions').value='.PDF,docx';
 const name=h.root.querySelector('[aria-label="儲存自訂檔案類型的名稱"]');name.value='工作文件';await find(h.root,'儲存／更新類型').dispatch('click');await flush();
 const other=h.document.querySelectorAll('.everything-workbench')[1],profiles=other.querySelector('[aria-label="已儲存的自訂檔案類型"]');assert.equal(profiles.children[1].value,'工作文件');profiles.value='工作文件';await find(other,'使用此類型').dispatch('click');assert.equal(h.$('everything-type').value,'custom');assert.equal(h.ui.get('everything-search').extensions,'docx;pdf');assert.equal(text.value,'size:>200mb');
 await find(other,'移除此類型').dispatch('click');await flush();assert.equal(profiles.children.length,1);assert.equal(h.ui.get('everything-search').extensions,'docx;pdf');
 h.ui.busy('everything-search',true);assert.equal(h.$('everything-search-extensions').disabled,true);
});
test('path assignment quotes spaces, supports exclusion and rejects expressions in place of a directory',async()=>{
 const h=setup(),path=h.root.querySelector('[aria-label="限定或排除的資料夾路徑"]'),text=h.$('everything-rule-text');text.value='dm:today';path.value='C:\\Work Projects';
 await find(h.root,'排除此資料夾').dispatch('click');assert.equal(text.value,'<dm:today> !"C:\\Work Projects\\"');
 path.value='C:\\Work" | *';await find(h.root,'限定資料夾').dispatch('click');assert.match(h.root.querySelector('[role="status"]').textContent,/完整/);assert.equal(text.value,'<dm:today> !"C:\\Work Projects\\"');
});
