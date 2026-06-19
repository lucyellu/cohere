$ErrorActionPreference = 'Continue'

$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebPort = 5173
$ApiPort = 5001
$Tmp = Join-Path $Dir 'tmp'
$UrlFile = Join-Path $Tmp 'public-url.txt'
$OutLog = Join-Path $Tmp 'cloudflared.out.log'
$ErrLog = Join-Path $Tmp 'cloudflared.err.log'
$Cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

if (!(Test-Path $Tmp)) { New-Item -ItemType Directory -Path $Tmp | Out-Null }
Remove-Item $UrlFile, $OutLog, $ErrLog -ErrorAction SilentlyContinue

function Test-Port($Port) {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

Write-Host ''
Write-Host 'Cohear Public Demo' -ForegroundColor Cyan
Write-Host '==================' -ForegroundColor Cyan

if (!(Test-Path $Cloudflared)) {
  Write-Host "cloudflared was not found at $Cloudflared" -ForegroundColor Red
  Write-Host 'Install Cloudflare Tunnel or update launch-public-demo.ps1.'
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host 'Restarting local Cohear gateway + web server...'
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine -match 'musicathon|concurrently|dev:gateway|dev:web|api-gateway|server\.js' -and $_.CommandLine -notmatch 'qmd' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Get-Process cloudflared -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue

Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', "cd /d `"$Dir`" && npm run dev") -WindowStyle Minimized

Write-Host "Waiting for http://localhost:$WebPort ..."
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  if (Test-Port $WebPort) { break }
  Start-Sleep -Seconds 1
}
if (!(Test-Port $WebPort)) {
  Write-Host "Timed out waiting for the web server on port $WebPort." -ForegroundColor Red
  Write-Host "Try opening http://localhost:$WebPort/ locally to debug."
  Read-Host 'Press Enter to close'
  exit 1
}

Write-Host 'Starting Cloudflare public tunnel...'
Write-Host 'Keep this window open while judges are using the URL.' -ForegroundColor Yellow

$proc = Start-Process `
  -FilePath $Cloudflared `
  -ArgumentList @('tunnel', '--url', "http://localhost:$WebPort") `
  -WorkingDirectory $Dir `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -PassThru

$deadline = (Get-Date).AddSeconds(60)
$publicUrl = $null
while ((Get-Date) -lt $deadline -and !$publicUrl) {
  Start-Sleep -Seconds 1
  if (Test-Path $ErrLog) {
    $text = Get-Content $ErrLog -Raw -ErrorAction SilentlyContinue
    $m = [regex]::Match($text, 'https://[-a-zA-Z0-9]+\.trycloudflare\.com')
    if ($m.Success) {
      $publicUrl = $m.Value
      Set-Content -Path $UrlFile -Value $publicUrl
    }
  }
}

if ($publicUrl) {
  Write-Host ''
  Write-Host 'Public Cohear URL:' -ForegroundColor Green
  Write-Host $publicUrl -ForegroundColor White
  Write-Host ''
  Write-Host 'Judges do not need an account or password.'
  Write-Host 'This temporary URL works while this PC is awake and this window remains open.'
  Start-Process $publicUrl
} else {
  Write-Host ''
  Write-Host 'No public URL was detected yet. Recent tunnel log:' -ForegroundColor Yellow
  if (Test-Path $ErrLog) { Get-Content $ErrLog -Tail 40 }
  Write-Host ''
  Write-Host "Local app: http://localhost:$WebPort/"
}

Write-Host ''
Read-Host 'Press Enter to stop the tunnel and close this window'
if ($proc -and !$proc.HasExited) {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
