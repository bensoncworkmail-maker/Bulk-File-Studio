'use strict';
function normalize(value={}){
 const b=value?.bounds,valid=b&&['x','y','width','height'].every(key=>Number.isFinite(b[key])&&Math.abs(b[key])<=100000)&&b.width>=24&&b.height>=24;
 return {visible:value?.visible===true,pinned:value?.pinned===true,iconMode:value?.iconMode===true,topmost:value?.topmost!==false,iconSize:Number.isInteger(value?.iconSize)&&value.iconSize>=24&&value.iconSize<=64?value.iconSize:32,bounds:valid?{x:Math.round(b.x),y:Math.round(b.y),width:Math.max(320,Math.min(1600,Math.round(b.width))),height:Math.max(300,Math.min(1000,Math.round(b.height)))}:null};
}
module.exports={normalize};
