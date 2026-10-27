#requires -Version 7.0
# Actual restart worker and installer handoff, under disposable LOCALAPPDATA.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$output=Join-Path $project ('.local\restart-worker-build\'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output -Force | Out-Null
$compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /r:System.Web.Extensions.dll ("/out:"+(Join-Path $output 'TeamSpeak.exe')) (Join-Path $PSScriptRoot 'restart-client.cs')
if($LASTEXITCODE){throw 'Restart client fixture compilation failed'}
& $compiler /nologo /target:exe /r:System.Web.Extensions.dll ("/out:"+(Join-Path $output 'installer.exe')) (Join-Path $PSScriptRoot 'startup-installer.cs')
if($LASTEXITCODE){throw 'Restart installer fixture compilation failed'}
& node (Join-Path $PSScriptRoot 'restart-update.mjs') (Join-Path $output 'TeamSpeak.exe') (Join-Path $output 'installer.exe')
if($LASTEXITCODE){throw 'Restart worker tests failed'}
