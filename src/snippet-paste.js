'use strict';
const {execFile}=require('node:child_process'),path=require('node:path');
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
[DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
[DllImport("user32.dll")] static extern uint SendInput(uint count,INPUT[] input,int size);
public static void Paste(uint appPid){var target=GetForegroundWindow();uint pid;GetWindowThreadProcessId(target,out pid);if(target==IntPtr.Zero||pid==appPid)throw new Exception("請在目標程式的文字欄位按貼上快捷鍵");
for(int i=0;i<100;i++){if(GetForegroundWindow()!=target)throw new Exception("目標視窗已切換，已取消貼上");bool held=false;foreach(int key in new int[]{16,17,18,91,92})if((GetAsyncKeyState(key)&0x8000)!=0)held=true;if(!held){Thread.Sleep(40);if(GetForegroundWindow()!=target)throw new Exception("目標視窗已切換");var keys=new INPUT[4];for(int j=0;j<4;j++){keys[j].type=1;keys[j].u.ki.vk=(ushort)(j==0||j==3?17:86);keys[j].u.ki.flags=(uint)(j>=2?2:0);}if(SendInput(4,keys,Marshal.SizeOf(typeof(INPUT)))!=4){SendInput(2,new INPUT[]{keys[2],keys[3]},Marshal.SizeOf(typeof(INPUT)));throw new Exception("系統拒絕貼上，請手動按 Ctrl+V");}return;}Thread.Sleep(20);}throw new Exception("快捷鍵尚未放開，已取消貼上");}
}
'@
try { [BFSPaste]::Paste(APP_PID); exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
function paste({platform=process.platform,pid=process.pid,run=execFile}={}){if(platform!=='win32')return Promise.reject(new Error('立即貼上目前僅支援 Windows；文字已複製，可手動貼上'));const script=SCRIPT.replace('APP_PID',String(pid));return new Promise((resolve,reject)=>run(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:10000,maxBuffer:16384},(error,stdout,stderr)=>error?reject(new Error((stderr||'系統未能貼上，文字已複製，請手動按 Ctrl+V').slice(0,500))):resolve({pasted:true})));}
module.exports={paste};
