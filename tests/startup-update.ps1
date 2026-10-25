#requires -Version 7.0
# Compiles isolated stand-ins; never launches or closes the installed TeamSpeak.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$output=Join-Path $project ('.local\startup-update-build\'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output -Force | Out-Null
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$vs){throw 'Visual Studio C++ build tools are required for startup recovery tests'}
$vcvars=Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
foreach($path in @($output,$project,$vcvars)){if($path -match '["%\r\n!&|<>^]'){throw 'Unsupported build path'}}
$batch=Join-Path $output 'build.cmd'
[IO.File]::WriteAllLines($batch,@(
    '@echo off',('call "'+$vcvars+'" >nul'),'if errorlevel 1 exit /b 1',('cd /d "'+$output+'"'),
    ('cl /nologo /MT /O2 /W4 /WX /EHsc /std:c++20 /DUNICODE /D_UNICODE "'+$project+'\native\startup_update.cpp" "'+$project+'\tests\startup-client.cpp" crypt32.lib shell32.lib /Fe:TeamSpeak.exe'),
    'if errorlevel 1 exit /b 1'),[Text.UTF8Encoding]::new($false))
& $batch
if($LASTEXITCODE){throw 'Startup fixture compilation failed'}
$installer=Join-Path $output 'installer.exe'
& (Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe') /nologo /target:exe /r:System.Web.Extensions.dll ("/out:$installer") (Join-Path $PSScriptRoot 'startup-installer.cs')
if($LASTEXITCODE){throw 'Installer fixture compilation failed'}
& node (Join-Path $PSScriptRoot 'startup-update.mjs') (Join-Path $output 'TeamSpeak.exe') $installer
if($LASTEXITCODE){throw 'Startup recovery tests failed'}
