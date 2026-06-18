@echo off
setlocal enabledelayedexpansion

set WEB=5173
set API=5001
set DIR=%~dp0

rem --- Fast path: if a healthy stack is already up (BOTH ports), just open ----
set WEBUP=
set APIUP=
netstat -ano | findstr ":%WEB% " | findstr LISTENING >nul 2>&1 && set WEBUP=1
netstat -ano | findstr ":%API% " | findstr LISTENING >nul 2>&1 && set APIUP=1
if defined WEBUP if defined APIUP (
    echo Cohear already running. Opening...
    goto open
)

rem --- Otherwise clean up stale/partial Cohear processes so they don't pile up.
rem Matches ONLY this project's dev stack; spares qmd and any other node app.
echo Cleaning up old Cohear processes...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'name=''node.exe''' | Where-Object { $_.CommandLine -and ($_.CommandLine -match 'musicathon|concurrently|dev:gateway|dev:web|api-gateway|server\.js') -and ($_.CommandLine -notmatch 'qmd') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

rem Free the ports too, in case something else parked on them.
for %%P in (%WEB% %API%) do for /f "tokens=5" %%K in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do taskkill /PID %%K /F >nul 2>&1

echo Starting Cohear dev stack ^(gateway :%API% + web :%WEB%^)...
start /min "" cmd /c "cd /d %DIR% && npm run dev"

rem --- Wait until the web server actually accepts connections (no fixed sleep) -
echo Waiting for the web server to come up...
set /a tries=0
:waitloop
netstat -ano | findstr ":%WEB% " | findstr LISTENING >nul 2>&1
if %errorlevel%==0 goto ready
set /a tries+=1
if !tries! geq 60 (
    echo Timed out after !tries!s waiting for port %WEB%. Opening anyway...
    goto ready
)
timeout /t 1 /nobreak >nul
goto waitloop

:ready
rem Small grace so Vite finishes its first compile before the page loads.
timeout /t 1 /nobreak >nul

:open
rem --- Open in Chrome app-mode if available, else the default browser --------
set CHROME=
for %%P in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%P set CHROME=%%P
)

if defined CHROME (
    start "" !CHROME! --app="http://localhost:%WEB%/"
) else (
    start "" "http://localhost:%WEB%/"
)

endlocal
