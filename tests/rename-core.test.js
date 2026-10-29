'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { renameOne, createPreview, executeMoves, filenameProblem, listPaths } = require('../src/rename-core');

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
