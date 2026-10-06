param(
    [switch]$SkipGates
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if (-not $SkipGates) {
    Write-Host "Running SETLIST quality gates..." -ForegroundColor Cyan

    Write-Host "[1/5] cargo fmt --check" -ForegroundColor Cyan
    & cargo fmt --check
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Quality Gate [1/5] failed: cargo fmt --check"
        exit $LASTEXITCODE
    }

    Write-Host "[2/5] cargo clippy --workspace -- -D warnings" -ForegroundColor Cyan
    & cargo clippy --workspace -- -D warnings
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Quality Gate [2/5] failed: cargo clippy"
        exit $LASTEXITCODE
    }

    Write-Host "[3/5] cargo test --workspace" -ForegroundColor Cyan
    & cargo test --workspace
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Quality Gate [3/5] failed: cargo test"
        exit $LASTEXITCODE
    }

    Write-Host "[4/5] pnpm --dir ui typecheck" -ForegroundColor Cyan
    & pnpm --dir ui typecheck
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Quality Gate [4/5] failed: ui typecheck"
        exit $LASTEXITCODE
    }

    Write-Host "[5/5] pnpm --dir ui test" -ForegroundColor Cyan
    & pnpm --dir ui test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Quality Gate [5/5] failed: ui test"
        exit $LASTEXITCODE
    }

    Write-Host "All 5 quality gates passed successfully!" -ForegroundColor Green
}

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

# Refresh desktop shortcut to point to latest binary
$ShortcutScript = Join-Path $PSScriptRoot "make-desktop-shortcut.ps1"
if (Test-Path $ShortcutScript) {
    Write-Host "Refreshing desktop shortcut..." -ForegroundColor Cyan
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ShortcutScript
}
