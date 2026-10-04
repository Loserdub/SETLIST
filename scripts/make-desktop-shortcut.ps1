$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExePath = Join-Path $RepoRoot "target\release\SETLIST.exe"

if (-not (Test-Path $ExePath)) {
    Write-Error "SETLIST.exe not found at $ExePath. Please build it first by running .\scripts\rebuild.ps1."
    exit 1
}

$DesktopFolder = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopFolder "SETLIST.lnk"
$WorkingDir = Split-Path -Parent $ExePath

$resolvedExe = (Resolve-Path $ExePath).Path
$resolvedWorkDir = (Resolve-Path $WorkingDir).Path

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
    public static void Create(string shortcutPath, string targetPath, string workingDir, string description) {
        IShellLinkW link = (IShellLinkW)new ShellLink();
        link.SetPath(targetPath);
        link.SetWorkingDirectory(workingDir);
        link.SetDescription(description);
        link.SetIconLocation(targetPath, 0);
        ((IPersistFile)link).Save(shortcutPath, true);
    }
}
"@

[ShortcutHelper]::Create($ShortcutPath, $resolvedExe, $resolvedWorkDir, "SETLIST - DJ Set Assistant")

Write-Host "Desktop shortcut created successfully:" -ForegroundColor Green
Write-Host "Shortcut: $ShortcutPath"
Write-Host "Target:   $resolvedExe"
Write-Host "WorkDir:  $resolvedWorkDir"

if ($DesktopFolder -like "*OneDrive*") {
    Write-Host "Notice: Desktop is synced with OneDrive ($DesktopFolder)" -ForegroundColor Cyan
}
