'use strict';
// DIP geometry shared by BrowserWindow and the renderer. Every surface fits its
// border-box; the transparent gap is outside both launcher and Quick Panel.
(()=>{
 const METRICS=Object.freeze({button:42,gap:8,padding:8,border:1,inset:4,separation:12,orb:58,count:8});
 const rail=METRICS.button*METRICS.count+METRICS.gap*(METRICS.count-1)+2*(METRICS.padding+METRICS.border),thickness=60;
 const modern=mode=>['bar','dock','bubble'].includes(mode);
 const horizontal=(mode,edge)=>mode==='dock'&&['top','bottom'].includes(edge);
 function capsule(mode,edge){if(!modern(mode))return null;return mode==='bubble'?{width:64,height:64}:horizontal(mode,edge)?{width:rail+8,height:68}:{width:68,height:rail+8};}
 function minimum(mode,edge){if(!modern(mode))return null;return horizontal(mode,edge)?{width:Math.max(380,rail)+8,height:360+12+60+8}:{width:380+12+(mode==='bubble'?58:60)+8,height:Math.max(360,mode==='bubble'?58:rail)+8};}
 function defaults(mode,edge){if(!modern(mode))return null;return horizontal(mode,edge)?{width:Math.max(420,rail)+8,height:520+12+60+8}:{width:420+12+(mode==='bubble'?58:60)+8,height:528};}
 function surfaces(mode,edge,collapsed,width,height){
  const i=METRICS.inset,w=Math.max(0,width-2*i),h=Math.max(0,height-2*i),orb=mode==='bubble',t=orb?58:thickness;
  if(collapsed)return {panel:null,launcher:{x:orb?3:i,y:orb?3:i,width:orb?58:w,height:orb?58:h}};
  if(horizontal(mode,edge)){const top=edge==='top',lh=60,ph=Math.max(0,h-lh-METRICS.separation);return {panel:{x:i,y:i+(top?lh+12:0),width:w,height:ph},launcher:{x:i+Math.max(0,(w-rail)/2),y:i+(top?0:ph+12),width:Math.min(w,rail),height:lh}};}
  const left=mode==='dock'&&edge==='left',pw=Math.max(0,w-t-12);return {panel:{x:i+(left?t+12:0),y:i,width:pw,height:h},launcher:{x:i+(left?0:pw+12),y:i+Math.min(30,Math.max(0,h-(orb?58:rail))),width:t,height:Math.min(h,orb?58:rail)}};
 }
 // On unusually small work areas, reserve B and More. All overflow actions
 // remain available in a real expanded menu instead of clipping/scrolling rail.
 function visibleSlots(length){return Math.max(2,Math.min(METRICS.count,Math.floor((length-18+8)/50)));}
 const api=Object.freeze({METRICS,rail,modern,horizontal,capsule,minimum,defaults,surfaces,visibleSlots});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.floatingLayout=api;
})();
