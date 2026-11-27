'use strict';
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

const executable=path.resolve(__dirname,'../src/native/SnippetSelection.exe');

function compile(){
 const dotNet=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET');
 const framework=['Framework64','Framework'].map(name=>path.join(dotNet,name,'v4.0.30319'))
  .find(directory=>fs.existsSync(path.join(directory,'csc.exe')));
 if(!framework)throw Error('Windows .NET Framework 4.x is required to build the snippet selection helper.');
 const references=['UIAutomationClient','UIAutomationTypes','WindowsBase'].map(name=>{
  const filename=name+'.dll';
  const gac=path.join(dotNet,'assembly','GAC_MSIL',name);
  const versions=fs.existsSync(gac)?fs.readdirSync(gac).filter(version=>version.startsWith('v4.0_')):[];
  const reference=[framework,path.join(framework,'WPF'),...versions.map(version=>path.join(gac,version))]
   .map(directory=>path.join(directory,filename)).find(filepath=>fs.existsSync(filepath));
  if(!reference)throw Error('Windows .NET Framework assembly is missing: '+filename);
  return '/reference:'+reference;
 });
 fs.mkdirSync(path.dirname(executable),{recursive:true});
 execFileSync(path.join(framework,'csc.exe'),['/nologo','/target:exe','/platform:anycpu','/optimize+',
  '/out:'+executable,...references,path.join(__dirname,'windows','SnippetSelection.cs')],{stdio:'inherit',windowsHide:true});
}

module.exports=function beforePack({electronPlatformName}){
 if(electronPlatformName!=='win32')return;
 if(process.platform==='win32')compile();
 else if(!fs.existsSync(executable))console.warn('Build on Windows to include selection capture in external Windows apps.');
};

if(require.main===module&&process.platform==='win32')compile();
