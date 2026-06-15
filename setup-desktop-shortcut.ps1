Add-Type -AssemblyName System.Drawing

$Dir       = $PSScriptRoot
$IconPath  = Join-Path $Dir 'musicathon.ico'
$BatPath   = Join-Path $Dir 'launch-musicathon.bat'
$LinkName  = 'Musicathon.lnk'
$LinkPath  = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName

# -- Draw 256x256 icon: equalizer bars (concert / audio dashboard) --
$size = 256
$bmp  = New-Object System.Drawing.Bitmap $size, $size
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'

# Rounded dark background
$bgRect = New-Object System.Drawing.Rectangle 4, 4, ($size - 8), ($size - 8)
$path   = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 32
$path.AddArc($bgRect.X,            $bgRect.Y,             $r*2, $r*2, 180, 90)
$path.AddArc($bgRect.Right - $r*2, $bgRect.Y,             $r*2, $r*2, 270, 90)
$path.AddArc($bgRect.Right - $r*2, $bgRect.Bottom - $r*2, $r*2, $r*2, 0,   90)
$path.AddArc($bgRect.X,            $bgRect.Bottom - $r*2, $r*2, $r*2, 90,  90)
$path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 10, 10, 15))), $path)
$g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 99, 102, 241), 6)), $path)

# Equalizer bars
$indigo  = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 99, 102, 241))
$emerald = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 52, 211, 153))
$baseline = 192
$barW = 22
$gap  = 12
$startX = 49
$heights = @(70, 120, 90, 150, 100)
for ($i = 0; $i -lt $heights.Length; $i++) {
    $h = $heights[$i]
    $x = $startX + $i * ($barW + $gap)
    $y = $baseline - $h
    $brush = if ($i -eq 3) { $emerald } else { $indigo }
    $g.FillRectangle($brush, $x, $y, $barW, $h)
}

$g.Dispose()

# -- Wrap PNG into ICO --
$ms  = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray(); $ms.Close(); $bmp.Dispose()

if (Test-Path $IconPath) { Remove-Item $IconPath -Force }
$fs = New-Object System.IO.FileStream $IconPath, 'Create'
$bw = New-Object System.IO.BinaryWriter $fs
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
$bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0)
$bw.Write([uint16]1); $bw.Write([uint16]32)
$bw.Write([uint32]$png.Length); $bw.Write([uint32]22)
$bw.Write($png); $bw.Close(); $fs.Close()

# -- Build .lnk --
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($LinkPath)
$lnk.TargetPath       = $BatPath
$lnk.WorkingDirectory = $Dir
$lnk.IconLocation     = "$IconPath,0"
$lnk.Description      = 'Launch the Musicathon dev stack (gateway + web) and open the dashboard'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "[ok] Shortcut placed on Desktop: $LinkName"
