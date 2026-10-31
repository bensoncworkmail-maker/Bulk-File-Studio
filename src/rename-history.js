'use strict';
const fs=require('node:fs'),path=require('node:path');
function writeHistory(filename,history,filesystem=fs){
 filesystem.mkdirSync(path.dirname(filename),{recursive:true});
 if(!history){try{filesystem.unlinkSync(filename);}catch(error){if(error.code!=='ENOENT')throw error;}return;}
 const temp=filename+'.new';filesystem.writeFileSync(temp,JSON.stringify(history,null,2),{encoding:'utf8',mode:0o600});filesystem.renameSync(temp,filename);
}
module.exports={writeHistory};
