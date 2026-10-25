#requires -Version 5.1
# File-only fixture: never executes the dummy client, node or DLL.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $project ('.local\native-setup-tests\'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $scratch 'package'
$savedLocalData=$env:LOCALAPPDATA
$savedRecord=$env:TSIX_NATIVE_FIXTURE_RECORD
function Check($condition,$message){if(!$condition){throw $message}}
try{
    $env:LOCALAPPDATA=Join-Path $scratch 'profile'
    $client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak'
    $release=Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw | ConvertFrom-Json
    $paths=@('release.json','native\CEF-LICENSE.txt','runtime\node.exe','runtime\LICENSE','runtime\version.dll','tools\native-manager.mjs','tools\updates.mjs','tools\install-state.mjs','scripts\Native-Setup.ps1','scripts\Startup-Update.ps1','scripts\Runtime.ps1','scripts\Maintenance.ps1','scripts\Start-Inspection.ps1','scripts\Restore-LegacyShortcut.ps1','scripts\Remove-LegacyTheme.ps1','tools\restore.mjs','tools\appearance.mjs','tools\cdp.mjs','tools\client.mjs')+@($release.nativeLoader.dependencies)
    foreach($file in $paths){$target=Join-Path $source $file;New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null;'fixture' | Set-Content -LiteralPath $target}
    foreach($file in @('Native-Setup.ps1','Runtime.ps1','Maintenance.ps1')){Copy-Item -LiteralPath (Join-Path $project ('scripts\'+$file)) -Destination (Join-Path $source ('scripts\'+$file)) -Force}
    foreach($property in $release.supportedClient.nativeImages.PSObject.Properties){$file=Join-Path $client $property.Name;New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null;'client-fixture' | Set-Content -LiteralPath $file;$property.Value.sha256=(Get-FileHash -LiteralPath $file).Hash}
    foreach($property in $release.supportedClient.resourceHashes.PSObject.Properties){$file=Join-Path $client $property.Name;New-Item -ItemType Directory -Path (Split-Path -Parent $file) -Force | Out-Null;'ui-fixture' | Set-Content -LiteralPath $file;$release.supportedClient.resourceHashes.($property.Name)=(Get-FileHash -LiteralPath $file).Hash}
    $release | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $source 'release.json')
    $setup=Join-Path $source 'scripts\Native-Setup.ps1';$dll=Join-Path $client 'version.dll'
    'unowned' | Set-Content -LiteralPath $dll
    $refused=$false;try{& $setup}catch{$refused=$_.Exception.Message.Contains('unowned')}
    Check $refused 'Existing unrelated DLL was not refused'
    Check ((Get-Content -LiteralPath $dll -Raw).Trim() -eq 'unowned') 'Existing unrelated DLL was changed'
    Remove-Item -LiteralPath $dll
    & $setup
    $dataRoot=Join-Path $env:LOCALAPPDATA 'TS6-Layout'
    $updates=Join-Path $dataRoot 'updates';New-Item -ItemType Directory -Path $updates -Force | Out-Null
    $stub=Join-Path $updates ('TS6-Enhanced-'+$release.version+'-Setup.exe')
    $stubSource=Join-Path $scratch 'installer.cs'
    $env:TSIX_NATIVE_FIXTURE_RECORD=Join-Path $scratch 'installer-result.txt'
    @'
using System;using System.IO;using System.Linq;
class Fixture { static int Main(string[] args) { File.WriteAllLines(Environment.GetEnvironmentVariable("TSIX_NATIVE_FIXTURE_RECORD"),new[]{Environment.CurrentDirectory}.Concat(args));return 0; } }
'@ | Set-Content -LiteralPath $stubSource
    & (Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe') /nologo /target:exe ("/out:$stub") $stubSource
    if($LASTEXITCODE){throw 'Fixture installer compilation failed'}
    @{schema=2;mode='next-launch';fromVersion=$release.version;version=$release.version;path=$stub;sha256=(Get-FileHash -LiteralPath $stub).Hash} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataRoot 'pending-update.json')
    & $setup -Action ApplyPending
    $arguments=Get-Content -LiteralPath $env:TSIX_NATIVE_FIXTURE_RECORD
    Check ($arguments[0] -eq $dataRoot -and '/TSIXDEFERRED=1' -in $arguments -and '/TSIXNOOPEN=1' -in $arguments) 'Deferred native installer did not leave the client closed or used its payload directory'
    Check (!(Test-Path -LiteralPath (Join-Path $dataRoot 'pending-update.json'))) 'Successful deferred update retained its queue'
    $receipt=Join-Path $env:LOCALAPPDATA 'TS6-Layout\native-install.json'
    Check (Test-Path -LiteralPath $receipt) 'Native ownership receipt missing'
    & $setup
    $extra=Join-Path $client 'TS6-Enhanced\user-file.txt';'keep' | Set-Content -LiteralPath $extra
    $refused=$false;try{& $setup -Action Uninstall}catch{$refused=$_.Exception.Message.Contains('Unowned files')}
    Check ($refused -and (Test-Path -LiteralPath $dll) -and (Test-Path -LiteralPath $extra)) 'Removal did not preserve unowned files'
    Remove-Item -LiteralPath $extra
    & $setup -Action Uninstall
    Check (!(Test-Path -LiteralPath $dll) -and !(Test-Path -LiteralPath $receipt)) 'Owned native installation was not removed'
    Check (Test-Path -LiteralPath (Join-Path $client 'TeamSpeak.exe')) 'Vendor client was removed'
    Write-Output 'PASS: native install/update/removal, recovery ownership, and preservation of unrelated files.'
}finally{$env:LOCALAPPDATA=$savedLocalData;$env:TSIX_NATIVE_FIXTURE_RECORD=$savedRecord}
