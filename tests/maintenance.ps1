#requires -Version 5.1
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\Maintenance.ps1') -FunctionsOnly
$scratch=Join-Path $PSScriptRoot ('..\.local\maintenance-tests\'+[guid]::NewGuid().ToString('N'))
$scratch=[IO.Path]::GetFullPath($scratch)
New-Item -ItemType Directory -Path (Join-Path $scratch 'updates') -Force | Out-Null
$file=Join-Path $scratch 'updates\TS6-Enhanced-1.0.0-Setup.exe'
[IO.File]::WriteAllText($file,'fixture - never executable')
$pending=[pscustomobject]@{schema=2;mode='next-launch';version='1.0.0';path=$file;sha256=(Get-FileHash $file).Hash}
if((Assert-UpdateInstaller $pending $scratch) -ne $file){throw 'Valid staged installer not recognized'}
$pending.path=Join-Path $scratch '..\escape.exe';$refused=$false
try{Assert-UpdateInstaller $pending $scratch}catch{$refused=$true};if(!$refused){throw 'Escaping installer path was accepted'}
$pending.path=$file;$pending.sha256='0'*64;$refused=$false
try{Assert-UpdateInstaller $pending $scratch}catch{$refused=$true};if(!$refused){throw 'Changed installer was accepted'}
$script:running=$true;$script:closed=0
function Get-Process {param($Name,$ErrorAction) if($script:running){$p=[pscustomobject]@{Path='C:\fixture\TeamSpeak.exe';MainWindowHandle=1};$p|Add-Member ScriptMethod CloseMainWindow {$script:closed++;$script:running=$false;return $true};$renderer=[pscustomobject]@{Path='C:\fixture\TeamSpeak.exe';MainWindowHandle=0};$renderer|Add-Member ScriptMethod CloseMainWindow {throw 'Renderer must never be closed directly'};return @($renderer,$p)}}
Stop-LayoutClient 'C:\fixture\TeamSpeak.exe'
if($script:closed -ne 1 -or $script:running){throw 'Graceful close did not complete'}
$script:running=$true;$script:closed=0
Stop-LayoutClient 'C:\other\TeamSpeak.exe'
if($script:closed -ne 0){throw 'An unrelated process was closed'}
function Get-Process {param($Name,$ErrorAction) $p=[pscustomobject]@{Path='C:\fixture\TeamSpeak.exe';MainWindowHandle=1};$p|Add-Member ScriptMethod CloseMainWindow {return $false};return $p}
$refused=$false;try{Stop-LayoutClient 'C:\fixture\TeamSpeak.exe'}catch{$refused=$true};if(!$refused){throw 'A refusal to close was ignored'}
Write-Output 'PASS: managed update path, checksums, graceful restart, process identity and refusal without force-kill.'

# Cross-process admission: a child joins its parent's operation, independent
# operations refuse before mutation, and the child retains exclusion if the
# parent finishes first. All paths are isolated from the installed client.
$previousLocalData=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $scratch 'profile'
$childScript=Join-Path $scratch 'operation-child.ps1'
@'
param($Runtime,$Ready,$Release,[switch]$Independent)
$ErrorActionPreference='Stop'
. $Runtime
if($Independent){$env:TSIX_OPERATION_TOKEN=$null}
try{$operation=Enter-LayoutOperation}catch{exit 23}
try{
    'admitted' | Set-Content -LiteralPath $Ready
    if($Release){$deadline=[DateTime]::UtcNow.AddSeconds(15);while(!(Test-Path $Release)){if([DateTime]::UtcNow -gt $deadline){throw 'Fixture release timed out'};Start-Sleep -Milliseconds 50}}
}finally{Exit-LayoutOperation $operation}
'@ | Set-Content $childScript
$runtime=Join-Path $project 'scripts\Runtime.ps1'
if(!$project){$runtime=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\scripts\Runtime.ps1'))}
$ready=Join-Path $scratch 'child-ready';$release=Join-Path $scratch 'child-release';$refusedMarker=Join-Path $scratch 'must-not-exist'
$operation=$null;$child=$null
try{
    $operation=Enter-LayoutOperation
    & (Get-LayoutPowerShell) -NoProfile -File $childScript $runtime $refusedMarker -Independent
    if($LASTEXITCODE -ne 23 -or (Test-Path $refusedMarker)){throw 'Concurrent lifecycle operation reached mutation'}
    $child=Start-Process -FilePath (Get-LayoutPowerShell) -ArgumentList @('-NoProfile','-File',('"'+$childScript+'"'),('"'+$runtime+'"'),('"'+$ready+'"'),('"'+$release+'"')) -WindowStyle Hidden -PassThru
    $deadline=[DateTime]::UtcNow.AddSeconds(10)
    while(!(Test-Path $ready)){if($child.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Child did not inherit the operation'};Start-Sleep -Milliseconds 50}
    Exit-LayoutOperation $operation;$operation=$null
    & (Get-LayoutPowerShell) -NoProfile -File $childScript $runtime $refusedMarker -Independent
    if($LASTEXITCODE -ne 23 -or (Test-Path $refusedMarker)){throw 'Parent exit released the child operation prematurely'}
    'finish' | Set-Content $release
    if(!$child.WaitForExit(10000) -or $child.ExitCode -ne 0){throw 'Child operation did not complete'}
    $operation=Enter-LayoutOperation
    Write-Output 'PASS: lifecycle exclusion, explicit child handoff, child lifetime and reacquisition.'
}finally{
    if($child){'finish' | Set-Content $release;$child.Dispose()}
    Exit-LayoutOperation $operation;$env:LOCALAPPDATA=$previousLocalData
}
