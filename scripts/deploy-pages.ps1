param(
  [string]$Branch = "main",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$projectName = "jcc-web-mvp"
$distPath = "dist"
$preferredProxy = "http://127.0.0.1:7897"
$staleProxy = "http://127.0.0.1:7890"

function Test-LocalPort {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    return $task.Wait(1000) -and $client.Connected
  } finally {
    $client.Dispose()
  }
}

function Set-ProcessProxy {
  param([string]$Proxy)

  $env:http_proxy = $Proxy
  $env:https_proxy = $Proxy
  $env:HTTP_PROXY = $Proxy
  $env:HTTPS_PROXY = $Proxy
}

function Clear-ProcessProxy {
  Remove-Item Env:http_proxy -ErrorAction SilentlyContinue
  Remove-Item Env:https_proxy -ErrorAction SilentlyContinue
  Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
  Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
}

$currentProxy = $env:https_proxy
if (-not $currentProxy) {
  $currentProxy = $env:HTTPS_PROXY
}

if ($currentProxy -eq $staleProxy) {
  if (Test-LocalPort -Port 7897) {
    Write-Host "Detected stale proxy 127.0.0.1:7890; using 127.0.0.1:7897 for this deployment."
    Set-ProcessProxy -Proxy $preferredProxy
  } else {
    Write-Host "Detected stale proxy 127.0.0.1:7890 and 127.0.0.1:7897 is unavailable; clearing proxy for this deployment."
    Clear-ProcessProxy
  }
} elseif ($currentProxy -eq $preferredProxy -and -not (Test-LocalPort -Port 7897)) {
  Write-Host "Proxy 127.0.0.1:7897 is configured but unavailable; clearing proxy for this deployment."
  Clear-ProcessProxy
}

if ($DryRun) {
  Write-Host "Dry run: would deploy $distPath to Cloudflare Pages project $projectName on branch $Branch."
  Write-Host "http_proxy=$env:http_proxy"
  Write-Host "https_proxy=$env:https_proxy"
  exit 0
}

npx wrangler pages deploy $distPath --project-name $projectName --branch $Branch