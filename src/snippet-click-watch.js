'use strict';

// Reports only whether a button was pressed outside the current picker.
// The hook passes every event through and exists only while the picker is open.
module.exports = `
public sealed class BFSPickerClick {
 [StructLayout(LayoutKind.Sequential)] struct Point { public int x, y; }
 [StructLayout(LayoutKind.Sequential)] struct Message {
  public IntPtr window;
  public uint message;
  public UIntPtr wParam;
  public IntPtr lParam;
  public uint time;
  public Point point;
  public uint reserved;
 }
 delegate IntPtr MouseHook(int code, IntPtr message, IntPtr data);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int type, MouseHook hook, IntPtr module, uint thread);
 [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
 [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPhysicalPoint(Point point);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window, uint flag);
 [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, IntPtr window, uint minimum, uint maximum, uint flags);
 [DllImport("user32.dll")] static extern int GetMessage(out Message message, IntPtr window, uint minimum, uint maximum);
 [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
 static BFSPickerClick current;
 readonly IntPtr picker;
 readonly ManualResetEventSlim ready = new ManualResetEventSlim();
 volatile uint threadId;
 volatile bool installed, stopped, outside;

 BFSPickerClick(long handle) { picker = new IntPtr(handle); }
 IntPtr Observe(int code, IntPtr message, IntPtr data) {
  int kind = message.ToInt32();
  if(code >= 0 && !outside && !stopped && (kind == 0x201 || kind == 0x204 || kind == 0x207 || kind == 0x20b)){
   var point = (Point)Marshal.PtrToStructure(data, typeof(Point));
   var hit = WindowFromPhysicalPoint(point);
   outside = hit != picker && GetAncestor(hit, 2) != picker;
  }
  return CallNextHookEx(IntPtr.Zero, code, message, data);
 }
 void Listen() {
  Message message;
  PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
  threadId = GetCurrentThreadId();
  MouseHook callback = Observe;
  IntPtr hook = SetWindowsHookEx(14, callback, GetModuleHandle(null), 0);
  installed = hook != IntPtr.Zero;
  ready.Set();
  if(!installed)return;
  try { while(!stopped && GetMessage(out message, IntPtr.Zero, 0, 0) > 0) {} }
  finally { UnhookWindowsHookEx(hook); GC.KeepAlive(callback); }
 }
 public static bool Start(long handle) {
  if(current != null) Stop(current.picker.ToInt64());
  var watch = new BFSPickerClick(handle);
  current = watch;
  var thread = new Thread(watch.Listen) { IsBackground = true };
  thread.Start();
  if(watch.ready.Wait(700) && watch.installed)return true;
  Stop(handle);
  return false;
 }
 public static bool Outside(long handle) {
  return current != null && current.picker.ToInt64() == handle && current.outside;
 }
 public static void Stop(long handle) {
  var watch = current;
  if(watch == null || watch.picker.ToInt64() != handle)return;
  current = null;
  watch.stopped = true;
  if(watch.threadId != 0)PostThreadMessage(watch.threadId, 0x12, UIntPtr.Zero, IntPtr.Zero);
 }
}
`;
