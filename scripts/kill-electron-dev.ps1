$ErrorActionPreference = "SilentlyContinue"

$projectPath = (Resolve-Path "$PSScriptRoot\..").Path
$projectName = Split-Path $projectPath -Leaf
$projectPathPattern = [Regex]::Escape($projectPath)
$projectNamePattern = [Regex]::Escape($projectName)

Write-Host "Looking for old dev processes in: $projectPath"

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -ieq "node.exe" -or $_.Name -ieq "electron.exe") -and
    $_.CommandLine -and
    (
      $_.CommandLine -match $projectPathPattern -or
      $_.CommandLine -match $projectNamePattern -or
      $_.CommandLine -match "electron[\\/]+main\.js"
    )
  }

$pidsToKill = @($processes | Select-Object -ExpandProperty ProcessId -Unique)

if ($pidsToKill.Count -eq 0) {
  Write-Host "No matching processes found."
  exit 0
}

Write-Host "Stopping processes: $($pidsToKill -join ', ')"

foreach ($procId in $pidsToKill) {
  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Write-Host "Stopped PID $procId"
  }
  catch {
    Write-Host "PID $procId already stopped or inaccessible."
  }
}

# Fallback for stale Vite instance that still owns strict dev port.
$portOwnerPids = @(
  Get-NetTCPConnection -LocalPort 3000 -State Listen |
    Select-Object -ExpandProperty OwningProcess -Unique
)

if ($portOwnerPids.Count -gt 0) {
  Write-Host "Port 3000 is still occupied by: $($portOwnerPids -join ', ')"
}

foreach ($procId in $portOwnerPids) {
  if ($pidsToKill -contains $procId) {
    continue
  }

  try {
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Write-Host "Stopped port owner PID $procId"
  }
  catch {
    Write-Host "Could not stop port owner PID $procId"
  }
}
