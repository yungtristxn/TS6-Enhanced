#requires -Version 7.0
# Compile the production Inno script against a harmless payload and unique AppId.
# The payload records phases only: it never touches TeamSpeak or its profile.
[CmdletBinding()]
param([string]$Compiler='C:\Program Files (x86)\Inno Setup 6\ISCC.exe')
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$id=[guid]::NewGuid().ToString()
$scratch=[IO.Path]::GetFullPath((Join-Path $project ('.local\installer-smoke\'+$id)))
$payload=Join-Path $scratch 'payload';$installed=Join-Path $scratch 'installed';$output=Join-Path $scratch 'output'
New-Item -ItemType Directory -Path (Join-Path $payload 'scripts'),$output -Force | Out-Null
'Isolated installer smoke test.' | Set-Content -LiteralPath (Join-Path $payload 'LICENSE')
New-Item -ItemType Directory -Path (Join-Path $payload 'runtime') -Force | Out-Null
'fixture runtime' | Set-Content -LiteralPath (Join-Path $payload 'runtime\node.exe')
$runtimeSha256=(Get-FileHash -LiteralPath (Join-Path $payload 'runtime\node.exe')).Hash.ToLowerInvariant()
$runtimeSize=(Get-Item -LiteralPath (Join-Path $payload 'runtime\node.exe')).Length
$bootstrap=@'
param([switch]$Prepare,[switch]$Uninstall,[switch]$RestartClient,[switch]$DeferredUpdate)
$scratch='@SCRATCH@'
$env:LOCALAPPDATA=Join-Path $scratch 'profile'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try {
if($Prepare){Add-Content -LiteralPath (Join-Path $scratch 'phases.txt') -Value 'prepare';if(Test-Path (Join-Path $scratch 'fail-prepare')){exit 7};exit 0}
if($Uninstall){Add-Content -LiteralPath (Join-Path $scratch 'phases.txt') -Value 'restore';if(Test-Path (Join-Path $scratch 'fail-restore')){exit 9};exit 0}
if($DeferredUpdate){Add-Content -LiteralPath (Join-Path $scratch 'phases.txt') -Value 'deferred';exit 0}
if(!$RestartClient){exit 8}
Add-Content -LiteralPath (Join-Path $scratch 'phases.txt') -Value 'activate'
exit 0
}finally{Exit-LayoutOperation $operation}
'@
$bootstrap.Replace('@SCRATCH@',$scratch.Replace("'","''")) | Set-Content -LiteralPath (Join-Path $payload 'scripts\Bootstrap.ps1')
Copy-Item (Join-Path $project 'scripts\Runtime.ps1') (Join-Path $payload 'scripts\Runtime.ps1')
$script=[IO.File]::ReadAllText((Join-Path $project 'installer\Setup.iss'))
$script=$script.Replace('AB06CE8F-2DB9-4F7A-96C5-A4D5874C3562',$id).Replace('{localappdata}\TS6-Layout\app',$installed).Replace('TS6 Enhanced',('TSIX isolated fixture '+$id))
$script=$script.Replace('{localappdata}\TS6-Layout\operation.lock',(Join-Path $scratch 'profile\TS6-Layout\operation.lock'))
$iss=Join-Path $scratch 'Fixture.iss';[IO.File]::WriteAllText($iss,$script)
foreach($define in @(@(),@('/DSlimUpdate'))){
    & $Compiler /Q ("/DPayload=$payload") /DAppVersion=1.0.0 /DAppDisplayVersion=1.0 ("/DRuntimeSize=$runtimeSize") '/DRuntimeVersion=none' @define ("/O$output") $iss
    if($LASTEXITCODE){throw 'Smoke fixture compilation failed'}
}
$exe=Join-Path $output ('TS6-Enhanced-1.0.0-Setup.exe');$slim=Join-Path $output ('TS6-Enhanced-1.0.0-Update.exe')
function Invoke-Fixture([string]$Path,[string[]]$Extra=@()){
    $p=Start-Process -FilePath $Path -ArgumentList (@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART')+$Extra) -WindowStyle Hidden -PassThru
    if(!$p.WaitForExit(45000)){$p.Kill();throw 'Isolated installer fixture timed out'}
    return $p.ExitCode
}
New-Item -ItemType File -Path (Join-Path $scratch 'fail-prepare') | Out-Null
if((Invoke-Fixture $exe) -eq 0 -or (Test-Path -LiteralPath $installed)){throw 'Failed preflight installed files'}
Remove-Item -LiteralPath (Join-Path $scratch 'fail-prepare')
. (Join-Path $project 'scripts\Runtime.ps1')
$previousLocalData=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $scratch 'profile'
$operation=$null
try{
    $operation=Enter-LayoutOperation
    $token=$env:TSIX_OPERATION_TOKEN;$env:TSIX_OPERATION_TOKEN=$null
    if((Invoke-Fixture $exe) -eq 0 -or (Test-Path $installed)){throw 'Independent Inno operation bypassed lifecycle exclusion'}
    $env:TSIX_OPERATION_TOKEN=$token
    if((Invoke-Fixture $exe) -ne 0){throw 'Installer child could not join its parent operation'}
}finally{Exit-LayoutOperation $operation;$env:LOCALAPPDATA=$previousLocalData}
# Queued updates: no preparation pass; an unchanged runtime is neither
# decompressed nor rewritten; a changed one is replaced. The slim package
# installs only as a queued update over the exact runtime it omits.
$runtime=Join-Path $installed 'runtime\node.exe'
if((Get-FileHash -LiteralPath $runtime).Hash.ToLowerInvariant() -ne $runtimeSha256){throw 'Full installer did not install the runtime'}
$stamp=[datetime]'2001-01-01';(Get-Item -LiteralPath $runtime).LastWriteTime=$stamp
if((Invoke-Fixture $exe @('/TSIXDEFERRED=1','/TSIXNOOPEN=1')) -ne 0){throw 'Deferred full update failed'}
if((Get-Item -LiteralPath $runtime).LastWriteTime -ne $stamp){throw 'An unchanged runtime was rewritten'}
'tampered runtime, different size' | Set-Content -LiteralPath $runtime
if((Invoke-Fixture $slim @('/TSIXDEFERRED=1','/TSIXNOOPEN=1')) -eq 0){throw 'Slim update installed over a different runtime'}
if((Invoke-Fixture $exe @('/TSIXDEFERRED=1','/TSIXNOOPEN=1')) -ne 0 -or (Get-FileHash -LiteralPath $runtime).Hash.ToLowerInvariant() -ne $runtimeSha256){throw 'Full update did not replace a changed runtime'}
if((Invoke-Fixture $slim) -eq 0){throw 'Slim update ran outside a queued update'}
'marker' | Set-Content -LiteralPath (Join-Path $installed 'LICENSE')
if((Invoke-Fixture $slim @('/TSIXDEFERRED=1','/TSIXNOOPEN=1')) -ne 0){throw 'Slim update failed over the matching runtime'}
if((Get-Content -LiteralPath (Join-Path $installed 'LICENSE') -Raw).Trim() -ne 'Isolated installer smoke test.'){throw 'Slim update did not install its files'}
if((Get-FileHash -LiteralPath $runtime).Hash.ToLowerInvariant() -ne $runtimeSha256){throw 'Slim update changed the runtime'}
$uninstaller=Join-Path $installed 'unins000.exe'
if(!(Test-Path -LiteralPath $uninstaller)){throw 'Uninstaller was not retained'}
$previousLocalData=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $scratch 'profile'
$operation=$null
try{
    $operation=Enter-LayoutOperation;$env:TSIX_OPERATION_TOKEN=$null
    if((Invoke-Fixture $uninstaller) -eq 0){throw 'Unattended uninstall bypassed lifecycle exclusion'}
    if(!(Test-Path (Join-Path $installed 'scripts\Bootstrap.ps1'))){throw 'Blocked uninstall removed installed files'}
}finally{Exit-LayoutOperation $operation;$env:LOCALAPPDATA=$previousLocalData}
New-Item -ItemType File -Path (Join-Path $scratch 'fail-restore') | Out-Null
if((Invoke-Fixture $uninstaller) -eq 0){throw 'Failed restoration did not abort uninstall'}
if(!(Test-Path -LiteralPath (Join-Path $installed 'scripts\Bootstrap.ps1')) -or !(Test-Path -LiteralPath $uninstaller)){throw 'Failed restoration deleted maintenance tools'}
Remove-Item -LiteralPath (Join-Path $scratch 'fail-restore')
if((Invoke-Fixture $uninstaller) -ne 0){throw 'Successful fixture uninstall failed'}
if(Test-Path -LiteralPath (Join-Path $installed 'scripts\Bootstrap.ps1')){throw 'Successful uninstall retained the installed payload'}
$phases=Get-Content -LiteralPath (Join-Path $scratch 'phases.txt')
if(($phases -join ',') -ne 'prepare,prepare,activate,deferred,deferred,deferred,restore,restore'){throw "Unexpected installer phases: $phases"}
Write-Output 'PASS: compiled EXE preflight, embedded extraction, install, queued updates without preparation or runtime rewrite, slim package guards, retained uninstaller, failed-restore abort before file deletion, and successful removal. Unique fixture AppId; TeamSpeak untouched.'
