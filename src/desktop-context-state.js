'use strict';
function normalize(value={}){
 const b=value?.bounds,valid=b&&['x','y','width','height'].every(key=>Number.isFinite(b[key])&&Math.abs(b[key])<=100000)&&b.width>=48&&b.height>=48;
 return {visible:value?.visible===true,pinned:value?.pinned===true,topmost:value?.topmost!==false,bounds:valid?{x:Math.round(b.x),y:Math.round(b.y),width:Math.max(320,Math.min(800,Math.round(b.width))),height:Math.max(300,Math.min(1000,Math.round(b.height)))}:null};
}
module.exports={normalize};
