'use strict';
const {execFile}=require('node:child_process');
const path=require('node:path');
const {MAX_SELECTION_LENGTH}=require('./snippet-selection-message');
const SELECTION_WORLD_ID=1001;

function readFocusedText(limit){
 if(!document.hasFocus())return '';
 let element=document.activeElement;
 while(element?.shadowRoot?.activeElement)element=element.shadowRoot.activeElement;
 if(element instanceof HTMLInputElement||element instanceof HTMLTextAreaElement){
  if(element.type==='password'||element.selectionStart==null||element.selectionEnd-element.selectionStart>limit)return '';
  return element.value.slice(element.selectionStart,element.selectionEnd);
 }
 const value=window.getSelection()?.toString()??'';
 return value.length<=limit?value:'';
}

async function readWindowSelection(window){
 let timer;
 try{
  // Read before the snippet editor can move focus away from the selection.
  const script=`(${readFocusedText.toString()})(${MAX_SELECTION_LENGTH})`;
  const value=await Promise.race([
   window.webContents.executeJavaScriptInIsolatedWorld(SELECTION_WORLD_ID,[{code:script}]),
   new Promise(resolve=>{timer=setTimeout(resolve,1000);})
  ]);
  return window.isDestroyed()||!window.isFocused()?'':value;
 }finally{clearTimeout(timer);}
}

function readWindowsSelection({packaged,resourcesPath}){
 if(process.platform!=='win32')return '';
 const directory=packaged?path.join(resourcesPath,'app.asar.unpacked','src'):__dirname;
 const executable=path.join(directory,'native','SnippetSelection.exe');
 return new Promise(resolve=>{
  execFile(executable,[String(MAX_SELECTION_LENGTH)],{windowsHide:true,timeout:1500,maxBuffer:MAX_SELECTION_LENGTH*4,encoding:'utf8'},
   (error,stdout)=>resolve(error?'':stdout));
 });
}

module.exports={readWindowSelection,readWindowsSelection};
