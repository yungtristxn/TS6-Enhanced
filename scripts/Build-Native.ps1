#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputDirectory,[string]$SdkDirectory)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
if(!$OutputDirectory){$OutputDirectory=Join-Path $project '.local\native-build'}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
. (Join-Path $PSScriptRoot 'Runtime.ps1')
Assert-LayoutPlainPath $OutputDirectory
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$lock=Get-Content -LiteralPath (Join-Path $project 'native\cef.lock.json') -Raw | ConvertFrom-Json
if(!$SdkDirectory){
    $cache=Join-Path $project '.local\cef-sdk'
    $SdkDirectory=Join-Path $cache $lock.directory
    if(!(Test-Path -LiteralPath (Join-Path $SdkDirectory 'include\capi\cef_app_capi.h'))){
        New-Item -ItemType Directory -Path $cache -Force | Out-Null
        $archive=Join-Path $cache 'cef-sdk.tar.bz2'
        if(!(Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri $lock.url -OutFile $archive}
        if((Get-FileHash -LiteralPath $archive).Hash -ine $lock.sha256){throw 'CEF SDK checksum mismatch'}
        & tar -xjf $archive -C $cache ($lock.directory+'/include')
        if($LASTEXITCODE){throw 'CEF SDK extraction failed'}
    }
}
$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs=& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if(!$vs){throw 'Install Visual Studio C++ build tools before building the native loader.'}
$vcvars=Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
& node (Join-Path $project 'tools\build-native.mjs') $OutputDirectory
if($LASTEXITCODE){throw 'Native payload generation failed'}
# All paths are fixed build inputs; reject CMD expansion characters.
foreach($path in @($OutputDirectory,$SdkDirectory,$project,$vcvars)){if($path -match '["%\r\n!&|<>^]'){throw 'Unsupported characters in native build path'}}
$commands=@(
    '@echo off',
    ('call "'+$vcvars+'" >nul'),
    'if errorlevel 1 exit /b 1',
    ('cd /d "'+$OutputDirectory+'"'),
    ('lib /nologo /machine:x64 /def:"'+$project+'\native\version.def" /out:version.lib'),
    'if errorlevel 1 exit /b 1',
    'rc /nologo /fo payload.res payload.rc',
    'if errorlevel 1 exit /b 1',
    ('cl /nologo /LD /MT /O2 /W4 /WX /EHsc /guard:cf /std:c++20 /DUNICODE /D_UNICODE /I"'+$SdkDirectory+'" /I"'+$OutputDirectory+'" "'+$project+'\native\loader.cpp" "'+$project+'\native\runtime.cpp" version.exp payload.res bcrypt.lib /link /OUT:version.dll /DYNAMICBASE /NXCOMPAT'),
    'if errorlevel 1 exit /b 1',
    'dumpbin /nologo /exports version.dll > exports.txt'
)
$batch=Join-Path $OutputDirectory 'build.cmd'
[IO.File]::WriteAllLines($batch,$commands,[Text.UTF8Encoding]::new($false))
& $batch
if($LASTEXITCODE){throw 'Native loader compilation failed'}
Write-Output (Join-Path $OutputDirectory 'version.dll')
