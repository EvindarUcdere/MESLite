param(
  [switch] $SkipMobile,
  [switch] $SkipWeb
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root "logs"
New-Item -ItemType Directory -Path $logs -Force | Out-Null

function Get-LanIPv4 {
  try {
    $socket = [System.Net.Sockets.UdpClient]::new()
    $socket.Connect("8.8.8.8", 65530)
    $address = ([System.Net.IPEndPoint] $socket.Client.LocalEndPoint).Address.ToString()
    $socket.Dispose()
    if ($address -and $address -ne "127.0.0.1") {
      return $address
    }
  } catch {
    # Fall through to DNS-based discovery when no default route is available.
  }

  $candidate = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object {
      $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
      $_.IPAddressToString -ne "127.0.0.1"
    } |
    Select-Object -First 1

  if (-not $candidate) {
    throw "Yerel IPv4 adresi bulunamadi. Wi-Fi veya Ethernet baglantisini kontrol edin."
  }

  return $candidate.IPAddressToString
}

function Test-PortAvailable {
  param([int] $Port)

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Find-FreePort {
  param(
    [int] $PreferredPort,
    [int] $SearchLimit = 20
  )

  for ($port = $PreferredPort; $port -lt ($PreferredPort + $SearchLimit); $port++) {
    if (Test-PortAvailable -Port $port) {
      return $port
    }
  }

  throw "$PreferredPort portundan itibaren bos port bulunamadi."
}

function Test-MESBackend {
  param([int] $Port)

  try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
    return $response.status -eq "ok" -and $response.service -eq "mes-lite-api"
  } catch {
    return $false
  }
}

function Wait-Http {
  param(
    [string] $Url,
    [int] $TimeoutSeconds = 35
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 700
      continue
    }
    Start-Sleep -Milliseconds 700
  }

  return $false
}

function Start-LoggedProcess {
  param(
    [string] $Name,
    [string] $Directory,
    [string] $Command,
    [string] $LogPrefix
  )

  $stdout = Join-Path $logs "$LogPrefix.out.log"
  $stderr = Join-Path $logs "$LogPrefix.err.log"
  $script = "Set-Location -LiteralPath '$($Directory.Replace("'", "''"))'; `$host.UI.RawUI.WindowTitle = '$Name'; $Command"

  return Start-Process powershell.exe `
    -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $script `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru
}

$lanIp = Get-LanIPv4
$runtimePath = Join-Path $logs "dev-runtime.json"
$previousRuntime = $null
if (Test-Path -LiteralPath $runtimePath) {
  try {
    $previousRuntime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
  } catch {
    $previousRuntime = $null
  }
}

$backendPort = 4000
$backendReused = Test-MESBackend -Port $backendPort

if (-not $backendReused) {
  $backendPort = Find-FreePort -PreferredPort 4000
}

$webReused = $false
$webPort = $null
if (-not $SkipWeb -and $previousRuntime.web -and $previousRuntime.web.pid) {
  $previousWebProcess = Get-Process -Id $previousRuntime.web.pid -ErrorAction SilentlyContinue
  $sameWebApi = $previousRuntime.lanIp -eq $lanIp -and [int] $previousRuntime.backend.port -eq $backendPort
  if ($previousWebProcess -and $sameWebApi -and (Wait-Http -Url "http://127.0.0.1:$($previousRuntime.web.port)" -TimeoutSeconds 2)) {
    $webPort = [int] $previousRuntime.web.port
    $webReused = $true
  }
}
if (-not $SkipWeb -and -not $webReused) {
  $webPort = Find-FreePort -PreferredPort 5173
}

$expoReused = $false
$expoPort = $null
if (-not $SkipMobile -and $previousRuntime.mobile -and $previousRuntime.mobile.pid) {
  $previousExpoProcess = Get-Process -Id $previousRuntime.mobile.pid -ErrorAction SilentlyContinue
  $sameApi = $previousRuntime.mobile.apiUrl -eq "http://${lanIp}:$backendPort/api"
  if ($previousExpoProcess -and $sameApi -and -not (Test-PortAvailable -Port $previousRuntime.mobile.port)) {
    $expoPort = [int] $previousRuntime.mobile.port
    $expoReused = $true
  }
}
if (-not $SkipMobile -and -not $expoReused) {
  $expoPort = Find-FreePort -PreferredPort 8081
}
$apiUrl = "http://${lanIp}:$backendPort/api"
$webUrl = if ($webPort) { "http://${lanIp}:$webPort" } else { $null }
$expoUrl = if ($expoPort) { "exp://${lanIp}:$expoPort" } else { $null }

$processes = @{}

if (-not $backendReused) {
  $corsOrigins = @(
    "http://localhost:$webPort",
    "http://${lanIp}:$webPort",
    "http://localhost:$expoPort",
    "http://${lanIp}:$expoPort"
  ) | Where-Object { $_ -notmatch ':$' }
  $corsValue = $corsOrigins -join ","
  $backendCommand = "`$env:PORT='$backendPort'; `$env:CORS_ORIGINS='$corsValue'; npm.cmd run start"
  $processes.backend = Start-LoggedProcess -Name "MES Lite Backend :$backendPort" -Directory (Join-Path $root "backend") -Command $backendCommand -LogPrefix "backend-live"
}

if (-not $SkipWeb -and -not $webReused) {
  $webCommand = "`$env:VITE_API_URL='$apiUrl'; npm.cmd run dev -- --host 0.0.0.0 --port $webPort"
  $processes.web = Start-LoggedProcess -Name "MES Lite Web :$webPort" -Directory (Join-Path $root "web") -Command $webCommand -LogPrefix "web-live"
}

if (-not $SkipMobile -and -not $expoReused) {
  $mobileCommand = "`$env:EXPO_PUBLIC_EDGE_API_URL='$apiUrl'; npm.cmd exec expo start -- --offline --clear --port $expoPort"
  $processes.mobile = Start-LoggedProcess -Name "MES Lite Expo :$expoPort" -Directory (Join-Path $root "mobile") -Command $mobileCommand -LogPrefix "expo-live"
}

$backendReady = if ($backendReused) { $true } else { Wait-Http -Url "http://127.0.0.1:$backendPort/health" }
$webReady = if ($SkipWeb) { $null } elseif ($webReused) { $true } else { Wait-Http -Url "http://127.0.0.1:$webPort" }

if ($expoUrl) {
  node (Join-Path $PSScriptRoot "generate-expo-qr.cjs") $expoUrl (Join-Path $logs "expo-go-qr.svg") | Out-Null
}

$runtime = [ordered]@{
  startedAt = (Get-Date).ToString("o")
  lanIp = $lanIp
  backend = [ordered]@{ url = "http://${lanIp}:$backendPort"; port = $backendPort; ready = $backendReady; reused = $backendReused; pid = $processes.backend.Id }
  web = if ($SkipWeb) { $null } else { [ordered]@{ url = $webUrl; port = $webPort; ready = $webReady; reused = $webReused; pid = $(if ($webReused) { $previousRuntime.web.pid } else { $processes.web.Id }) } }
  mobile = if ($SkipMobile) { $null } else { [ordered]@{ url = $expoUrl; port = $expoPort; ready = $true; reused = $expoReused; pid = $(if ($expoReused) { $previousRuntime.mobile.pid } else { $processes.mobile.Id }); apiUrl = $apiUrl } }
}
$runtime | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $runtimePath -Encoding UTF8

Write-Host ""
Write-Host "MES Lite servisleri baslatildi" -ForegroundColor Green
Write-Host "Backend : http://${lanIp}:$backendPort  $(if ($backendReady) { '[HAZIR]' } else { '[KONTROL EDIN]' })"
if ($webUrl) {
  Write-Host "Web     : $webUrl  $(if ($webReady) { '[HAZIR]' } else { '[KONTROL EDIN]' })"
}
if ($expoUrl) {
  Write-Host "Expo Go : $expoUrl"
  Write-Host "QR      : $(Join-Path $logs 'expo-go-qr.svg')"
}
Write-Host "Loglar  : $logs"
Write-Host ""
