#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][guid]$SessionId)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$root=Join-Path $env:LOCALAPPDATA 'TS6-Layout'
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
$operation=Enter-LayoutOperation
$closed=$false
try {
    $metadata=Get-Content -LiteralPath (Join-Path $root 'update-session.json') -Raw|ConvertFrom-Json
    if($metadata.schema -ne 1 -or $metadata.id -ne $SessionId.ToString() -or $metadata.phase -notin @('captured','armed') -or $metadata.expiresAt -lt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'Update session was not prepared or has expired'}
    $pending=Get-Content -LiteralPath (Join-Path $root 'pending-update.json') -Raw|ConvertFrom-Json
    if($pending.version -cne $metadata.targetVersion){throw 'The queued update changed after confirmation'}
    $null=& {param($entry,$dataRoot,$script) . $script -FunctionsOnly; Assert-UpdateInstaller $entry $dataRoot} $pending $root (Join-Path $PSScriptRoot 'Maintenance.ps1')
    # Complete slow startup/hash work before asking the renderer to freeze and
    # verify the final snapshot. EOF, timeout or a refused commit cannot close it.
    [Console]::Out.WriteLine('ready');[Console]::Out.Flush()
    $inputReader=[IO.StreamReader]::new([Console]::OpenStandardInput(),[Text.Encoding]::UTF8)
    try{$commit=$inputReader.ReadLineAsync();if(!$commit.Wait(45000) -or $commit.Result -cne 'commit'){throw 'Restart was not committed; the client was left running'}}finally{$inputReader.Dispose()}
    $metadata=Get-Content -LiteralPath (Join-Path $root 'update-session.json') -Raw|ConvertFrom-Json
    if($metadata.id -ne $SessionId.ToString() -or $metadata.phase -ne 'armed' -or $metadata.expiresAt -lt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'Update session changed before shutdown'}
    Stop-LayoutClient $client
    $closed=$true
    & (Join-Path $PSScriptRoot 'Native-Setup.ps1') -Action ApplyPending | Out-Null
} catch {
    try{Write-LayoutJSON (Join-Path $root 'native-error.json') @{at=[datetime]::UtcNow.ToString('o');message=$_.Exception.Message;phase='confirmed-update';update=@{version=$pending.version;sha256=$pending.sha256}}}catch{}
    throw
} finally {
    Exit-LayoutOperation $operation
    if($closed){
        Start-LayoutClient $client
    }
}
