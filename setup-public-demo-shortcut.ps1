Add-Type -AssemblyName System.Drawing

$Dir       = $PSScriptRoot
$IconPath  = Join-Path $Dir 'cohear.ico'
$BatPath   = Join-Path $Dir 'launch-public-demo.bat'
$LinkName  = 'Cohear Public Demo.lnk'
$LinkPath  = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName

if (!(Test-Path $BatPath)) {
  throw "Missing launcher: $BatPath"
}

if (!(Test-Path $IconPath)) {
  $size = 256
  $bmp  = New-Object System.Drawing.Bitmap $size, $size
  $g    = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(255, 10, 10, 15))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 34, 211, 238)), 8
  $g.DrawEllipse($pen, 32, 32, 192, 192)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 244, 63, 94))), 108, 108, 40, 40)
  $g.Dispose()

  $ms  = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $png = $ms.ToArray(); $ms.Close(); $bmp.Dispose()

  $fs = New-Object System.IO.FileStream $IconPath, 'Create'
  $bw = New-Object System.IO.BinaryWriter $fs
  $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
  $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$png.Length); $bw.Write([uint32]22)
  $bw.Write($png); $bw.Close(); $fs.Close()
}

$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LinkPath)
$lnk.TargetPath       = $BatPath
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation     = "$IconPath,0"
$lnk.Description      = 'Launch Cohear and publish a temporary Cloudflare URL for judges'
$lnk.WindowStyle      = 1
$lnk.Save()

Write-Host "[ok] Shortcut placed on Desktop: $LinkName"
