'use strict';
class PasteTargetSession{
 constructor({capture,onError=()=>{},now=Date.now}){Object.assign(this,{capture,onError,now});this.sequence=0;this.value=null;}
 async observe(){if(this.closed)return;const sequence=++this.sequence;this.value=null;try{const value=await this.capture();if(sequence===this.sequence&&value&&this.now()-value.at<=60000)this.value=value;}catch(error){this.onError(error);}}
 get(){return this.value&&this.now()-this.value.at<=60000?{...this.value}:null;}
 close(){this.closed=true;this.sequence++;this.value=null;}
}
module.exports={PasteTargetSession};
