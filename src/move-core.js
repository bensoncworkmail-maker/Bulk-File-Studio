'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Buffer}=require('node:buffer');
const {assertLocalPath}=require('./offline-policy');
const {fingerprintFile,filenameProblem}=require('./rename-core');
const key=p=>path.resolve(p).normalize('NFC').toLowerCase();
const directoryFields=['dev','ino','birthtimeNs'];
const fileFields=[...directoryFields,'size','mtimeNs'];
const isFolder=move=>move.kind==='folder';
const depth=p=>path.resolve(p).split(path.sep).length;
const directories=moves=>moves.filter(isFolder).sort((a,b)=>depth(a.source)-depth(b.source));
const directoryFingerprint=filepath=>{
  assertLocalPath(filepath);const stat=fs.lstatSync(filepath,{bigint:true});
  if(!stat.isDirectory())throw new Error('資料夾已被修改或替換：'+filepath);
  return Object.fromEntries(directoryFields.map(field=>[field,String(stat[field])]));
};
const fingerprint=(filepath,folder)=>folder?directoryFingerprint(filepath):fingerprintFile(filepath);
const equal=(a,b)=>a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(field=>a[field]===b[field]);
const exists=filepath=>{try{fs.lstatSync(filepath);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const inside=(parent,child)=>{const relative=path.relative(key(parent),key(child));return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
function assertExpected(filepath,expected,folder){if(!equal(fingerprint(filepath,folder),expected))throw new Error('檔案或資料夾已修改或替換：'+filepath);}
function assertSourceTrees(moves){
  const children=new Map();for(const move of moves){const parent=key(path.dirname(move.source));if(!children.has(parent))children.set(parent,[]);children.get(parent).push(path.basename(move.source));}
  for(const move of directories(moves)){
    assertExpected(move.source,move.expectedFingerprint,true);
    const expected=(children.get(key(move.source))||[]).sort(),actual=fs.readdirSync(move.source).sort();
    if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('資料夾內容已變更，請重新預覽：'+move.source);
  }
}
function validate(moves){
  if(!Array.isArray(moves)||!moves.length||moves.length>5000)throw new Error('每批請選取 1–5000 個檔案／資料夾（含子項目）');
  const sources=new Set(),targets=new Set(),plannedDirectories=new Set(moves.filter(isFolder).map(move=>key(move.destination)));
  for(const move of moves){
    assertLocalPath(move.source);assertLocalPath(move.destination);
    if(move.kind!==undefined&&!['file','folder'].includes(move.kind))throw new Error('搬移項目類型無效');
    if(filenameProblem(path.basename(move.destination)))throw new Error('目標檔名無效');
    const stat=fs.lstatSync(move.source);
    if(isFolder(move)?!stat.isDirectory():!stat.isFile())throw new Error('只支援一般檔案與資料夾，不接受連結');
    const parent=path.dirname(move.destination);
    if(!plannedDirectories.has(key(parent))&&!fs.lstatSync(parent).isDirectory())throw new Error('目標上層不是資料夾');
    if(sources.has(key(move.source))||targets.has(key(move.destination)))throw new Error('來源或目標檔名重複');
    sources.add(key(move.source));targets.add(key(move.destination));
    if(exists(move.destination))throw new Error('目標已存在，絕不覆寫：'+move.destination);
    const fields=isFolder(move)?directoryFields:fileFields;
    if(!move.expectedFingerprint||!fields.every(field=>typeof move.expectedFingerprint[field]==='string')||!isFolder(move)&&!/^[a-f0-9]{64}$/.test(move.expectedFingerprint.sha256))throw new Error('搬移校驗資料不完整');
    assertExpected(move.source,move.expectedFingerprint,isFolder(move));
  }
  const roots=directories(moves).filter(move=>!sources.has(key(path.dirname(move.source))));
  for(const move of moves){if(sources.has(key(move.destination)))throw new Error('來源與目標重疊');for(const dir of roots)if(inside(dir.source,move.destination))throw new Error('目標不可位於來源資料夾內');}
  assertSourceTrees(moves);
}
function planMove(paths,folder){
  assertLocalPath(folder);if(!fs.lstatSync(folder).isDirectory())throw new Error('請選擇目標資料夾');
  if(!Array.isArray(paths)||!paths.length||paths.length>5000)throw new Error('請選取 1–5000 個檔案／資料夾');
  const selected=[...new Set(paths.map(input=>path.resolve(assertLocalPath(input))))];
  const roots=selected.filter(input=>!selected.some(other=>other!==input&&inside(other,input)&&fs.lstatSync(other).isDirectory()));
  const moves=[];
  function add(source,destination){
    assertLocalPath(source);const stat=fs.lstatSync(source),kind=stat.isDirectory()?'folder':'file';
    if(!stat.isDirectory()&&!stat.isFile())throw new Error('只支援一般檔案與資料夾，不接受連結');
    if(moves.length>=5000)throw new Error('每批最多 5000 個檔案／資料夾（含子項目）');
    moves.push({source,destination,kind,expectedFingerprint:fingerprint(source,kind==='folder')});
    if(kind==='folder')for(const name of fs.readdirSync(source).sort())add(path.join(source,name),path.join(destination,name));
  }
  for(const source of roots){if(source===path.parse(source).root)throw new Error('不可搬移整個磁碟根目錄');if(fs.lstatSync(source).isDirectory()&&inside(source,folder))throw new Error('目標不可位於來源資料夾內');add(source,path.join(folder,path.basename(source)));}
  validate(moves);return moves;
}
// Claim the destination exclusively. Only remove files whose identity is still ours.
// Copy in bounded chunks, flush, and verify content before deleting any source.
function copyExclusive(source,destination,expected){
  assertExpected(source,expected,false);assertLocalPath(destination);
  const input=fs.openSync(source,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));let output,owned;
  try{
    const stat=fs.fstatSync(input);output=fs.openSync(destination,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),stat.mode&0o777);
    const actual=fs.fstatSync(output,{bigint:true});owned=Object.fromEntries(directoryFields.map(field=>[field,String(actual[field])]));
    const buffer=Buffer.allocUnsafe(256*1024);let length;
    while((length=fs.readSync(input,buffer,0,buffer.length,null))>0){let offset=0;while(offset<length){const written=fs.writeSync(output,buffer,offset,length-offset);if(!written)throw new Error('目標寫入未完成');offset+=written;}}
    fs.futimesSync(output,stat.atimeMs/1000,stat.mtimeMs/1000);fs.fsyncSync(output);
    assertExpected(source,expected,false);const result=fingerprintFile(destination);
    if(!directoryFields.every(field=>result[field]===owned[field])||result.size!==expected.size||result.sha256!==expected.sha256)throw new Error('複製校驗失敗：'+destination);
    return result;
  }catch(e){
    if(output!==undefined){fs.closeSync(output);output=undefined;}
    if(owned)try{const stat=fs.lstatSync(destination,{bigint:true});if(directoryFields.every(field=>String(stat[field])===owned[field]))fs.unlinkSync(destination);}catch(cleanup){if(cleanup.code!=='ENOENT')e.message+='；暫存目標需核對：'+destination+'：'+cleanup.message;}
    throw e;
  }finally{if(output!==undefined)fs.closeSync(output);fs.closeSync(input);}
}
function stageFile(source,destination,expected){
  assertExpected(source,expected,false);assertLocalPath(destination);
  try{fs.linkSync(source,destination);}catch(e){if(!['EXDEV','ENOTSUP','EOPNOTSUPP','EPERM','ENOSYS','EINVAL'].includes(e.code))throw e;return copyExclusive(source,destination,expected);}
  // Keep the original signature even if an external write happens immediately after linking.
  return {...expected};
}
function executeRelocation(moves,{onPrepared=()=>{}}={}){
  validate(moves);const staged=[],restored=new Map();
  try{
    for(const move of directories(moves)){assertLocalPath(move.destination);fs.mkdirSync(move.destination);move.destinationFingerprint=directoryFingerprint(move.destination);staged.push(move);}
    for(const move of moves.filter(move=>!isFolder(move))){move.destinationFingerprint=stageFile(move.source,move.destination,move.expectedFingerprint);staged.push(move);assertExpected(move.destination,move.destinationFingerprint,false);}
    for(const move of moves)assertExpected(move.source,move.expectedFingerprint,isFolder(move));
    assertSourceTrees(moves);onPrepared(moves);
    for(const move of moves.filter(move=>!isFolder(move))){assertExpected(move.destination,move.destinationFingerprint,false);assertExpected(move.source,move.expectedFingerprint,false);fs.unlinkSync(move.source);}
    for(const move of directories(moves).reverse()){assertExpected(move.source,move.expectedFingerprint,true);fs.rmdirSync(move.source);}
    for(const move of moves)assertExpected(move.destination,move.destinationFingerprint,isFolder(move));
    return moves.length;
  }catch(e){
    const issues=[],recoveryMoves=[];
    for(const move of directories(staged))try{
      assertExpected(move.destination,move.destinationFingerprint,true);
      if(!exists(move.source)){assertLocalPath(move.source);fs.mkdirSync(move.source);const current=directoryFingerprint(move.source);restored.set(key(move.source),current);recoveryMoves.push({...move,destination:move.source,destinationFingerprint:current});}
      else assertExpected(move.source,move.expectedFingerprint,true);
    }catch(rollback){issues.push(move.source+'：'+rollback.message);}
    for(const move of [...staged].filter(move=>!isFolder(move)).reverse())try{
      assertExpected(move.destination,move.destinationFingerprint,false);
      if(!exists(move.source)){
        const current=stageFile(move.destination,move.source,move.destinationFingerprint);assertExpected(move.source,current,false);
        restored.set(key(move.source),current);recoveryMoves.push({...move,destination:move.source,destinationFingerprint:current});
      }
      assertExpected(move.source,restored.get(key(move.source))||move.expectedFingerprint,false);
      assertExpected(move.destination,move.destinationFingerprint,false);fs.unlinkSync(move.destination);
    }catch(rollback){issues.push(move.source+' → '+move.destination+'：'+rollback.message);}
    for(const move of directories(staged).reverse())try{
      assertExpected(move.source,restored.get(key(move.source))||move.expectedFingerprint,true);assertExpected(move.destination,move.destinationFingerprint,true);fs.rmdirSync(move.destination);
    }catch(rollback){issues.push(move.destination+'：'+rollback.message);}
    const failure=new Error('搬移失敗：'+e.message+(issues.length?'；需手動核對（保留可用資料）：'+issues.join('；'):'；已還原來源位置'));
    failure.recoveryMoves=recoveryMoves;throw failure;
  }
}
function prepareMoveUndo(history){
  if(!history||!Array.isArray(history.moves)||history.moves.some(move=>!move||typeof move.source!=='string'||typeof move.destination!=='string'))throw new Error('搬移復原紀錄不完整');
  if(![2,3].includes(history.version)||history.state!=='completed')throw new Error('搬移未完整完成，不能自動復原；請核對紀錄中的來源及目標');
  const moves=history.moves.map(move=>({source:move.destination,destination:move.source,kind:move.kind||'file',expectedFingerprint:history.version===3?move.destinationFingerprint:move.expectedFingerprint}));
  validate(moves);return moves;
}
module.exports={planMove,executeRelocation,prepareMoveUndo};
