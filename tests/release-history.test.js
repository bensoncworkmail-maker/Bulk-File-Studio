'use strict';

const test=require('node:test');
const {execFileSync}=require('node:child_process');

test('the checked-in changelog matches the complete app history and package version',()=>{
 execFileSync(process.execPath,[require.resolve('../build/update-changelog.js'),'--check']);
});
