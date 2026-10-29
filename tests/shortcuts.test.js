'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalize,chord,DEFAULTS}=require('../src/shortcuts');
test('favorite defaults include cross-page select-all, search, open, move and record removal',()=>{assert.equal(DEFAULTS.selectAll,'Ctrl+A');assert.equal(DEFAULTS.open,'Enter');assert.equal(DEFAULTS.remove,'Delete');assert.equal(DEFAULTS.move,'Ctrl+M');assert.deepEqual(normalize(),DEFAULTS);});
test('custom shortcuts support remapping and disabling without duplicate dispatch',()=>{const result=normalize({selectAll:'Ctrl+Shift+A',remove:'',move:'Ctrl+A'});assert.equal(result.selectAll,'Ctrl+Shift+A');assert.equal(result.remove,'');assert.equal(result.move,'Ctrl+A');const duplicate=normalize({move:'Ctrl+A'});assert.equal(duplicate.move,'');assert.equal(normalize({open:'arbitrary'}).open,'Enter');});
test('keyboard chords normalize letters, modifiers and platform primary keys',()=>{assert.equal(chord({key:'a',ctrlKey:true}),'Ctrl+A');assert.equal(chord({key:'c',metaKey:true,shiftKey:true}),'Ctrl+Shift+C');assert.equal(chord({key:'F2'}),'F2');assert.equal(chord({key:'Control',ctrlKey:true}),'');});
