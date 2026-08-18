Add-Type -AssemblyName System.Drawing

$Dir       = $PSScriptRoot
$IconPath  = Join-Path $Dir 'cohere.ico'
$BatPath   = Join-Path $Dir 'launch-musicathon.bat'
$LinkName  = 'Cohere.lnk'
$LinkPath  = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName

# Remove old shortcuts from earlier names.
foreach ($OldName in @('Reverb.lnk', 'Cohear.lnk', 'Musicathon.lnk')) {
    $OldLink = Join-Path ([Environment]::GetFolderPath('Desktop')) $OldName
    if (Test-Path $OldLink) { Remove-Item $OldLink -Force -EA SilentlyContinue }
}

# Use existing brand icon if available, or copy from web/public
if (-not (Test-Path $IconPath)) {
    $WebIcon = Join-Path $Dir 'web\public\cohere.ico'
    if (Test-Path $WebIcon) {
        Copy-Item $WebIcon $IconPath -Force
    }
}

# -- Build .lnk --
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LinkPath)
$lnk.TargetPath       = $BatPath
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation     = "$IconPath,0"
$lnk.Description      = 'Launch Cohear (gateway + web) — find the biggest concerts'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "[ok] Shortcut placed on Desktop: $LinkName"
