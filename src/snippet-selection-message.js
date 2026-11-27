'use strict';
const FLAG='--snippet-selection';
const MAX_BYTES=128*1024;

function selectionText(value){
 return typeof value==='string'&&value.length<=20000&&value.trim()&&!value.includes('\0')?value:null;
}

function encodeMessage(value){
 const payload=Buffer.from(JSON.stringify(value),'utf8');
 if(payload.length>MAX_BYTES)throw Error('文字內容超過上限');
 const header=Buffer.alloc(4);
 header.writeUInt32LE(payload.length);
 return Buffer.concat([header,payload]);
}

async function readMessage(stream){
 const buffer=Buffer.alloc(MAX_BYTES+4);
 let used=0,end;
 const timeout=setTimeout(()=>stream.destroy(),5000);
 timeout.unref();
 try{
  for await(const chunk of stream){
   const length=Math.min(chunk.length,buffer.length-used);
   chunk.copy(buffer,used,0,length);
   used+=length;
   if(end===undefined&&used>=4){
    const size=buffer.readUInt32LE(0);
    if(!size||size>MAX_BYTES)break;
    end=4+size;
   }
   if(end!==undefined&&used>=end)return JSON.parse(buffer.toString('utf8',4,end));
  }
  throw Error('選取文字傳送未完成');
 }finally{clearTimeout(timeout);}
}

function selectionFromMessage(value){return value?.action==='capture-snippet'?selectionText(value.text):null;}
module.exports={FLAG,selectionText,selectionFromMessage,encodeMessage,readMessage};
