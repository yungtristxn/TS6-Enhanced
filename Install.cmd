@echo off
setlocal
set "PSModulePath=%SystemRoot%\System32\WindowsPowerShell\v1.0\Modules"
title TS6 Enhanced Setup
if not exist "%~dp0scripts\Bootstrap.ps1" (
  echo Extract the whole ZIP first, then double-click Install.cmd in the extracted folder.
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Bootstrap.ps1"
set "result=%errorlevel%"
echo.
pause
exit /b %result%
