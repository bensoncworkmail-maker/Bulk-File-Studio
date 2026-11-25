$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class StudioRecycleBatch
{
    private const uint Silent = 0x0004, NoConfirmation = 0x0010, AllowUndo = 0x0040,
        NoErrorUi = 0x0400, RecycleOnDelete = 0x00080000, RecycleIfPossible = 0x80;
    private const int Abort = unchecked((int)0x80004004);

    [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOperation
    {
        [PreserveSig] int Advise(IntPtr sink, out uint cookie);
        [PreserveSig] int Unadvise(uint cookie);
        [PreserveSig] int SetOperationFlags(uint flags);
        [PreserveSig] int SetProgressMessage(IntPtr message);
        [PreserveSig] int SetProgressDialog(IntPtr dialog);
        [PreserveSig] int SetProperties(IntPtr properties);
        [PreserveSig] int SetOwnerWindow(IntPtr owner);
        [PreserveSig] int ApplyPropertiesToItem(IntPtr item);
        [PreserveSig] int ApplyPropertiesToItems(IntPtr items);
        [PreserveSig] int RenameItem(IntPtr item, IntPtr name, IntPtr sink);
        [PreserveSig] int RenameItems(IntPtr items, IntPtr name);
        [PreserveSig] int MoveItem(IntPtr item, IntPtr folder, IntPtr name, IntPtr sink);
        [PreserveSig] int MoveItems(IntPtr items, IntPtr folder);
        [PreserveSig] int CopyItem(IntPtr item, IntPtr folder, IntPtr name, IntPtr sink);
        [PreserveSig] int CopyItems(IntPtr items, IntPtr folder);
        [PreserveSig] int DeleteItem(IntPtr item, [MarshalAs(UnmanagedType.Interface)] IProgressSink sink);
        [PreserveSig] int DeleteItems(IntPtr items);
        [PreserveSig] int NewItem(IntPtr folder, uint attributes, IntPtr name, IntPtr template, IntPtr sink);
        [PreserveSig] int PerformOperations();
    }

    [ComImport, Guid("04B0F1A7-9490-44BC-96E1-4296A31252E2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IProgressSink
    {
        [PreserveSig] int StartOperations();
        [PreserveSig] int FinishOperations(int result);
        [PreserveSig] int PreRenameItem(uint flags, IntPtr item, IntPtr name);
        [PreserveSig] int PostRenameItem(uint flags, IntPtr item, IntPtr name, int result, IntPtr created);
        [PreserveSig] int PreMoveItem(uint flags, IntPtr item, IntPtr folder, IntPtr name);
        [PreserveSig] int PostMoveItem(uint flags, IntPtr item, IntPtr folder, IntPtr name, int result, IntPtr created);
        [PreserveSig] int PreCopyItem(uint flags, IntPtr item, IntPtr folder, IntPtr name);
        [PreserveSig] int PostCopyItem(uint flags, IntPtr item, IntPtr folder, IntPtr name, int result, IntPtr created);
        [PreserveSig] int PreDeleteItem(uint flags, IntPtr item);
        [PreserveSig] int PostDeleteItem(uint flags, IntPtr item, int result, IntPtr recycled);
        [PreserveSig] int PreNewItem(uint flags, IntPtr folder, IntPtr name);
        [PreserveSig] int PostNewItem(uint flags, IntPtr folder, IntPtr name, IntPtr template, uint attributes, int result, IntPtr created);
        [PreserveSig] int UpdateProgress(uint total, uint completed);
        [PreserveSig] int ResetTimer();
        [PreserveSig] int PauseTimer();
        [PreserveSig] int ResumeTimer();
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class ProgressSink : IProgressSink
    {
        private readonly int index;
        private bool reported;

        public ProgressSink(int index) { this.index = index; }

        public void Report(string status)
        {
            if (reported) return;
            reported = true;
            Console.WriteLine("{0}:{1}", index, status);
            Console.Out.Flush();
        }

        public int PreDeleteItem(uint flags, IntPtr item)
        {
            // Refuse the shell's permanent-delete fallback on non-recyclable volumes/items.
            if ((flags & RecycleIfPossible) != 0) return 0;
            Report("unavailable");
            return Abort;
        }

        public int PostDeleteItem(uint flags, IntPtr item, int result, IntPtr recycled)
        {
            if (result >= 0 && recycled != IntPtr.Zero) Report("recycled");
            else Report(result < 0 ? result.ToString("X8") : "unavailable");
            return 0;
        }

        public int StartOperations() { return 0; }
        public int FinishOperations(int result) { return 0; }
        public int PreRenameItem(uint flags, IntPtr item, IntPtr name) { return 0; }
        public int PostRenameItem(uint flags, IntPtr item, IntPtr name, int result, IntPtr created) { return 0; }
        public int PreMoveItem(uint flags, IntPtr item, IntPtr folder, IntPtr name) { return 0; }
        public int PostMoveItem(uint flags, IntPtr item, IntPtr folder, IntPtr name, int result, IntPtr created) { return 0; }
        public int PreCopyItem(uint flags, IntPtr item, IntPtr folder, IntPtr name) { return 0; }
        public int PostCopyItem(uint flags, IntPtr item, IntPtr folder, IntPtr name, int result, IntPtr created) { return 0; }
        public int PreNewItem(uint flags, IntPtr folder, IntPtr name) { return 0; }
        public int PostNewItem(uint flags, IntPtr folder, IntPtr name, IntPtr template, uint attributes, int result, IntPtr created) { return 0; }
        public int UpdateProgress(uint total, uint completed) { return 0; }
        public int ResetTimer() { return 0; }
        public int PauseTimer() { return 0; }
        public int ResumeTimer() { return 0; }
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IntPtr item);

    public static void Run(string[] paths)
    {
        Guid shellItemId = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
        Type operationType = Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09"));
        var operation = (IFileOperation)Activator.CreateInstance(operationType);
        try
        {
            Marshal.ThrowExceptionForHR(operation.SetOperationFlags(Silent | NoConfirmation | AllowUndo | NoErrorUi | RecycleOnDelete));
            var sinks = new ProgressSink[paths.Length];
            for (int index = 0; index < paths.Length; index++)
            {
                var sink = sinks[index] = new ProgressSink(index);
                IntPtr item;
                int result = SHCreateItemFromParsingName(paths[index], IntPtr.Zero, ref shellItemId, out item);
                if (result >= 0)
                {
                    try { result = operation.DeleteItem(item, sink); }
                    finally { Marshal.Release(item); }
                }
                if (result < 0) sink.Report(result.ToString("X8"));
            }
            int batchResult = operation.PerformOperations();
            if (batchResult < 0 && batchResult != Abort)
                foreach (var sink in sinks) sink.Report(batchResult.ToString("X8"));
        }
        finally { Marshal.FinalReleaseComObject(operation); }
    }
}
'@
[Console]::WriteLine('ready')
$line = [Console]::ReadLine()
if ($line) {
    $request = ConvertFrom-Json -InputObject $line
    [StudioRecycleBatch]::Run([string[]]$request.paths)
}
