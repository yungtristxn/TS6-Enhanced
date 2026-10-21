#requires -Version 5.1
# Isolated files and mocked processes; never starts an installer or TeamSpeak.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$previousLocalData=$env:LOCALAPPDATA
$scratch=Join-Path $project ('.local\deferred-update-tests\'+[guid]::NewGuid().ToString('N'))
$env:LOCALAPPDATA=$scratch
$root=Join-Path $scratch 'TS6-Layout'
$client=Join-Path $scratch 'Programs\TeamSpeak\TeamSpeak.exe'
$installer=Join-Path $root 'updates\TS6-Enhanced-9.0.0-Setup.exe'
New-Item -ItemType Directory -Path (Split-Path $installer),(Join-Path (Split-Path $client) 'html\client_ui') -Force | Out-Null
[IO.File]::WriteAllText($installer,'fixture only - never executable')
$hashes=@{}
foreach($file in @('html/client_ui/main.js','html/client_ui/main.css')){
    $path=Join-Path (Split-Path $client) $file
    [IO.File]::WriteAllText($path,'fixture')
    $hashes[$file]=(Get-FileHash $path).Hash
}
$current=(Get-Content (Join-Path $project 'release.json') -Raw | ConvertFrom-Json).version
$pending=Join-Path $root 'pending-update.json'
@{schema=2;mode='next-launch';fromVersion=$current;version='9.0.0';path=$installer;sha256=(Get-FileHash $installer).Hash;resourceHashes=$hashes} | ConvertTo-Json -Depth 5 | Set-Content $pending -Encoding UTF8
$receiptBytes=[IO.File]::ReadAllBytes($pending)
$fixtureState=[pscustomobject]@{running=$true;launched=0}
function Get-Process {param($Name,$ErrorAction) if($fixtureState.running){[pscustomobject]@{Path=$client}}}
function Start-Process {
    param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru)
    if($fixtureState.running){throw 'An installer was launched while the client was running'}
    if($FilePath -ne $installer -or '/TSIXDEFERRED=1' -notin $ArgumentList){throw 'Deferred installer mode was lost'}
    $fixtureState.launched++
    $job=[pscustomobject]@{ExitCode=0}
    $job | Add-Member ScriptMethod WaitForExit {}
    $job | Add-Member ScriptMethod Dispose {}
    return $job
}
try {
    $refused=$false
    try{& (Join-Path $project 'scripts\Maintenance.ps1') -Action Update}catch{if(!$_.Exception.Message.Contains('left running')){throw};$refused=$true}
    if(!$refused -or $fixtureState.launched -or !(Test-Path $pending)){throw 'An open client was not preserved'}
    $fixtureState.running=$false
    & (Join-Path $project 'scripts\Maintenance.ps1') -Action Update
    if($fixtureState.launched -ne 1 -or (Test-Path $pending)){throw 'Closed-client update did not complete exactly once'}
    [IO.File]::WriteAllBytes($pending,$receiptBytes)
    & (Join-Path $project 'scripts\Start-Layout.ps1')
    if($fixtureState.launched -ne 2 -or (Test-Path $pending)){throw 'Normal launch did not consume its queued installer'}
    Write-Output 'PASS: running client refusal, deferred installer flag and queue consumption on normal launch.'
}finally{$env:LOCALAPPDATA=$previousLocalData}
