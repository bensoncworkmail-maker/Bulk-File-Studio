'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {selectionText}=require('./snippet-selection-message');
const filename=path.join(__dirname,'snippet-capture.html');
const url=pathToFileURL(filename).href;

class SnippetCapture{
 constructor(options){Object.assign(this,options);this.editors=new Map();}
 open(value,onShown){
  const body=selectionText(value);
  if(!body)throw Error('選取文字為空白或超過 20,000 字元');
  this.openEditor(body,{onShown,foreground:Boolean(onShown)});
 }
 openBlank(){
  const editor=this.blankEditor;
  if(editor&&!editor.window.isDestroyed()){
   if(editor.ready){
    if(editor.window.isMinimized())editor.window.restore();
    editor.window.show();
    editor.window.focus();
   }
   return;
  }
  this.openEditor('',{foreground:true,blank:true});
 }
 openEditor(body,{onShown,foreground,blank}){
  const window=new this.BrowserWindow({
   title:'新增常用文字片段',width:560,height:460,minWidth:340,minHeight:370,
   show:false,alwaysOnTop:foreground,autoHideMenuBar:true,backgroundColor:'#f3f5fb',
   webPreferences:{preload:path.join(__dirname,'snippet-capture-preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}
  });
  this.secureWindow(window);
  const editor={window,body,ready:false};
  const contents=window.webContents;
  this.editors.set(contents,editor);
  if(blank)this.blankEditor=editor;
  window.on('closed',()=>{
   this.editors.delete(contents);
   if(this.blankEditor===editor)this.blankEditor=null;
  });
  if(foreground)window.once('blur',()=>{if(!window.isDestroyed())window.setAlwaysOnTop(false);});
  window.once('ready-to-show',()=>{
   if(window.isDestroyed())return;
   editor.ready=true;
   window.show();window.focus();
   if(window.isVisible())onShown?.();
  });
  Promise.resolve(window.loadFile(filename)).catch(error=>{
   if(!window.isDestroyed())window.destroy();
   this.onError?.(error);
  });
 }
 owner(event){
  const editor=this.editors.get(event?.sender);
  if(!editor||editor.window.isDestroyed()||event?.senderFrame?.url!==url)throw Error('不受信任的常用文字來源');
  return editor;
 }
 data(event){return {body:this.owner(event).body,categories:this.categories(),theme:this.theme()};}
 commit(event,input){
  const editor=this.owner(event);
  this.save({name:input?.name,category:input?.category,body:input?.body});
  editor.window.destroy();
  return {saved:true};
 }
 close(event){this.owner(event).window.close();}
}

function snippetContextMenu(params,open){
 const value=params.formControlType==='input-password'?null:selectionText(params.selectionText);
 if(!value)return [];
 const items=[];
 if(params.isEditable&&params.editFlags?.canCut)items.push({role:'cut'});
 items.push({role:'copy'});
 if(params.isEditable&&params.editFlags?.canPaste)items.push({role:'paste'});
 items.push({type:'separator'},{label:'加入常用文字片段…',click:()=>open(value)});
 return items;
}
module.exports={SnippetCapture,snippetContextMenu};
