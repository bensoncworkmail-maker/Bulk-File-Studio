'use strict';

async function openFileInput(dialog,parent,options,dropped){
 if(dropped!==undefined){
  if(typeof dropped!=='string'||!dropped)throw new Error('請拖放有效的檔案或資料夾位置');
  return dropped;
 }
 const result=await dialog.showOpenDialog(parent,options);
 return result.canceled?null:result.filePaths[0];
}

module.exports={openFileInput};
