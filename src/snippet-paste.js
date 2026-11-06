'use strict';
const path=require('node:path');
// Script is fixed source; snippet text is carried only by Electron's clipboard.
const SCRIPT=`Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;using System.Threading;
public class BFSPaste {
[StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
[StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public MOUSEINPUT mi; }
[StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort vk,scan;public uint flags,time;public UIntPtr extra; }
[StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {public int x,y;public uint data,flags,time;public UIntPtr extra;}
[DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
[DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
[DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
[DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] input,int size);
public static void Warm(){Marshal.SizeOf(typeof(INPUT));GetForegroundWindow();GetAsyncKeyState(0);foreach(var method in typeof(BFSPaste).GetMethods(System.Reflection.BindingFlags.Public|System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Static)){if(method.Name!="Warm"&&method.GetMethodBody()!=null)System.Runtime.CompilerServices.RuntimeHelpers.PrepareMethod(method.MethodHandle);}}
public static string CaptureReleased(uint appPid){var target=GetForegroundWindow();var result=Capture(appPid);if(GetForegroundWindow()!=target)throw new Exception("目標視窗已切換");for(int i=0;i<100;i++){if(GetForegroundWindow()!=target)throw new Exception("目標視窗已切換");bool held=false;foreach(int key in new int[]{16,17,18,91,92})if((GetAsyncKeyState(key)&0x8000)!=0)held=true;if(!held)return result;Thread.Sleep(20);}throw new Exception("快捷鍵尚未放開");}
public static string Capture(uint appPid){var h=GetForegroundWindow();uint pid;GetWindowThreadProcessId(h,out pid);if(h==IntPtr.Zero||pid==appPid)throw new Exception("請先將游標放到目標程式，再按快捷鍵");return h.ToInt64().ToString()+":"+pid.ToString();}
public static void Paste(uint appPid,long handle=0,uint targetPid=0){var target=GetForegroundWindow();uint pid;
if(handle!=0){var requested=new IntPtr(handle);uint currentPid,actualPid;GetWindowThreadProcessId(target,out currentPid);GetWindowThreadProcessId(requested,out actualPid);if(!IsWindow(requested)||actualPid!=targetPid||actualPid==appPid)throw new Exception("原目標視窗已關閉或改變");if(target!=requested&&currentPid!=appPid)throw new Exception("已切換到其他程式，取消貼上");if(target!=requested){SetForegroundWindow(requested);for(int n=0;n<20&&GetForegroundWindow()!=requested;n++)Thread.Sleep(25);if(GetForegroundWindow()!=requested)throw new Exception("無法回到原目標，請手動貼上");}target=requested;}
GetWindowThreadProcessId(target,out pid);if(target==IntPtr.Zero||pid==appPid)throw new Exception("請在目標程式的文字欄位按貼上快捷鍵");
for(int i=0;i<100;i++){if(GetForegroundWindow()!=target)throw new Exception("目標視窗已切換，已取消貼上");bool held=false;foreach(int key in new int[]{16,17,18,91,92})if((GetAsyncKeyState(key)&0x8000)!=0)held=true;if(!held){Thread.Sleep(40);if(GetForegroundWindow()!=target)throw new Exception("目標視窗已切換");var keys=new INPUT[4];for(int j=0;j<4;j++){keys[j].type=1;keys[j].u.ki.vk=(ushort)(j==0||j==3?17:86);keys[j].u.ki.flags=(uint)(j>=2?2:0);}if(SendInput(4,keys,Marshal.SizeOf(typeof(INPUT)))!=4){SendInput(2,new INPUT[]{keys[2],keys[3]},Marshal.SizeOf(typeof(INPUT)));throw new Exception("系統拒絕貼上，請手動按 Ctrl+V");}return;}Thread.Sleep(20);}throw new Exception("快捷鍵尚未放開，已取消貼上");}
}
'@
try { [BFSPaste]::Paste(APP_PID); exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
function paste({platform=process.platform,pid=process.pid,run,target}={}){if(platform!=='win32')return Promise.reject(new Error('立即貼上目前僅支援 Windows；文字已複製，可手動貼上'));if(target&&(!/^\d{1,18}$/.test(target.handle)||!Number.isSafeInteger(target.pid)||target.pid<=0||!Number.isFinite(target.at)||Date.now()-target.at>60000||target.at>Date.now()+1000))return Promise.reject(new Error('貼上目標已過期或無效，文字已複製'));if(!run){const helper=target?resident:worker();if(!helper)return Promise.reject(new Error('貼上程序已停止，文字已複製；請重新開啟選單或手動貼上'));return helper.request({op:'paste',appPid:pid,handle:target?.handle||'0',targetPid:target?.pid||0},{readyOnly:Boolean(target),epoch:target?.workerEpoch}).then(()=>({pasted:true}));}const script=SCRIPT.replace('APP_PID',target?String(pid)+','+target.handle+','+target.pid:String(pid));return new Promise((resolve,reject)=>run(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,maxBuffer:16384},(error,stdout,stderr)=>error?reject(new Error((stderr||'系統未能貼上，文字已複製，請手動按 Ctrl+V').slice(0,500))):resolve({pasted:true})));}
async function capture({platform=process.platform,pid=process.pid,run}={}){
 if(platform!=='win32')return null;
 if(!run){try{const helper=worker(),value=await helper.request({op:'capture',appPid:pid}),parts=String(value).match(/^(\d{1,18}):(\d+)$/);return parts?{handle:parts[1],pid:Number(parts[2]),at:Date.now(),released:true,workerEpoch:helper.epoch}:null;}catch{return null;}}
 const script=SCRIPT.slice(0,SCRIPT.indexOf('try {'))+'try { [Console]::WriteLine([BFSPaste]::Capture('+pid+')); exit 0 } catch { exit 1 }';
 return new Promise(resolve=>run(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,maxBuffer:16384},(error,stdout)=>{const parts=String(stdout||'').trim().match(/^(\d{1,18}):(\d+)$/);resolve(!error&&parts?{handle:parts[1],pid:Number(parts[2]),at:Date.now()}:null);}));
}
let resident;
function worker(){return resident??=new(require('./snippet-paste-worker').PasteWorker)("$ErrorActionPreference='Stop'\n"+SCRIPT.slice(0,SCRIPT.indexOf('try {'))+`
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[BFSPaste]::Warm()
[Console]::WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::ReadLine())) {
 try {
  $request = $line | ConvertFrom-Json
  if ($request.op -eq 'capture') { $value = [BFSPaste]::CaptureReleased([uint32]$request.appPid) }
  elseif ($request.op -eq 'paste') { [BFSPaste]::Paste([uint32]$request.appPid,[long]$request.handle,[uint32]$request.targetPid); $value = $true }
  else { throw 'Unsupported operation' }
  [Console]::WriteLine((@{id=$request.id;ok=$true;value=$value} | ConvertTo-Json -Compress))
 } catch { [Console]::WriteLine((@{id=$request.id;ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress)) }
}
`);}
function warm(){if(process.platform!=='win32')return Promise.resolve();return worker().start().catch(()=>{});}
function close(){resident?.stop();resident=null;}
module.exports={paste,capture,warm,close};
