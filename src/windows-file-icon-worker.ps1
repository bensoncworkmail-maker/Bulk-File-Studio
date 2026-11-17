$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.dll -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
public static class StudioFileIcon {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 struct Info {
  public IntPtr icon; public int index; public uint attributes;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string displayName;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string typeName;
 }
 [DllImport("shell32.dll", CharSet=CharSet.Unicode, EntryPoint="SHGetFileInfoW", ExactSpelling=true)]
 static extern IntPtr GetInfo(string path, uint attributes, ref Info info, uint size, uint flags);
 [DllImport("shell32.dll", CharSet=CharSet.Unicode, EntryPoint="ExtractIconExW", ExactSpelling=true)]
 static extern uint Extract(string path, int index, out IntPtr large, out IntPtr small, uint count);
 [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr icon);
 [DllImport("ole32.dll")] static extern int CoInitializeEx(IntPtr reserved, uint mode);
 [DllImport("ole32.dll")] static extern void CoUninitialize();
 public static string Read(string path, bool resource, int index) {
  IntPtr small=IntPtr.Zero, large=IntPtr.Zero;
  int initialized=CoInitializeEx(IntPtr.Zero, 2);
  try {
   if(resource) Extract(path,index,out large,out small,1);
   if(small==IntPtr.Zero && !resource) {
    var info=new Info();
    // ICON | SMALLICON; use the real local path, not extension-only attributes.
    GetInfo(path,0,ref info,(uint)Marshal.SizeOf(typeof(Info)),0x101);
    small=info.icon;
   }
   if(small==IntPtr.Zero) return "";
   using(var icon=Icon.FromHandle(small))
   using(var bitmap=icon.ToBitmap())
   using(var stream=new MemoryStream()) {
    bitmap.Save(stream,ImageFormat.Png);
    return "data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());
   }
  } finally {
   if(small!=IntPtr.Zero) DestroyIcon(small);
   if(large!=IntPtr.Zero && large!=small) DestroyIcon(large);
   if(initialized>=0) CoUninitialize();
  }
 }
}
'@
[Console]::WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::ReadLine())) {
 try {
  $request = $line | ConvertFrom-Json
  $value = [StudioFileIcon]::Read([string]$request.path, [bool]$request.resource, [int]$request.index)
  [Console]::WriteLine((@{id=$request.id;ok=$true;value=$value} | ConvertTo-Json -Compress))
 } catch {
  [Console]::WriteLine((@{id=$request.id;ok=$false;error='Unable to read file icon'} | ConvertTo-Json -Compress))
 }
}
