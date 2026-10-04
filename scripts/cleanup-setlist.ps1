# ==============================================================================
# NOTE FOR AGENTS: Agents must not run this script.
# This script is strictly for human users to clean up any hanging or orphaned
# SETLIST processes and their associated WebView2 instances.
# ==============================================================================

$stoppedProcesses = [System.Collections.Generic.List[string]]::new()

# 1. Stop processes named SETLIST or app
$appProcesses = Get-Process -Name "SETLIST", "app" -ErrorAction SilentlyContinue
foreach ($proc in $appProcesses) {
    try {
        $info = "Stopped $($proc.ProcessName) (PID: $($proc.Id))"
        Stop-Process -Id $proc.Id -Force -ErrorAction Stop
        $stoppedProcesses.Add($info)
    } catch {
        Write-Warning "Failed to stop $($proc.ProcessName) (PID: $($proc.Id)): $_"
    }
}

# 2. Stop ONLY msedgewebview2.exe processes whose command line contains com.setlist.desktop
$webviews = Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" -ErrorAction SilentlyContinue
foreach ($wv in $webviews) {
    if ($wv.CommandLine -and $wv.CommandLine -like "*com.setlist.desktop*") {
        try {
            $info = "Stopped msedgewebview2.exe (PID: $($wv.ProcessId)) [com.setlist.desktop]"
            Stop-Process -Id $wv.ProcessId -Force -ErrorAction Stop
            $stoppedProcesses.Add($info)
        } catch {
            Write-Warning "Failed to stop msedgewebview2.exe (PID: $($wv.ProcessId)): $_"
        }
    }
}

# 3. Print report
if ($stoppedProcesses.Count -gt 0) {
    Write-Host "Cleanup completed. Terminated the following processes:" -ForegroundColor Green
    foreach ($item in $stoppedProcesses) {
        Write-Host " - $item"
    }
} else {
    Write-Host "No running SETLIST or associated WebView2 processes found." -ForegroundColor Yellow
}
