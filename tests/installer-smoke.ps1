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
$bootstrap=@'
param([switch]$Prepare,[switch]$Uninstall,[switch]$RestartClient)
$scratch='@SCRATCH@'
if($Prepare){Add-Content -LiteralPath (Join-Path $scratch 'phases.txt') -Value 'prepare';if(Test-Path (Join-Path $scratch 'fail-prepare')){exit 7};exit 0}
if($Uninstall){Add-Content -LiteralPath (Join-Path $scratch 'phases.txt') -Value 'restore';if(Test-Path (Join-Path $scratch 'fail-restore')){exit 9};exit 0}
if(!$RestartClient){exit 8}
Add-Content -LiteralPath (Join-Path $scratch 'phases.txt') -Value 'activate'
exit 0
'@
$bootstrap.Replace('@SCRATCH@',$scratch.Replace("'","''")) | Set-Content -LiteralPath (Join-Path $payload 'scripts\Bootstrap.ps1')
$script=[IO.File]::ReadAllText((Join-Path $project 'installer\Setup.iss'))
$script=$script.Replace('AB06CE8F-2DB9-4F7A-96C5-A4D5874C3562',$id).Replace('DefaultDirName={localappdata}\TS6-Layout\app',('DefaultDirName='+$installed)).Replace('TS6 Enhanced',('TSIX isolated fixture '+$id))
$iss=Join-Path $scratch 'Fixture.iss';[IO.File]::WriteAllText($iss,$script)
& $Compiler /Q ("/DPayload=$payload") /DAppVersion=1.0.0 ("/O$output") $iss
if($LASTEXITCODE){throw 'Smoke fixture compilation failed'}
$exe=Join-Path $output ('TS6-Enhanced-1.0.0-Setup.exe')
function Invoke-Fixture([string]$Path){
    $p=Start-Process -FilePath $Path -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -WindowStyle Hidden -PassThru
    if(!$p.WaitForExit(45000)){$p.Kill();throw 'Isolated installer fixture timed out'}
    return $p.ExitCode
}
New-Item -ItemType File -Path (Join-Path $scratch 'fail-prepare') | Out-Null
if((Invoke-Fixture $exe) -eq 0 -or (Test-Path -LiteralPath $installed)){throw 'Failed preflight installed files'}
Remove-Item -LiteralPath (Join-Path $scratch 'fail-prepare')
if((Invoke-Fixture $exe) -ne 0){throw 'Isolated install failed'}
$uninstaller=Join-Path $installed 'unins000.exe'
if(!(Test-Path -LiteralPath $uninstaller)){throw 'Uninstaller was not retained'}
New-Item -ItemType File -Path (Join-Path $scratch 'fail-restore') | Out-Null
if((Invoke-Fixture $uninstaller) -eq 0){throw 'Failed restoration did not abort uninstall'}
if(!(Test-Path -LiteralPath (Join-Path $installed 'scripts\Bootstrap.ps1')) -or !(Test-Path -LiteralPath $uninstaller)){throw 'Failed restoration deleted maintenance tools'}
Remove-Item -LiteralPath (Join-Path $scratch 'fail-restore')
if((Invoke-Fixture $uninstaller) -ne 0){throw 'Successful fixture uninstall failed'}
if(Test-Path -LiteralPath (Join-Path $installed 'scripts\Bootstrap.ps1')){throw 'Successful uninstall retained the installed payload'}
$phases=Get-Content -LiteralPath (Join-Path $scratch 'phases.txt')
if(($phases -join ',') -ne 'prepare,prepare,activate,restore,restore'){throw "Unexpected installer phases: $phases"}
Write-Output 'PASS: compiled EXE preflight, embedded extraction, install, retained uninstaller, failed-restore abort before file deletion, and successful removal. Unique fixture AppId; TeamSpeak untouched.'
