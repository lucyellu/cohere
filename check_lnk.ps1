$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut("$env:USERPROFILE\Desktop\Cohear.lnk")
Write-Host "WorkingDirectory: $($lnk.WorkingDirectory)"
