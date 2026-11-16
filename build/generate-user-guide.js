'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function generate(){
 const css=fs.readFileSync(path.join(root,'src/user-guide.css'),'utf8'),script=['user-guide-model.js','user-guide-ui.js'].map(file=>fs.readFileSync(path.join(root,'src',file),'utf8')).join('\n')+"\nwindow.userGuideUI.mount(document.getElementById('user-guide-root'));\n";
 const hash=text=>crypto.createHash('sha256').update(text).digest('base64');
 return `<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(css)}'; base-uri 'none'; form-action 'none'"><title>Bulk File Studio 新手使用指南 v${require('../src/user-guide-model').version}</title><style>${css}</style></head><body><main id="user-guide-root"></main><noscript>請啟用瀏覽器 JavaScript 以閱讀本機指南；指南不需網路連線。</noscript><script>${script}</script></body></html>\n`;
}
if(require.main===module)fs.writeFileSync(path.join(root,'docs/user-guide-zh-Hant.html'),generate());
module.exports={generate};
