'use strict';
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {encodeMessage,readMessage,selectionFromMessage}=require('./snippet-selection-message');
const inbox=require('./snippet-selection-inbox');

async function deliverToApp(input,{executable=process.execPath,folder=__dirname,launch=spawn,timeout=12000}={}){
 let text;
 try{text=selectionFromMessage(await readMessage(input));}
 catch{return {ok:false,reason:'invalid-selection'};}
 if(!text)return {ok:false,reason:'invalid-selection'};
 let id;
 try{id=inbox.stageSelection(folder,text);}
 catch{return {ok:false,reason:'transfer-failed'};}
 try{
  const env={...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  const child=launch(executable,[inbox.INBOX_FLAG,id],{env,detached:true,stdio:'ignore',windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  child.unref();
  const expires=Date.now()+timeout;
  while(!inbox.isShown(folder,id)){
   if(Date.now()>=expires)return {ok:false,reason:'window-not-opened'};
   await delay(80);
  }
  return {ok:true};
 }catch{return {ok:false,reason:'launch-failed'};}
 finally{
  try{inbox.discard(folder,id);}catch{/* The next request clears expired private handoff files. */}
 }
}

if(require.main===module)deliverToApp(process.stdin)
 .then(response=>process.stdout.write(encodeMessage(response)));

module.exports={deliverToApp};
