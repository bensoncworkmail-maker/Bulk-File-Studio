using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

internal static class SnippetSelection
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [MTAThread]
    private static int Main(string[] args)
    {
        int limit;
        if (args.Length != 1 || !Int32.TryParse(args[0], out limit) || limit < 1 || limit == Int32.MaxValue)
            return 1;

        try
        {
            var foreground = GetForegroundWindow();
            if (foreground == IntPtr.Zero) return 0;
            var focused = AutomationElement.FocusedElement;
            if (focused == null) return 0;

            var text = ReadSelection(focused, limit);
            if (!String.IsNullOrWhiteSpace(text) && focused.Equals(AutomationElement.FocusedElement) && GetForegroundWindow() == foreground)
            {
                Console.OutputEncoding = new UTF8Encoding(false);
                Console.Write(text);
            }
            return 0;
        }
        catch (Exception)
        {
            // Controls can disappear or deny access while being queried.
            return 1;
        }
    }

    private static string ReadSelection(AutomationElement focused, int limit)
    {
        var processId = focused.Current.ProcessId;
        var element = focused;
        for (var depth = 0; element != null && depth < 12; depth++)
        {
            var current = element.Current;
            if (current.IsPassword || current.ProcessId != processId || current.ControlType == ControlType.Window)
                return null;

            object pattern;
            if (element.TryGetCurrentPattern(TextPattern.Pattern, out pattern))
            {
                var selected = new StringBuilder();
                foreach (var range in ((TextPattern)pattern).GetSelection())
                {
                    var remaining = limit - selected.Length;
                    var text = range.GetText(remaining + 1);
                    if (text.Length == 0) continue;
                    if (text.Length > remaining - (selected.Length == 0 ? 0 : 1)) return null;
                    if (selected.Length > 0) selected.Append('\n');
                    selected.Append(text);
                }
                return selected.ToString();
            }

            // A browser can expose selection on the document enclosing the focused element.
            // An edit control without TextPattern must not return its containing document's text.
            if (current.ControlType == ControlType.Edit) return null;
            element = TreeWalker.RawViewWalker.GetParent(element);
        }
        return null;
    }
}
