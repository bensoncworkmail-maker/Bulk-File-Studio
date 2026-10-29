'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {assertLocalPath}=require('./offline-policy');
const {snapshotMoves,fingerprintFile,filenameProblem}=require('./rename-core');
const key=p=>path.resolve(p).normalize('NFC').toLowerCase();
function validate(moves) {
  if(!Array.isArray(moves)||!moves.length||moves.length>5000)throw new Error('請選取 1–5000 個檔案');
  const sources=new Set(),targets=new Set();
  for(const move of moves){
    assertLocalPath(move.source);assertLocalPath(move.destination);
    if(filenameProblem(path.basename(move.destination)))throw new Error('目標檔名無效');
    const source=fs.lstatSync(move.source,{bigint:true}),dir=fs.lstatSync(path.dirname(move.destination),{bigint:true});
    if(!source.isFile()||!dir.isDirectory())throw new Error('搬移只支援一般檔案；請先將資料夾內容加入工作台');
    if(source.dev!==dir.dev)throw new Error('目前只支援同一磁碟／檔案系統內搬移，不支援跨磁碟');
    if(sources.has(key(move.source))||targets.has(key(move.destination)))throw new Error('來源或目標檔名重複');
    sources.add(key(move.source));targets.add(key(move.destination));
    try{fs.lstatSync(move.destination);throw new Error('目標已存在，絕不覆寫：'+move.destination);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(move.expectedFingerprint&&JSON.stringify(fingerprintFile(move.source))!==JSON.stringify(move.expectedFingerprint))throw new Error('檔案已修改或替換，搬移已取消：'+move.source);
  }
}
function planMove(paths,folder) {
  assertLocalPath(folder);if(!fs.lstatSync(folder).isDirectory())throw new Error('請選擇目標資料夾');
  if(!Array.isArray(paths))throw new Error('檔案清單無效');
  const moves=paths.map(source=>({source,destination:path.join(folder,path.basename(source))}));validate(moves);return snapshotMoves(moves);
}
// Exclusive hard links never overwrite a racing destination and retain file identity.
// All target links are established before removing any original names.
function executeRelocation(moves) {
  validate(moves);const linked=[];
  try{
    for(const move of moves){fs.linkSync(move.source,move.destination);linked.push(move);if(JSON.stringify(fingerprintFile(move.destination))!==JSON.stringify(move.expectedFingerprint))throw new Error('檔案在搬移期間已變更');}
    for(const move of moves){if(JSON.stringify(fingerprintFile(move.source))!==JSON.stringify(move.expectedFingerprint))throw new Error('來源在搬移期間已變更');fs.unlinkSync(move.source);}
    return moves.length;
  }catch(e){
    const issues=[];
    for(const move of [...linked].reverse())try{
      if(JSON.stringify(fingerprintFile(move.destination))!==JSON.stringify(move.expectedFingerprint))throw new Error('目標已變更；保留兩邊資料');
      if(!fs.existsSync(move.source))fs.linkSync(move.destination,move.source);
      if(JSON.stringify(fingerprintFile(move.source))!==JSON.stringify(move.expectedFingerprint))throw new Error('來源已被替換；保留目標');
      fs.unlinkSync(move.destination);
    }catch(rollback){issues.push(move.source+' → '+move.destination+'：'+rollback.message);}
    throw new Error('搬移失敗：'+e.message+(issues.length?'；需手動核對：'+issues.join('；'):'；已還原來源位置'));
  }
}
function prepareMoveUndo(history){if(!history||!Array.isArray(history.moves)||history.moves.some(m=>!m||typeof m.source!=='string'||typeof m.destination!=='string'||!m.expectedFingerprint||!['dev','ino','birthtimeNs','size','mtimeNs'].every(k=>typeof m.expectedFingerprint[k]==='string')||!/^[a-f0-9]{64}$/.test(m.expectedFingerprint.sha256)))throw new Error('搬移復原紀錄不完整');if(history.version!==2||history.state!=='completed')throw new Error('搬移未完整完成，不能自動復原；請核對紀錄中的來源及目標');const moves=history.moves.map(m=>({source:m.destination,destination:m.source,expectedFingerprint:m.expectedFingerprint}));validate(moves);return moves;}
module.exports={planMove,executeRelocation,prepareMoveUndo};
