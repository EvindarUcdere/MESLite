$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot

function Start-MESLiteProcess {
  param (
    [string] $Title,
    [string] $Directory,
    [string] $Command
  )

  $script = "cd `"$Directory`"; `$host.UI.RawUI.WindowTitle = `"$Title`"; $Command"

  Start-Process powershell.exe -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $script
}

Start-MESLiteProcess -Title "MES Lite Backend :4000" -Directory (Join-Path $root "backend") -Command "npm.cmd run dev"
Start-MESLiteProcess -Title "MES Lite Web :5173" -Directory (Join-Path $root "web") -Command "npm.cmd run dev -- --host 0.0.0.0"
Start-MESLiteProcess -Title "MES Lite Mobile Web :8081" -Directory (Join-Path $root "mobile") -Command "npm.cmd run web:clear"

Write-Host ""
Write-Host "MES Lite development servers are starting in separate PowerShell windows."
Write-Host ""
Write-Host "Backend API:  http://localhost:4000"
Write-Host "Web Panel:    http://localhost:5173"
Write-Host "Mobile Web:   http://localhost:8081"
Write-Host "Phone test:   cd mobile; npm.cmd run phone"
Write-Host ""
Write-Host "Login examples:"
Write-Host "Admin:        admin@meslite.local / Admin123!"
Write-Host "Manager:      manager@meslite.local / Admin123!"
Write-Host "Operator:     operator@meslite.local / Admin123!"
