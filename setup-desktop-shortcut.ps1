Add-Type -AssemblyName System.Drawing

$Dir       = $PSScriptRoot
$IconPath  = Join-Path $Dir 'cohere.ico'
$BatPath   = Join-Path $Dir 'launch-musicathon.bat'
$LinkName  = 'Cohear.lnk'
$LinkPath  = Join-Path ([Environment]::GetFolderPath('Desktop')) $LinkName

# Remove old shortcuts from earlier names.
foreach ($OldName in @('Reverb.lnk', 'Cohere.lnk', 'Musicathon.lnk')) {
    $OldLink = Join-Path ([Environment]::GetFolderPath('Desktop')) $OldName
    if (Test-Path $OldLink) { Remove-Item $OldLink -Force -EA SilentlyContinue }
}

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
$g.DrawPath((New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 244, 63, 94), 6)), $path)

# Concentric "in sync" rings — a shared pulse radiating from one point (Cohear).
$rose    = [System.Drawing.Color]::FromArgb(255, 244, 63, 94)
$fuchsia = [System.Drawing.Color]::FromArgb(255, 217, 70, 239)
$cx = 128; $cy = 128
$radii = @(34, 62, 90)
for ($i = 0; $i -lt $radii.Length; $i++) {
    $r2 = $radii[$i]
    $alpha = [int](235 - $i * 60)
    $col = [System.Drawing.Color]::FromArgb($alpha, $fuchsia.R, $fuchsia.G, $fuchsia.B)
    $pen = New-Object System.Drawing.Pen $col, 9
    $g.DrawEllipse($pen, ($cx - $r2), ($cy - $r2), ($r2 * 2), ($r2 * 2))
}
# Solid core dot.
$g.FillEllipse((New-Object System.Drawing.SolidBrush $rose), ($cx - 16), ($cy - 16), 32, 32)

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
$lnk.Description      = 'Launch Cohear (gateway + web) — find the biggest concerts'
$lnk.WindowStyle      = 7
$lnk.Save()

Write-Host "[ok] Shortcut placed on Desktop: $LinkName"
