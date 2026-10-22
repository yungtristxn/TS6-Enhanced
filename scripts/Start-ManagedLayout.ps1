#requires -Version 5.1
# Stable shortcut target: resolve the current release each time Windows opens it.
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port=9988,[switch]$Quiet)
$ErrorActionPreference='Stop'
function Assert-ManagedPath([string]$Path) {
    for($cursor=[IO.Path]::GetFullPath($Path);$cursor;$cursor=Split-Path -Parent $cursor){
        if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Linked launcher path refused'}
        if($cursor -eq (Split-Path -Parent $cursor)){break}
    }
}
$statePath=Join-Path $PSScriptRoot 'state.json'
Assert-ManagedPath $statePath
$state=Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
if($state.owner -cne 'ts6-layout-shortcut-v1' -or $state.installed -isnot [bool]){throw 'Invalid managed launcher state'}
if(!$state.installed){
    # A cached Windows Search entry still opens the native client after removal.
    $client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
    Assert-ManagedPath $client
    Start-Process -FilePath $client -WorkingDirectory (Split-Path -Parent $client) -WindowStyle Normal | Out-Null
    return
}
$releases=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'releases'))
if(!$state.release -or ![IO.Path]::IsPathRooted($state.release)){throw 'Missing managed release'}
$release=[IO.Path]::GetFullPath($state.release).TrimEnd('\')
if((Split-Path -Parent $release) -ne $releases -or (Split-Path -Leaf $release) -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{8}$'){throw 'Managed release escaped its installation'}
$launcher=Join-Path $release 'scripts\Start-Layout.ps1'
Assert-ManagedPath $launcher
& $launcher -Port $Port -Quiet:$Quiet
