'use strict';
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
function versionMatches(installed,range){
 const found=/^(\d+)\.(\d+)\.(\d+)$/.exec(installed||''),wanted=/^([~^]?)(\d+)\.(\d+)\.(\d+)$/.exec(range||'');if(!found||!wanted)return false;
 const current=found.slice(1).map(Number),base=wanted.slice(2).map(Number),order=current[0]-base[0]||current[1]-base[1]||current[2]-base[2];
 if(!wanted[1])return order===0;if(order<0)return false;if(wanted[1]==='~')return current[0]===base[0]&&current[1]===base[1];return base[0]?current[0]===base[0]:base[1]?current[0]===0&&current[1]===base[1]:order===0;
}
function checkDependencies(root){
 const filename=path.join(root,'package.json'),manifest=JSON.parse(fs.readFileSync(filename,'utf8')),localRequire=createRequire(filename),issues=[];
 for(const [name,range] of Object.entries({...manifest.dependencies,...manifest.devDependencies})){
  try{
   const metadata=path.join(root,'node_modules',...name.split('/'),'package.json');if(!fs.existsSync(metadata))throw new Error('not installed in this project');const installed=JSON.parse(fs.readFileSync(metadata,'utf8')).version;
   if(!versionMatches(installed,range))throw new Error('installed '+installed+', expected '+range);
   const entry=localRequire.resolve(name);if(!fs.statSync(entry).isFile())throw new Error('entry file is missing');
   if(name!=='electron')localRequire(name);
   if(name==='electron'){const executable=localRequire(name);if(typeof executable!=='string'||!fs.existsSync(executable)||!fs.statSync(executable).isFile())throw new Error('Electron executable is missing; reinstall with npm scripts enabled');}
  }catch(error){issues.push(name+': '+String(error.message||error).split('\n')[0]);}
 }
 return issues;
}
if(require.main===module){
 try{const issues=checkDependencies(path.resolve(__dirname,'..'));if(issues.length){process.stderr.write('Build/start dependencies are missing, outdated or incomplete:\n'+issues.map(issue=>'  - '+issue).join('\n')+'\nRun: npm install --include=prod --include=dev\n');process.exitCode=1;}else process.stdout.write('Production and build dependencies are ready.\n');}
 catch(error){process.stderr.write('Cannot verify dependencies: '+error.message+'\n');process.exitCode=1;}
}
module.exports={checkDependencies,versionMatches};
