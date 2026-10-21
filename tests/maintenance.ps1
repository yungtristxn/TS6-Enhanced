#requires -Version 7.0
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\scripts\Maintenance.ps1') -FunctionsOnly
$scratch=Join-Path $PSScriptRoot ('..\.local\maintenance-tests\'+[guid]::NewGuid().ToString('N'))
$scratch=[IO.Path]::GetFullPath($scratch)
New-Item -ItemType Directory -Path (Join-Path $scratch 'updates') -Force | Out-Null
$file=Join-Path $scratch 'updates\TS6-Enhanced-1.0.0-Setup.exe'
[IO.File]::WriteAllText($file,'fixture - never executable')
$pending=[pscustomobject]@{schema=1;version='1.0.0';path=$file;sha256=(Get-FileHash $file).Hash}
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
