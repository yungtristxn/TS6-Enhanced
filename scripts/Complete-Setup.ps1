#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$NodePath,[switch]$RestartClient,[string]$ErrorFile)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=$null
$phase='Preparing TeamSpeak'
try {
$operation=Enter-LayoutOperation
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
if($RestartClient -and (Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client })){
    # Keep native startup/shortcut registration out of the install transaction.
    # Start-Layout opens the client once, after theme and shortcut commits.
    Stop-LayoutClient $client
}
$announced=$false
while (Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client }) {
    if (!$announced) {
        Write-Host 'Setup is not complete. Close TeamSpeak when your call is finished to continue.' -ForegroundColor Yellow
        Write-Host 'Keep this setup window open. If you close it, run setup again later.'
        $announced=$true
    }
    Start-Sleep -Seconds 1
}
$phase='Installing the theme and shortcut'
& (Join-Path $PSScriptRoot 'Setup.ps1') -NodePath $NodePath -RepairShortcut 6>&1 | Out-Null
$state=Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'TS6-Layout\persistence\state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$phase='Activating TeamSpeak'
& (Join-Path $state.release 'scripts\Start-Layout.ps1') | Out-Null
Write-Host 'Layout activated. Use TeamSpeak from Start Menu next time. The extracted setup folder can be deleted.' -ForegroundColor Green
}catch{
    Write-LayoutFailure $ErrorFile ($phase+': '+$_.Exception.Message)
    throw
}finally{Exit-LayoutOperation $operation}
