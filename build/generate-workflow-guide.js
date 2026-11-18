'use strict';
const fs=require('node:fs'),path=require('node:path'),{sections}=require('../src/workflow-guide-model');
function generate(){const lines=['# 工作流程中心：用途、情境與例子','','這份說明與應用程式每個頁籤的「用途、使用情境與操作例子」共用同一內容來源。頂端「工作流程」或 Ctrl+Shift+K 可開啟中心；有檔案選取時 Ctrl+K 可帶入動作面板。','','| 功能 | 何時使用 |','| --- | --- |'];for(const guide of Object.values(sections))lines.push('| '+guide.title+' | '+guide.when+' |');for(const guide of Object.values(sections)){lines.push('','## '+guide.title+'（'+guide.number+'）','','**用途**：'+guide.purpose,'','**適用情境**：'+guide.when,'','**例子**：'+guide.example,'');guide.steps.forEach((step,i)=>lines.push((i+1)+'. '+step));lines.push('','**結果**：'+guide.result,'','**留意**：'+guide.note);}lines.push('','[操作限制與資料涵蓋](workflow-center-zh-Hant.md) · [逐項驗收](workflow-implementation-checklist.md)','');return lines.join('\n');}
if(require.main===module)fs.writeFileSync(path.join(__dirname,'../docs/workflow-examples-zh-Hant.md'),generate());
module.exports={generate};
