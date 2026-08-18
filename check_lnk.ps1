$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut("$env:USERPROFILE\Desktop\Cohere.lnk")
Write-Host "WorkingDirectory: $($lnk.WorkingDirectory)"
