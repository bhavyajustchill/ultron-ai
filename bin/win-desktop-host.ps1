# Windows desktop host for Jarvis (Phase 15).
# A long-lived helper the Next.js server drives over stdin / stdout, one JSON object per line:
#   in:  { "id": 1, "cmd": "focus", "args": { "handle": 123 } }
#   out: { "id": 1, "ok": true, "result": { ... } }   or   { "id": 1, "ok": false, "error": "..." }
# It lists, focuses, and arranges windows and sends keyboard and mouse input (user32), reads the
# focused control (UI Automation), pastes through the clipboard, and drives Word, Excel, and
# PowerPoint (COM). It runs in Windows PowerShell 5.1, which every Windows 10 / 11 has and which can
# attach to an Office app that is already open. Started by lib/winDesktop.js; exits when stdin closes.

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace JarvisDesktop
{
    public class WindowInfo
    {
        public long Handle;
        public string Title;
        public string ClassName;
        public int ProcessId;
        public string Process;
        public bool Minimized;
        public bool Maximized;
        public bool Foreground;
        public bool Elevated;
    }

    public static class Native
    {
        [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
        [StructLayout(LayoutKind.Sequential)] struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
        [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public HARDWAREINPUT hi; }
        [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

        delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
        [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lParam);
        [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr lParam);
        [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr hWnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
        [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr hWnd);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder text, int max);
        [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hWnd, uint cmd);
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int index);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int cmd);
        [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint attachTo, bool doAttach);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
        [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
        [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
        [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [DllImport("user32.dll")] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
        [DllImport("user32.dll")] static extern bool SwitchDesktop(IntPtr desktop);
        [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
        [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
        [DllImport("advapi32.dll")] static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr info, int length, out int returned);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

        const uint INPUT_MOUSE = 0;
        const uint INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_EXTENDEDKEY = 0x1;
        const uint KEYEVENTF_KEYUP = 0x2;
        const uint KEYEVENTF_UNICODE = 0x4;
        const uint MOUSEEVENTF_WHEEL = 0x0800;
        const int GWL_EXSTYLE = -20;
        const int WS_EX_TOOLWINDOW = 0x80;
        const uint GW_OWNER = 4;
        const int DWMWA_CLOAKED = 14;
        const uint WM_CLOSE = 0x0010;

        static bool selfElevated;

        // Coordinates in physical pixels on every monitor, whatever the display scaling
        public static void Init()
        {
            try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); }
            catch (EntryPointNotFoundException) { SetProcessDPIAware(); }
            selfElevated = IsElevated(Process.GetCurrentProcess().Id);
        }

        public static bool SelfElevated { get { return selfElevated; } }

        // ---------------------------------------------------------------- windows

        static string Text(IntPtr hWnd)
        {
            int length = GetWindowTextLength(hWnd);
            StringBuilder text = new StringBuilder(length + 1);
            GetWindowText(hWnd, text, text.Capacity);
            return text.ToString();
        }

        static string ClassOf(IntPtr hWnd)
        {
            StringBuilder name = new StringBuilder(256);
            GetClassName(hWnd, name, name.Capacity);
            return name.ToString();
        }

        static string ProcessName(int pid)
        {
            try { return Process.GetProcessById(pid).ProcessName; } catch { return ""; }
        }

        public static WindowInfo Describe(IntPtr hWnd)
        {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            WindowInfo info = new WindowInfo();
            info.Handle = hWnd.ToInt64();
            info.Title = Text(hWnd);
            info.ClassName = ClassOf(hWnd);
            info.ProcessId = (int)pid;
            info.Process = ProcessName((int)pid);
            // Store apps (Calculator, Settings...) are framed by ApplicationFrameHost: report the app inside
            if (info.Process == "ApplicationFrameHost")
            {
                uint hostPid = pid;
                EnumChildWindows(hWnd, delegate (IntPtr child, IntPtr l)
                {
                    uint childPid;
                    GetWindowThreadProcessId(child, out childPid);
                    if (childPid != hostPid) { info.ProcessId = (int)childPid; info.Process = ProcessName((int)childPid); return false; }
                    return true;
                }, IntPtr.Zero);
            }
            info.Minimized = IsIconic(hWnd);
            info.Maximized = IsZoomed(hWnd);
            info.Foreground = GetForegroundWindow() == hWnd;
            info.Elevated = !selfElevated && IsElevated(info.ProcessId);
            return info;
        }

        // Top-level application windows in z-order (front first): visible, titled, unowned, not tool
        // windows, and not cloaked (suspended Store apps and other virtual desktops)
        public static List<WindowInfo> ListWindows()
        {
            List<IntPtr> handles = new List<IntPtr>();
            EnumWindows(delegate (IntPtr hWnd, IntPtr l)
            {
                if (!IsWindowVisible(hWnd) || GetWindowTextLength(hWnd) == 0) return true;
                if (GetWindow(hWnd, GW_OWNER) != IntPtr.Zero) return true;
                if ((GetWindowLong(hWnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) != 0) return true;
                int cloaked;
                if (DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;
                string cls = ClassOf(hWnd);
                if (cls == "Progman" || cls == "Shell_TrayWnd" || cls == "WorkerW") return true;
                handles.Add(hWnd);
                return true;
            }, IntPtr.Zero);
            List<WindowInfo> windows = new List<WindowInfo>();
            foreach (IntPtr hWnd in handles) windows.Add(Describe(hWnd));
            return windows;
        }

        public static long Foreground() { return GetForegroundWindow().ToInt64(); }

        public static bool Exists(long handle) { return IsWindow(new IntPtr(handle)); }

        static bool WaitForeground(IntPtr hWnd, int ms)
        {
            int waited = 0;
            while (waited <= ms)
            {
                if (GetForegroundWindow() == hWnd) return true;
                Thread.Sleep(40);
                waited += 40;
            }
            return false;
        }

        // Windows only lets the foreground app hand focus over, so a background helper tries the plain
        // call, then borrowing the foreground thread's input state, then two Alt taps (which unlock
        // SetForegroundWindow without leaving a menu open). Returns how it got there, or "failed".
        public static string Focus(long handle)
        {
            IntPtr hWnd = new IntPtr(handle);
            if (!IsWindow(hWnd)) throw new Exception("That window is no longer open.");
            if (IsIconic(hWnd)) ShowWindow(hWnd, 9);
            if (GetForegroundWindow() == hWnd) return "already";
            if (SetForegroundWindow(hWnd) && WaitForeground(hWnd, 300)) return "direct";

            uint dummy;
            uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out dummy);
            uint self = GetCurrentThreadId();
            if (foregroundThread != 0 && foregroundThread != self)
            {
                AttachThreadInput(self, foregroundThread, true);
                BringWindowToTop(hWnd);
                SetForegroundWindow(hWnd);
                AttachThreadInput(self, foregroundThread, false);
                if (WaitForeground(hWnd, 500)) return "attached";
            }

            Send(Key(0x12, false), Key(0x12, true), Key(0x12, false), Key(0x12, true));
            SetForegroundWindow(hWnd);
            return WaitForeground(hWnd, 800) ? "alt" : "failed";
        }

        // minimize | maximize | restore
        public static void Show(long handle, string state)
        {
            IntPtr hWnd = new IntPtr(handle);
            if (!IsWindow(hWnd)) throw new Exception("That window is no longer open.");
            int cmd = state == "minimize" ? 6 : state == "maximize" ? 3 : 9;
            ShowWindow(hWnd, cmd);
        }

        // Asks the app to close, exactly like its close button: it can still ask to save
        public static void Close(long handle)
        {
            IntPtr hWnd = new IntPtr(handle);
            if (!IsWindow(hWnd)) throw new Exception("That window is no longer open.");
            PostMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
        }

        // ---------------------------------------------------------------- input

        static bool IsExtended(ushort vk)
        {
            return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E || vk == 0x5B || vk == 0x5C || vk == 0x5D || vk == 0x2C || vk == 0x6F || vk == 0x90;
        }

        static INPUT Key(ushort vk, bool up)
        {
            INPUT input = new INPUT();
            input.type = INPUT_KEYBOARD;
            input.u.ki.wVk = vk;
            input.u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
            input.u.ki.dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
            return input;
        }

        static INPUT Unicode(char c, bool up)
        {
            INPUT input = new INPUT();
            input.type = INPUT_KEYBOARD;
            input.u.ki.wVk = 0;
            input.u.ki.wScan = c;
            input.u.ki.dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0);
            return input;
        }

        static INPUT Mouse(uint flags, int data)
        {
            INPUT input = new INPUT();
            input.type = INPUT_MOUSE;
            input.u.mi.dwFlags = flags;
            input.u.mi.mouseData = unchecked((uint)data);
            return input;
        }

        static void Send(params INPUT[] inputs)
        {
            uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
            if (sent != inputs.Length) throw new Exception("Windows did not accept the input (error " + Marshal.GetLastWin32Error() + ").");
        }

        // Shift, Ctrl, Alt, or a Windows key the operator is physically holding would turn typed text into shortcuts
        public static bool ModifiersHeld()
        {
            int[] keys = { 0x10, 0x11, 0x12, 0x5B, 0x5C };
            foreach (int vk in keys) if ((GetAsyncKeyState(vk) & 0x8000) != 0) return true;
            return false;
        }

        // Characters as Unicode key events (any keyboard layout); new lines and tabs as real keys
        public static int TypeText(string text, int delayMs)
        {
            int count = 0;
            string normalized = text.Replace("\r\n", "\n").Replace('\r', '\n');
            foreach (char c in normalized)
            {
                if (c == '\n') Send(Key(0x0D, false), Key(0x0D, true));
                else if (c == '\t') Send(Key(0x09, false), Key(0x09, true));
                else Send(Unicode(c, false), Unicode(c, true));
                count++;
                if (delayMs > 0) Thread.Sleep(delayMs);
            }
            return count;
        }

        // A combination: every key down in order, then up in reverse
        public static void PressKeys(int[] vks)
        {
            List<INPUT> inputs = new List<INPUT>();
            foreach (int vk in vks) inputs.Add(Key((ushort)vk, false));
            for (int i = vks.Length - 1; i >= 0; i--) inputs.Add(Key((ushort)vks[i], true));
            Send(inputs.ToArray());
        }

        public static void MoveMouse(int x, int y)
        {
            if (!SetCursorPos(x, y)) throw new Exception("The pointer could not be moved there.");
        }

        public static void Click(string button, bool twice)
        {
            uint down = button == "right" ? 0x0008u : button == "middle" ? 0x0020u : 0x0002u;
            uint up = down << 1;
            Send(Mouse(down, 0), Mouse(up, 0));
            if (twice) { Thread.Sleep(60); Send(Mouse(down, 0), Mouse(up, 0)); }
        }

        // Positive steps scroll up
        public static void Scroll(int steps)
        {
            Send(Mouse(MOUSEEVENTF_WHEEL, steps * 120));
        }

        public static int[] VirtualScreen()
        {
            return new int[] { GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79) };
        }

        // False while the workstation is locked or a secure desktop (UAC prompt) has the input
        public static bool InputDesktopAvailable()
        {
            IntPtr desktop = OpenInputDesktop(0, false, 0x0100);
            if (desktop == IntPtr.Zero) return false;
            bool ok = SwitchDesktop(desktop);
            CloseDesktop(desktop);
            return ok;
        }

        // Windows silently drops input sent from a normal process to an elevated (administrator) one
        public static bool IsElevated(int pid)
        {
            IntPtr process = OpenProcess(0x1000, false, pid);
            if (process == IntPtr.Zero) return true;
            IntPtr token;
            if (!OpenProcessToken(process, 0x0008, out token)) { CloseHandle(process); return true; }
            IntPtr buffer = Marshal.AllocHGlobal(4);
            int returned;
            bool ok = GetTokenInformation(token, 20, buffer, 4, out returned);
            int elevated = ok ? Marshal.ReadInt32(buffer) : 0;
            Marshal.FreeHGlobal(buffer);
            CloseHandle(token);
            CloseHandle(process);
            return elevated != 0;
        }
    }
}
'@

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
[JarvisDesktop.Native]::Init()

# ------------------------------------------------------------------------------------------ helpers

function ConvertTo-WindowRecord($w) {
  [ordered]@{
    handle = $w.Handle; title = $w.Title; class_name = $w.ClassName; pid = $w.ProcessId; process = $w.Process
    minimized = $w.Minimized; maximized = $w.Maximized; foreground = $w.Foreground; elevated = $w.Elevated
  }
}

# The control that has keyboard focus: its type, whether it takes text, and whether it is a password box
function Get-FocusInfo {
  $element = $null
  try { $element = [System.Windows.Automation.AutomationElement]::FocusedElement } catch { return $null }
  if (-not $element) { return $null }
  $current = $element.Current
  $type = ($current.ControlType.ProgrammaticName -replace '^ControlType\.', '')
  $editable = $type -in @('Edit', 'Document')
  try {
    $value = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($value -and -not $value.Current.IsReadOnly) { $editable = $true }
  } catch {}
  [ordered]@{
    control = $type; name = [string]$current.Name; class_name = [string]$current.ClassName
    pid = $current.ProcessId; is_password = [bool]$current.IsPassword; editable = [bool]$editable
  }
}

# PowerShell wraps errors from .NET and COM method calls (MethodInvocationException): the innermost
# exception carries the real HResult and message
function Get-InnerException($err) {
  $exception = $err.Exception
  while ($exception.InnerException) { $exception = $exception.InnerException }
  return $exception
}

function Invoke-WithClipboard([scriptblock]$action) {
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    try { return & $action }
    catch {
      if (-not ((Get-InnerException $_) -is [System.Runtime.InteropServices.ExternalException])) { throw }
      Start-Sleep -Milliseconds 100
    }
  }
  throw 'The clipboard is in use by another app.'
}

# Long text goes in through the clipboard and Ctrl+V, then the operator's clipboard text is put back.
# Refuses (so the caller types instead) when the clipboard holds something other than text.
function Invoke-Paste([string]$text) {
  $hadText = Invoke-WithClipboard { [System.Windows.Forms.Clipboard]::ContainsText() }
  $before = if ($hadText) { Invoke-WithClipboard { [System.Windows.Forms.Clipboard]::GetText() } } else { $null }
  if (-not $hadText) {
    $formats = Invoke-WithClipboard { [System.Windows.Forms.Clipboard]::GetDataObject() }
    if ($formats -and $formats.GetFormats().Count -gt 0) { return $false }
  }
  Invoke-WithClipboard { [System.Windows.Forms.Clipboard]::SetText($text) } | Out-Null
  [JarvisDesktop.Native]::PressKeys([int[]]@(0x11, 0x56))
  Start-Sleep -Milliseconds 450
  if ($hadText) { Invoke-WithClipboard { [System.Windows.Forms.Clipboard]::SetText($before) } | Out-Null }
  else { Invoke-WithClipboard { [System.Windows.Forms.Clipboard]::Clear() } | Out-Null }
  return $true
}

function Wait-NoModifiers {
  for ($i = 0; $i -lt 20; $i++) {
    if (-not [JarvisDesktop.Native]::ModifiersHeld()) { return }
    Start-Sleep -Milliseconds 50
  }
  throw 'A Shift, Ctrl, Alt, or Windows key is being held down, so nothing was typed.'
}

# ------------------------------------------------------------------------------------------ Office

$OfficeProgIds = @{ word = 'Word.Application'; excel = 'Excel.Application'; powerpoint = 'PowerPoint.Application' }
$RetryHResults = @(0x80010001, 0x8001010A) | ForEach-Object { [int]$_ }

# Office rejects calls while a dialog is open or it is busy: retry for a few seconds before giving up
function Invoke-Office([scriptblock]$action) {
  for ($attempt = 0; $attempt -lt 16; $attempt++) {
    try { return & $action }
    catch {
      if ($RetryHResults -notcontains (Get-InnerException $_).HResult) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
  throw 'Office is busy (a dialog may be open in it). Close the dialog and ask again.'
}

function Test-OfficeInstalled([string]$app) {
  Test-Path "Registry::HKEY_CLASSES_ROOT\$($OfficeProgIds[$app])"
}

# The running app (attached through the Running Object Table) or a new visible one
function Get-OfficeApp([string]$app, [bool]$start) {
  $progId = $OfficeProgIds[$app]
  if (-not $progId) { throw "Unknown Office app '$app' (use word, excel, or powerpoint)." }
  $instance = $null
  try { $instance = [System.Runtime.InteropServices.Marshal]::GetActiveObject($progId) } catch { $instance = $null }
  if (-not $instance) {
    if (-not $start) { return $null }
    if (-not (Test-OfficeInstalled $app)) { throw "Microsoft $app is not installed on this PC." }
    $instance = New-Object -ComObject $progId
  }
  if ($app -eq 'powerpoint') { Invoke-Office { $instance.Visible = -1 } | Out-Null } else { Invoke-Office { $instance.Visible = $true } | Out-Null }
  return $instance
}

function Get-OfficeWindowHandle([string]$app, $instance) {
  try {
    switch ($app) {
      'word' { return [long](Invoke-Office { $instance.ActiveWindow.Hwnd }) }
      'excel' { return [long](Invoke-Office { $instance.Hwnd }) }
      'powerpoint' { return [long](Invoke-Office { $instance.HWND }) }
    }
  } catch { return 0 }
}

function Get-ActiveDocument([string]$app, $instance, [bool]$create) {
  $doc = $null
  try {
    switch ($app) {
      'word' { if ((Invoke-Office { $instance.Documents.Count }) -gt 0) { $doc = Invoke-Office { $instance.ActiveDocument } } }
      'excel' { $doc = Invoke-Office { $instance.ActiveWorkbook } }
      'powerpoint' { if ((Invoke-Office { $instance.Presentations.Count }) -gt 0) { $doc = Invoke-Office { $instance.ActivePresentation } } }
    }
  } catch { $doc = $null }
  if (-not $doc -and $create) { $doc = New-OfficeDocument $app $instance }
  if (-not $doc) { throw "No document is open in $app." }
  return $doc
}

function New-OfficeDocument([string]$app, $instance) {
  switch ($app) {
    'word' { return Invoke-Office { $instance.Documents.Add() } }
    'excel' { return Invoke-Office { $instance.Workbooks.Add() } }
    'powerpoint' {
      $pres = Invoke-Office { $instance.Presentations.Add(-1) }
      # A new presentation starts empty: give it a title slide to write on
      Invoke-Office { $pres.Slides.AddSlide(1, $pres.SlideMaster.CustomLayouts.Item(1)) } | Out-Null
      return $pres
    }
  }
}

function Get-DocumentName([string]$app, $doc) {
  try { return [string](Invoke-Office { $doc.Name }) } catch { return '' }
}

function Get-DocumentPath($doc) {
  try { return [string](Invoke-Office { $doc.FullName }) } catch { return '' }
}

# A value typed into a cell: numbers stay numbers, "=..." stays a formula, everything else is text
function ConvertTo-CellValue([string]$raw) {
  $text = $raw.Trim()
  $number = 0.0
  if ($text -match '^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$' -and [double]::TryParse($text, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) { return $number }
  return $text
}

# Every Office command lets go of its COM references when it finishes: otherwise an app the operator
# closes (or that Jarvis quits) would stay running, hidden, for as long as the helper holds them
function Invoke-OfficeCommand($a) {
  try { return Invoke-OfficeAction $a }
  finally {
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    [System.GC]::Collect()
  }
}

function Invoke-OfficeAction($a) {
  $app = [string]$a.app
  $action = [string]$a.action

  if ($action -eq 'status') {
    $apps = [ordered]@{}
    foreach ($name in @('word', 'excel', 'powerpoint')) {
      $installed = Test-OfficeInstalled $name
      $instance = if ($installed) { Get-OfficeApp $name $false } else { $null }
      $docs = @()
      if ($instance) {
        try {
          $collection = switch ($name) { 'word' { $instance.Documents } 'excel' { $instance.Workbooks } 'powerpoint' { $instance.Presentations } }
          foreach ($d in $collection) { $docs += [string]$d.Name }
        } catch {}
      }
      $apps[$name] = [ordered]@{ installed = [bool]$installed; running = [bool]$instance; documents = $docs }
    }
    return [ordered]@{ apps = $apps }
  }

  $instance = Get-OfficeApp $app $true
  $result = [ordered]@{ app = $app }
  switch ($action) {
    'new' {
      $doc = New-OfficeDocument $app $instance
      $result.document = Get-DocumentName $app $doc
    }
    'open' {
      $path = [string]$a.path
      $doc = switch ($app) {
        'word' { Invoke-Office { $instance.Documents.Open($path, $false, $false) } }
        'excel' { Invoke-Office { $instance.Workbooks.Open($path) } }
        'powerpoint' { Invoke-Office { $instance.Presentations.Open($path) } }
      }
      $protected = 0
      try { $protected = [int](Invoke-Office { $instance.ProtectedViewWindows.Count }) } catch {}
      $result.document = Get-DocumentName $app $doc
      $result.protected_view = $protected -gt 0
    }
    'write_text' {
      $text = [string]$a.text
      $doc = Get-ActiveDocument $app $instance $true
      switch ($app) {
        'word' {
          if ($a.position -eq 'end') {
            Invoke-Office { $doc.Content.InsertAfter(($text -replace "`r?`n", "`r")) } | Out-Null
          } else {
            $selection = Invoke-Office { $instance.Selection }
            $lines = $text -split "`r?`n"
            for ($i = 0; $i -lt $lines.Count; $i++) {
              if ($lines[$i].Length) { Invoke-Office { $selection.TypeText($lines[$i]) } | Out-Null }
              if ($i -lt $lines.Count - 1) { Invoke-Office { $selection.TypeParagraph() } | Out-Null }
            }
          }
        }
        'powerpoint' {
          $selection = Invoke-Office { $instance.ActiveWindow.Selection }
          if ((Invoke-Office { $selection.Type }) -ne 3) { throw 'Click into a text box or placeholder in PowerPoint first, or ask for a new slide with this text.' }
          Invoke-Office { $selection.TextRange.InsertAfter(($text -replace "`r?`n", "`r")) } | Out-Null
        }
        'excel' { throw 'For Excel, write into cells (write_cells).' }
      }
      $result.document = Get-DocumentName $app $doc
      $result.chars = $text.Length
    }
    'write_cells' {
      if ($app -ne 'excel') { throw 'Cells are an Excel action.' }
      $workbook = Get-ActiveDocument 'excel' $instance $true
      $sheet = if ($a.sheet) { Invoke-Office { $workbook.Worksheets.Item([string]$a.sheet) } } else { Invoke-Office { $instance.ActiveSheet } }
      $rows = @($a.rows)
      if ($rows.Count -eq 0) { throw 'No rows to write.' }
      $cells = @($rows | ForEach-Object { , @(([string]$_) -split '\s*\|\s*') })
      $width = ($cells | ForEach-Object { $_.Count } | Measure-Object -Maximum).Maximum
      $values = New-Object 'object[,]' $cells.Count, $width
      for ($r = 0; $r -lt $cells.Count; $r++) {
        for ($c = 0; $c -lt $cells[$r].Count; $c++) { $values[$r, $c] = ConvertTo-CellValue $cells[$r][$c] }
      }
      # Ranges are enumerable, so they are fetched directly: leaving a script block would unroll them into cells
      $start = if ($a.cell) { $sheet.Range([string]$a.cell) } else { $instance.ActiveCell }
      $target = $start.Resize($cells.Count, $width)
      Invoke-Office { $target.Value2 = $values } | Out-Null
      $result.document = Get-DocumentName 'excel' $workbook
      $result.sheet = [string](Invoke-Office { $sheet.Name })
      $result.range = [string](Invoke-Office { $target.Address($false, $false) })
      $result.cells = $cells.Count * $width
    }
    'add_slide' {
      if ($app -ne 'powerpoint') { throw 'Slides are a PowerPoint action.' }
      $pres = Get-ActiveDocument 'powerpoint' $instance $true
      $index = [int](Invoke-Office { $pres.Slides.Count }) + 1
      $layout = Invoke-Office { $pres.SlideMaster.CustomLayouts.Item(2) }
      $slide = Invoke-Office { $pres.Slides.AddSlide($index, $layout) }
      if ($a.title) {
        try { Invoke-Office { $slide.Shapes.Title.TextFrame.TextRange.Text = [string]$a.title } | Out-Null }
        catch { throw 'This presentation''s slide layout has no title placeholder.' }
      }
      if ($a.text) {
        $body = $null
        foreach ($shape in $slide.Shapes.Placeholders) { if ($shape.PlaceholderFormat.Type -ne 1 -and $shape.HasTextFrame) { $body = $shape; break } }
        if ($body) { Invoke-Office { $body.TextFrame.TextRange.Text = (([string]$a.text) -replace "`r?`n", "`r") } | Out-Null }
      }
      try { Invoke-Office { $instance.ActiveWindow.View.GotoSlide($index) } | Out-Null } catch {}
      $result.document = Get-DocumentName 'powerpoint' $pres
      $result.slide = $index
    }
    'read' {
      $doc = Get-ActiveDocument $app $instance $false
      $limit = 20000
      switch ($app) {
        'word' {
          $text = [string](Invoke-Office { $doc.Content.Text })
          $selected = [string](Invoke-Office { $instance.Selection.Text })
          $result.text = if ($text.Length -gt $limit) { $text.Substring(0, $limit) } else { $text }
          $result.truncated = $text.Length -gt $limit
          if ($selected.Trim().Length -gt 1) { $result.selection = $selected }
        }
        'excel' {
          $sheet = Invoke-Office { $instance.ActiveSheet }
          # Ranges and value arrays are fetched directly (a script block would unroll them)
          $used = $sheet.UsedRange
          $rowCount = [Math]::Min([int]$used.Rows.Count, 60)
          $colCount = [Math]::Min([int]$used.Columns.Count, 20)
          $values = $used.Resize($rowCount, $colCount).Value2
          $rowsOut = @()
          if ($values -is [array] -and $values.Rank -eq 2) {
            for ($r = 1; $r -le $rowCount; $r++) {
              $cells = @(); for ($c = 1; $c -le $colCount; $c++) { $cells += [string]$values[$r, $c] }
              $rowsOut += ($cells -join ' | ')
            }
          } else { $rowsOut += [string]$values }
          $result.sheet = [string](Invoke-Office { $sheet.Name })
          $result.range = [string](Invoke-Office { $used.Address($false, $false) })
          $result.rows = $rowsOut
          $result.active_cell = [string](Invoke-Office { $instance.ActiveCell.Address($false, $false) })
        }
        'powerpoint' {
          $slides = @()
          foreach ($slide in $doc.Slides) {
            $texts = @()
            foreach ($shape in $slide.Shapes) { if ($shape.HasTextFrame -and $shape.TextFrame.HasText) { $texts += [string]$shape.TextFrame.TextRange.Text } }
            $slides += [ordered]@{ slide = [int]$slide.SlideIndex; text = ($texts -join "`n") }
          }
          $result.slides = $slides
        }
      }
      $result.document = Get-DocumentName $app $doc
      $result.path = Get-DocumentPath $doc
    }
    'save' {
      $doc = Get-ActiveDocument $app $instance $false
      $path = [string](Invoke-Office { $doc.Path })
      if (-not $path) { throw 'This document has never been saved, so it needs a file name (save_as).' }
      Invoke-Office { $doc.Save() } | Out-Null
      $result.document = Get-DocumentName $app $doc
      $result.path = Get-DocumentPath $doc
    }
    'save_as' {
      $doc = Get-ActiveDocument $app $instance $false
      $path = [string]$a.path
      $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
      $alerts = $null
      try { $alerts = $instance.DisplayAlerts; $instance.DisplayAlerts = 0 } catch {}
      try {
        switch ($app) {
          'word' {
            $format = @{ '.docx' = 16; '.doc' = 0; '.pdf' = 17; '.txt' = 2; '.rtf' = 6; '.odt' = 23 }[$ext]
            if ($null -eq $format) { throw "Word cannot save as $ext." }
            Invoke-Office { $doc.SaveAs2($path, $format) } | Out-Null
          }
          'excel' {
            if ($ext -eq '.pdf') { Invoke-Office { $doc.ExportAsFixedFormat(0, $path) } | Out-Null }
            else {
              $format = @{ '.xlsx' = 51; '.xlsm' = 52; '.xls' = 56; '.csv' = 6; '.ods' = 60 }[$ext]
              if ($null -eq $format) { throw "Excel cannot save as $ext." }
              Invoke-Office { $doc.SaveAs($path, $format) } | Out-Null
            }
          }
          'powerpoint' {
            $format = @{ '.pptx' = 24; '.ppt' = 1; '.pdf' = 32; '.odp' = 35 }[$ext]
            if ($null -eq $format) { throw "PowerPoint cannot save as $ext." }
            Invoke-Office { $doc.SaveAs($path, $format) } | Out-Null
          }
        }
      } finally {
        if ($null -ne $alerts) { try { $instance.DisplayAlerts = $alerts } catch {} }
      }
      $result.document = Get-DocumentName $app $doc
      $result.path = $path
    }
    'close' {
      $doc = Get-ActiveDocument $app $instance $false
      $result.document = Get-DocumentName $app $doc
      $saved = [bool](Invoke-Office { $doc.Saved })
      if (-not $saved -and -not $a.discard) { throw "$($result.document) has unsaved changes. Save it first, or close it without saving only if the operator said so." }
      switch ($app) {
        'word' { Invoke-Office { $doc.Close(0) } | Out-Null }
        'excel' { Invoke-Office { $doc.Close($false) } | Out-Null }
        'powerpoint' { if (-not $saved) { Invoke-Office { $doc.Saved = -1 } | Out-Null }; Invoke-Office { $doc.Close() } | Out-Null }
      }
      # The app goes away with its last document, like closing its window
      $remaining = switch ($app) { 'word' { $instance.Documents.Count } 'excel' { $instance.Workbooks.Count } 'powerpoint' { $instance.Presentations.Count } }
      if ($remaining -eq 0) { Invoke-Office { $instance.Quit() } | Out-Null; $result.quit = $true; return $result }
      $result.quit = $false
    }
    default { throw "Unknown Office action '$action'." }
  }
  $result.window = Get-OfficeWindowHandle $app $instance
  return $result
}

# ------------------------------------------------------------------------------------------ commands

$Commands = @{
  'ping' = { param($a) [ordered]@{ pong = $true } }

  'status' = {
    param($a)
    $screen = [JarvisDesktop.Native]::VirtualScreen()
    [ordered]@{
      elevated = [JarvisDesktop.Native]::SelfElevated
      input_desktop = [JarvisDesktop.Native]::InputDesktopAvailable()
      screen = [ordered]@{ x = $screen[0]; y = $screen[1]; width = $screen[2]; height = $screen[3] }
    }
  }

  'list_windows' = { param($a) [ordered]@{ windows = @([JarvisDesktop.Native]::ListWindows() | ForEach-Object { ConvertTo-WindowRecord $_ }) } }

  'foreground' = {
    param($a)
    $handle = [JarvisDesktop.Native]::Foreground()
    $window = if ($handle -ne 0) { ConvertTo-WindowRecord ([JarvisDesktop.Native]::Describe([IntPtr]::new($handle))) } else { $null }
    [ordered]@{ window = $window; focus = $(if ($a.focus_info) { Get-FocusInfo } else { $null }) }
  }

  'focus' = {
    param($a)
    $method = [JarvisDesktop.Native]::Focus([long]$a.handle)
    [ordered]@{ method = $method; foreground = ([JarvisDesktop.Native]::Foreground() -eq [long]$a.handle) }
  }

  'show' = { param($a) [JarvisDesktop.Native]::Show([long]$a.handle, [string]$a.state); [ordered]@{ done = $true } }

  'close' = { param($a) [JarvisDesktop.Native]::Close([long]$a.handle); [ordered]@{ done = $true } }

  'exists' = { param($a) [ordered]@{ exists = [JarvisDesktop.Native]::Exists([long]$a.handle) } }

  'focus_info' = { param($a) [ordered]@{ focus = Get-FocusInfo } }

  'type_text' = {
    param($a)
    if (-not [JarvisDesktop.Native]::InputDesktopAvailable()) { throw 'The screen is locked (or a Windows security prompt is open), so nothing can be typed.' }
    Wait-NoModifiers
    $text = [string]$a.text
    if ($a.method -eq 'paste' -and (Invoke-Paste $text)) { return [ordered]@{ chars = $text.Length; method = 'paste' } }
    $count = [JarvisDesktop.Native]::TypeText($text, [int]$a.delay_ms)
    [ordered]@{ chars = $count; method = 'type' }
  }

  'press_keys' = {
    param($a)
    if (-not [JarvisDesktop.Native]::InputDesktopAvailable()) { throw 'The screen is locked (or a Windows security prompt is open), so no keys can be pressed.' }
    Wait-NoModifiers
    [JarvisDesktop.Native]::PressKeys([int[]]@($a.vks))
    [ordered]@{ done = $true }
  }

  'move_mouse' = { param($a) [JarvisDesktop.Native]::MoveMouse([int]$a.x, [int]$a.y); [ordered]@{ done = $true } }

  'click' = {
    param($a)
    if ($null -ne $a.x -and $null -ne $a.y) { [JarvisDesktop.Native]::MoveMouse([int]$a.x, [int]$a.y); Start-Sleep -Milliseconds 30 }
    [JarvisDesktop.Native]::Click([string]$a.button, [bool]$a.double)
    [ordered]@{ done = $true }
  }

  'scroll' = { param($a) [JarvisDesktop.Native]::Scroll([int]$a.steps); [ordered]@{ done = $true } }

  'start_apps' = {
    param($a)
    [ordered]@{ apps = @(Get-StartApps | ForEach-Object { [ordered]@{ name = [string]$_.Name; app_id = [string]$_.AppID } }) }
  }

  'app_paths' = {
    param($a)
    $found = @()
    foreach ($root in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths')) {
      if (-not (Test-Path $root)) { continue }
      foreach ($key in Get-ChildItem $root -ErrorAction SilentlyContinue) {
        $target = (Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue).'(default)'
        if ($target) { $found += [ordered]@{ exe = $key.PSChildName; path = ([string]$target).Trim('"') } }
      }
    }
    [ordered]@{ apps = $found }
  }

  'office' = { param($a) Invoke-OfficeCommand $a }
}

function Write-Reply($reply) {
  [Console]::Out.WriteLine(($reply | ConvertTo-Json -Compress -Depth 8))
  [Console]::Out.Flush()
}

Write-Reply ([ordered]@{ ready = $true; pid = $PID })

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $id = $null
  try {
    $request = $line | ConvertFrom-Json
    $id = $request.id
    $handler = $Commands[[string]$request.cmd]
    if (-not $handler) { throw "Unknown command '$($request.cmd)'." }
    # Only the handler's last output is the result, so a stray value from a COM call cannot corrupt it
    $result = & $handler $request.args | Select-Object -Last 1
    Write-Reply ([ordered]@{ id = $id; ok = $true; result = $result })
  } catch {
    $message = (Get-InnerException $_).Message
    if (-not $message) { $message = $_.Exception.Message }
    Write-Reply ([ordered]@{ id = $id; ok = $false; error = $message })
  }
}
