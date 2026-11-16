'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('all pages, quick actions, feature destinations, settings categories and source assets stay consistent',()=>{
 const result=require('../build/check-app-contracts').inspect();assert.deepEqual(result.errors,[]);assert.equal(result.pages,10);assert.equal(result.tools,6);assert.ok(result.files.length>180);assert.ok(result.features>=24);assert.ok(result.settings>250);
});
