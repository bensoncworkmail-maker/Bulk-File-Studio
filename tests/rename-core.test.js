'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { renameOne, createPreview, executeMoves, filenameProblem, listPaths, snapshotMoves, prepareUndo } = require('../src/rename-core');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-rename-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const make = (name, content = name) => {
    const filepath = path.join(dir, name);
    fs.writeFileSync(filepath, content);
    return filepath;
  };
  return { dir, make };
}

test('literal search matches periods literally and preserves file extension', () => {
  assert.equal(renameOne('a.b.jpeg', {find:'.',replace:'_',replaceAll:true}), 'a_b.jpeg');
  assert.equal(renameOne('IMG_IMG_01.png', {find:'IMG_',replace:'',replaceAll:true}), '01.png');
  assert.equal(renameOne('IMG_IMG_01.png', {find:'IMG_',replace:'',replaceAll:false}), 'IMG_01.png');
  assert.equal(renameOne('.env', {prefix:'backup_'}), 'backup_.env');
});

test('regex supports groups and case options', () => {
  assert.equal(renameOne('photo-2026-08.jpg',{find:'(\\d{4})-(\\d{2})',replace:'$2_$1',regex:true}), 'photo-08_2026.jpg');
  assert.equal(renameOne('aAa.txt',{find:'a',replace:'x',matchCase:true}), 'xAx.txt');
  assert.equal(renameOne('aAa.txt',{find:'a',replace:'x',matchCase:false}), 'xxx.txt');
});

test('numbering, cleanup, casing, and extension flag', () => {
  assert.equal(renameOne('my File  .PDF',{trim:true,whitespace:'underscore',caseMode:'lower',numberEnabled:true,numberStart:8,numberWidth:3,numberSeparator:'-',numberPosition:'prefix'},2),'010-my_file.PDF');
  assert.equal(renameOne('p.JPEG',{caseMode:'lower',includeExtension:true}),'p.jpeg');
  assert.equal(renameOne('foo.pdf',{suffix:'_v2'}),'foo_v2.pdf');
  assert.equal(renameOne('some file.txt',{caseMode:'title'}),'Some File.txt');
});

test('rejects invalid Windows filename tokens', () => {
  for (const name of ['', '.', 'CON', 'lpt9.txt', 'a?.txt', 'x.', 'x ']) assert.ok(filenameProblem(name), name);
  assert.equal(filenameProblem('report-2026.csv'),null);
});

test('preview detects duplicate target names and invalid regex', t => {
  const { make } = fixture(t);
  const p = [make('a.txt'),make('b.txt')];
  const out = createPreview(p,{find:'[ab]',replace:'c',regex:true});
  assert.equal(out.counts.error,2);
  const regex = createPreview(p,{find:'(',regex:true});
  assert.equal(regex.counts.error,2);
});

test('preview detects occupied target and cascades through a chain', t => {
  const { make } = fixture(t);
  const p = [make('A.txt'),make('AA.txt'),make('AAA.txt')];
  make('AAAA.txt');
  const out = createPreview(p,{find:'A',replace:'AA',replaceAll:false});
  assert.equal(out.counts.error,3);
});

test('preview ignores unselected occupied destination', t => {
  const { make } = fixture(t);
  const a=make('a.txt');make('b.txt');
  assert.equal(createPreview([a],{find:'a',replace:'b'}).counts.error,1);
});

test('safe rename of name swaps, and reverse as undo', t => {
  const { dir, make } = fixture(t);
  const a=make('A.txt','content-A'),b=make('B.txt','content-B');
  const moves=[{source:a,destination:b},{source:b,destination:a}];
  assert.equal(executeMoves(moves),2);
  assert.equal(fs.readFileSync(a,'utf8'),'content-B');
  assert.equal(fs.readFileSync(b,'utf8'),'content-A');
  assert.equal(executeMoves(moves.map(x=>({source:x.destination,destination:x.source}))),2);
  assert.equal(fs.readFileSync(a,'utf8'),'content-A');
  assert.deepEqual(fs.readdirSync(dir).sort(),['A.txt','B.txt']);
});

test('safe rename disallows overwriting an existing file', t => {
  const {make}=fixture(t);
  const a=make('source.txt','original'),b=make('target.txt','keep');
  assert.throws(()=>executeMoves([{source:a,destination:b}]),/已存在/);
  assert.equal(fs.readFileSync(a,'utf8'),'original');
  assert.equal(fs.readFileSync(b,'utf8'),'keep');
});

test('rolls back stage renames after a later unexpected error', t => {
  const {dir,make}=fixture(t);
  const a=make('one.txt','one'),b=make('two.txt','two');
  const moves=[{source:a,destination:path.join(dir,'first.txt')},{source:b,destination:path.join(dir,'second.txt')}];
  const original=fs.renameSync;
  let calls=0;
  fs.renameSync=(...args)=>{calls++;if(calls===3)throw new Error('injected failure');return original(...args);};
  try { assert.throws(()=>executeMoves(moves),/injected failure/); }
  finally { fs.renameSync=original; }
  assert.equal(fs.readFileSync(a,'utf8'),'one');
  assert.equal(fs.readFileSync(b,'utf8'),'two');
  assert.deepEqual(fs.readdirSync(dir).sort(),['one.txt','two.txt']);
});

test('scans folders recursively if requested, without following symlinks', t => {
  const {dir,make}=fixture(t);
  make('one.txt');
  fs.mkdirSync(path.join(dir,'nested'));
  fs.writeFileSync(path.join(dir,'nested','two.txt'),'two');
  assert.equal(listPaths([dir],false).paths.length,1);
  assert.equal(listPaths([dir],true).paths.length,2);
});

function renamedFixture(t) {
  const { dir, make } = fixture(t);
  const a = make('original-a.txt', 'AAAA'), b = make('original-b.txt', 'BBBB');
  // Exactly representable seconds let a test preserve mtime after an edit.
  for (const p of [a, b]) fs.utimesSync(p, 1700000000, 1700000000);
  const moves = snapshotMoves([
    { source: a, destination: path.join(dir, 'renamed-a.txt') },
    { source: b, destination: path.join(dir, 'renamed-b.txt') }
  ]);
  executeMoves(moves);
  return { dir, a, b, moves, history: JSON.parse(JSON.stringify({ version: 2, state: 'completed', moves })) };
}

test('verified undo works after history is serialized and reloaded', t => {
  const { a, b, history } = renamedFixture(t);
  assert.equal(executeMoves(prepareUndo(history)), 2);
  assert.equal(fs.readFileSync(a, 'utf8'), 'AAAA');
  assert.equal(fs.readFileSync(b, 'utf8'), 'BBBB');
});

test('same-size modification with restored mtime blocks the whole undo batch', t => {
  const { a, b, moves, history } = renamedFixture(t);
  fs.writeFileSync(moves[1].destination, 'CCCC');
  fs.utimesSync(moves[1].destination, 1700000000, 1700000000);
  assert.throws(() => executeMoves(prepareUndo(history)), /修改或替換/);
  assert.equal(fs.existsSync(a), false);
  assert.equal(fs.existsSync(b), false);
  assert.equal(fs.readFileSync(moves[0].destination, 'utf8'), 'AAAA');
  assert.equal(fs.readFileSync(moves[1].destination, 'utf8'), 'CCCC');
  // Repairing the contents and metadata permits a retry using the same record.
  fs.writeFileSync(moves[1].destination, 'BBBB');
  fs.utimesSync(moves[1].destination, 1700000000, 1700000000);
  assert.equal(executeMoves(prepareUndo(history)), 2);
});

test('a different file with identical contents and mtime cannot be undone', t => {
  const { dir, moves, history } = renamedFixture(t);
  const p = moves[1].destination;
  fs.renameSync(p, path.join(dir, 'kept-original.txt'));
  fs.writeFileSync(p, 'BBBB');
  fs.utimesSync(p, 1700000000, 1700000000);
  assert.throws(() => prepareUndo(history), /修改或替換/);
  assert.equal(fs.readFileSync(p, 'utf8'), 'BBBB');
  assert.equal(fs.existsSync(moves[0].source), false);
});

test('missing files and occupied original names leave every file unchanged', t => {
  const { a, moves, history } = renamedFixture(t);
  fs.writeFileSync(a, 'KEEP');
  assert.throws(() => prepareUndo(history), /已存在/);
  assert.equal(fs.readFileSync(a, 'utf8'), 'KEEP');
  fs.unlinkSync(a);
  fs.unlinkSync(moves[1].destination);
  assert.throws(() => prepareUndo(history), /移動或刪除/);
  assert.equal(fs.existsSync(a), false);
  assert.equal(fs.readFileSync(moves[0].destination, 'utf8'), 'AAAA');
});

test('legacy, incomplete, interrupted and malformed records fail closed', t => {
  const { history } = renamedFixture(t);
  assert.throws(() => prepareUndo({ moves: history.moves }), /舊版/);
  for (const state of ['pending', 'undoing']) assert.throws(() => prepareUndo({ ...history, state }), /未完整完成/);
  const malformed = JSON.parse(JSON.stringify(history));
  delete malformed.moves[0].expectedFingerprint;
  assert.throws(() => prepareUndo(malformed), /紀錄不完整/);
});

test('verified undo also supports swapped filenames', t => {
  const { make } = fixture(t);
  const a = make('a.txt', 'A'), b = make('b.txt', 'B');
  const moves = snapshotMoves([{ source:a, destination:b }, { source:b, destination:a }]);
  executeMoves(moves);
  executeMoves(prepareUndo({ version:2, state:'completed', moves }));
  assert.equal(fs.readFileSync(a, 'utf8'), 'A');
  assert.equal(fs.readFileSync(b, 'utf8'), 'B');
});

test('a source changed after undo preparation is checked again before execution', t => {
  const { moves, history, a } = renamedFixture(t);
  const reversed = prepareUndo(history);
  fs.writeFileSync(moves[1].destination, 'changed after check');
  assert.throws(() => executeMoves(reversed), /修改或替換/);
  assert.equal(fs.existsSync(a), false);
});

test('replacing an undo source with a symlink never renames its target', t => {
  const { dir, moves, history } = renamedFixture(t);
  const p = moves[1].destination;
  const kept = path.join(dir, 'kept-original.txt');
  fs.renameSync(p, kept);
  try { fs.symlinkSync(kept, p); }
  catch (e) { if (e.code === 'EPERM') { t.skip('Symlink permission unavailable'); return; } throw e; }
  assert.throws(() => prepareUndo(history), /符號連結/);
  assert.equal(fs.readFileSync(kept, 'utf8'), 'BBBB');
  assert.equal(fs.existsSync(moves[0].source), false);
});

test('a failed rollback reports the remaining temporary path for manual recovery', t => {
  const { dir, make } = fixture(t);
  const a=make('a.txt','A'), b=make('b.txt','B');
  const moves=snapshotMoves([{source:a,destination:path.join(dir,'x.txt')},{source:b,destination:path.join(dir,'y.txt')}]);
  const original=fs.renameSync;
  let calls=0, failure;
  fs.renameSync=(...args)=>{ calls++; if(calls===3||calls===4)throw new Error('injected failure');return original(...args); };
  try { executeMoves(moves); }
  catch(e) { failure=e; }
  finally { fs.renameSync=original; }
  assert.match(failure.message,/部分檔案無法自動復原/);
  const temp=fs.readdirSync(dir).find(name=>name.startsWith('.brs-'));
  assert.ok(temp);
  assert.ok(failure.message.includes(path.join(dir,temp)));
  assert.ok(failure.message.includes(b));
  assert.equal(fs.readFileSync(a,'utf8'),'A');
  assert.equal(fs.readFileSync(path.join(dir,temp),'utf8'),'B');
});

test('fast rename and serialized undo do not read file contents, while detecting metadata edits and keeping full mode strict',t=>{
 const {dir,make}=fixture(t),source=make('large.bin','A'.repeat(2*1024*1024)),destination=path.join(dir,'renamed.bin');let bytes=0;const original=fs.readSync;fs.readSync=(...args)=>{const n=original(...args);bytes+=n;return n;};
 try{const moves=snapshotMoves([{source,destination}],{verification:'fast'});assert.equal(moves[0].expectedFingerprint.verification,'fast');assert.equal(moves[0].expectedFingerprint.sha256,undefined);executeMoves(moves);const history=JSON.parse(JSON.stringify({version:4,kind:'rename',verification:'fast',state:'completed',moves}));executeMoves(prepareUndo(history));assert.equal(bytes,0);const full=snapshotMoves([{source,destination}]);executeMoves(full);assert.equal(bytes,4*1024*1024);fs.appendFileSync(destination,'changed');assert.throws(()=>prepareUndo(history),/修改或替換/);assert.throws(()=>prepareUndo({...history,version:2}),/紀錄不完整/);assert.throws(()=>prepareUndo({...history,verification:'full'}),/舊版/);}finally{fs.readSync=original;}
});
test('fast mode retains swap support, complete-batch conflict checks and rollback without inspecting contents',t=>{
 const {dir,make}=fixture(t),a=make('a.txt','A'),b=make('b.txt','B');let moves=snapshotMoves([{source:a,destination:b},{source:b,destination:a}],{verification:'fast'});executeMoves(moves);assert.equal(fs.readFileSync(a,'utf8'),'B');executeMoves(prepareUndo({version:4,kind:'rename',verification:'fast',state:'completed',moves}));assert.equal(fs.readFileSync(a,'utf8'),'A');moves=snapshotMoves([{source:a,destination:path.join(dir,'x.txt')},{source:b,destination:path.join(dir,'y.txt')}],{verification:'fast'});const rename=fs.renameSync;let calls=0;fs.renameSync=(...args)=>{if(++calls===3)throw new Error('injected');return rename(...args);};try{assert.throws(()=>executeMoves(moves),/injected/);}finally{fs.renameSync=rename;}assert.equal(fs.readFileSync(a,'utf8'),'A');assert.equal(fs.readFileSync(b,'utf8'),'B');const occupied=make('x.txt');assert.throws(()=>executeMoves(moves),/已存在/);assert.equal(fs.existsSync(occupied),true);
});
