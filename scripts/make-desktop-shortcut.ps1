$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExePath = Join-Path $RepoRoot "target\release\SETLIST.exe"
$WorkingDir = Split-Path -Parent $ExePath
$DesktopFolder = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopFolder "SETLIST.lnk"
$IconPath = Join-Path $RepoRoot "src-tauri\icons\icon.ico"

$resolvedExe = (Resolve-Path $ExePath -ErrorAction SilentlyContinue).Path
if (-not $resolvedExe) {
    $resolvedExe = $ExePath
}
$resolvedWorkDir = (Resolve-Path $WorkingDir -ErrorAction SilentlyContinue).Path
if (-not $resolvedWorkDir) {
    $resolvedWorkDir = $WorkingDir
}
$resolvedIcon = (Resolve-Path $IconPath -ErrorAction SilentlyContinue).Path
if (-not $resolvedIcon) {
    $resolvedIcon = $IconPath
}

# Repair PowerShell ANSI surrogate-pair mangling if present
if ($resolvedExe -like "*`?`? 2_Coding_and_Development*") {
    $folderEmoji = [char]0xD83D + [char]0xDCC2
    $resolvedExe = $resolvedExe.Replace("?? 2_Coding_and_Development", "$folderEmoji 2_Coding_and_Development")
    $resolvedWorkDir = $resolvedWorkDir.Replace("?? 2_Coding_and_Development", "$folderEmoji 2_Coding_and_Development")
}
if ($resolvedIcon -like "*`?`? 2_Coding_and_Development*") {
    $folderEmoji = [char]0xD83D + [char]0xDCC2
    $resolvedIcon = $resolvedIcon.Replace("?? 2_Coding_and_Development", "$folderEmoji 2_Coding_and_Development")
}

if (-not [System.IO.File]::Exists($resolvedExe)) {
    Write-Error "SETLIST.exe not found at $resolvedExe. Please build it first by running .\scripts\rebuild.ps1."
    exit 1
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
public class ShellLink {}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
public interface IShellLinkW {
    void GetPath(IntPtr pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription(IntPtr pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory(IntPtr pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments(IntPtr pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation(IntPtr pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

public class ShortcutHelper {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);

    public static void Create(string shortcutPath, string targetPath, string workingDir, string description, string iconPath) {
        IShellLinkW link = (IShellLinkW)new ShellLink();
        link.SetPath(targetPath);
        link.SetWorkingDirectory(workingDir);
        link.SetDescription(description);
        if (!string.IsNullOrEmpty(iconPath) && System.IO.File.Exists(iconPath)) {
            link.SetIconLocation(iconPath, 0);
        } else {
            link.SetIconLocation(targetPath, 0);
        }
        ((IPersistFile)link).Save(shortcutPath, true);
        // Refresh Windows icon and shell cache
        SHChangeNotify(0x08000000, 0, IntPtr.Zero, IntPtr.Zero);
    }
}
"@

[ShortcutHelper]::Create($ShortcutPath, $resolvedExe, $resolvedWorkDir, "SETLIST - DJ Set Assistant", $resolvedIcon)

Write-Host "Desktop shortcut created successfully:" -ForegroundColor Green
Write-Host "Shortcut: $ShortcutPath"
Write-Host "Target:   $resolvedExe"
Write-Host "WorkDir:  $resolvedWorkDir"
Write-Host "Icon:     $resolvedIcon"

if ($DesktopFolder -like "*OneDrive*") {
    Write-Host "Notice: Desktop is synced with OneDrive ($DesktopFolder)" -ForegroundColor Cyan
}
