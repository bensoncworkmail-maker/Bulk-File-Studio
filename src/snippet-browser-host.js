'use strict';
const {spawn}=require('node:child_process');
const {finished}=require('node:stream/promises');
const {FLAG,encodeMessage,readMessage,selectionFromMessage}=require('./snippet-selection-message');

async function deliverToApp(input,execPath=process.execPath){
 const text=selectionFromMessage(await readMessage(input));
 if(!text)throw Error('選取文字為空白或超過 20,000 字元');
 const env={...process.env};
 delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(execPath,[FLAG],{env,detached:true,stdio:['pipe','ignore','ignore'],windowsHide:true});
 const spawned=new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
 const written=finished(child.stdin,{readable:false,cleanup:true});
 child.stdin.end(encodeMessage({action:'capture-snippet',text}));
 try{await Promise.all([spawned,written]);}
 finally{child.unref();}
}

if(require.main===module)deliverToApp(process.stdin)
 .then(()=>({ok:true}),()=>({ok:false}))
 .then(response=>process.stdout.write(encodeMessage(response)));

module.exports={deliverToApp};
