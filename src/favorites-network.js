'use strict';
const {withIntranetPaths}=require('./intranet-path'),{assertSafeOpen}=require('./offline-policy');
async function openFavorite({favorites,id,action='open',shell}){
 if(!['open','show'].includes(action))throw new Error('收藏操作無效');
 const source=favorites.get(id);
 return withIntranetPaths([source.path],async()=>{
  const item=favorites.get(id,true);
  if(action==='show'){shell.showItemInFolder(item.path);return;}
  // Keep existing local checks; UNC references are checked in the selected host scope.
  if(require('./intranet-path').isUNC(item.path))await require('./notes-location-links').safeLocationOpen(item.path);else assertSafeOpen(item.path);
  const error=await shell.openPath(item.path);if(error)throw new Error(error);
 });
}
module.exports={openFavorite};
