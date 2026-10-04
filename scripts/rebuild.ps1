$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "Running release build from $RepoRoot..." -ForegroundColor Cyan
& pnpm tauri build --no-bundle
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

$ExePath = Join-Path $RepoRoot "target\release\SETLIST.exe"
if (-not (Test-Path $ExePath)) {
    Write-Error "Build finished but executable was not found at $ExePath."
    exit 1
}

$ExeItem = Get-Item $ExePath
Write-Host "Build succeeded!" -ForegroundColor Green
Write-Host "Path:          $($ExeItem.FullName)"
Write-Host "Size:          $([math]::Round($ExeItem.Length / 1MB, 2)) MB ($($ExeItem.Length) bytes)"
Write-Host "Last Modified: $($ExeItem.LastWriteTime)"
