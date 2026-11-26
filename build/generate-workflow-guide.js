'use strict';
const fs=require('node:fs'),path=require('node:path'),{sections}=require('../src/workflow-guide-model');
function generate(){const lines=['# 工具箱：用途、情境與例子','','工具箱提供工作集、參數範本、追蹤變更、離線 OCR、備份及檔案工具。工作集操作見工具箱指南。下列工具的操作例子與應用程式共用內容來源。','','| 功能 | 何時使用 |','| --- | --- |'];for(const guide of Object.values(sections))lines.push('| '+guide.title+' | '+guide.when+' |');for(const guide of Object.values(sections)){lines.push('','## '+guide.title+'（'+guide.number+'）','','**用途**：'+guide.purpose,'','**適用情境**：'+guide.when,'','**例子**：'+guide.example,'');guide.steps.forEach((step,i)=>lines.push((i+1)+'. '+step));lines.push('','**結果**：'+guide.result,'','**留意**：'+guide.note);}lines.push('','[操作限制與資料涵蓋](workflow-center-zh-Hant.md) · [逐項驗收](workflow-implementation-checklist.md)','');return lines.join('\n');}
if(require.main===module)fs.writeFileSync(path.join(__dirname,'../docs/workflow-examples-zh-Hant.md'),generate());
module.exports={generate};
