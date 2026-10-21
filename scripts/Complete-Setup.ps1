#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$NodePath,[switch]$RestartClient)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try {
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
if($RestartClient -and (Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client })){
    & (Join-Path $PSScriptRoot 'Maintenance.ps1') Connect -Restart -RestartExisting
}
$announced=$false
while ((Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client }) -and
    !(Get-NetTCPConnection -LocalPort 9988 -State Listen -ErrorAction SilentlyContinue)) {
    if($RestartClient){& (Join-Path $PSScriptRoot 'Maintenance.ps1') Connect -Restart;break}
    if (!$announced) {
        Write-Host 'Setup is not complete. Close TeamSpeak when your call is finished to continue.' -ForegroundColor Yellow
        Write-Host 'Keep this setup window open. If you close it, run setup again later.'
        $announced=$true
    }
    Start-Sleep -Seconds 1
}
& (Join-Path $PSScriptRoot 'Setup.ps1') -NodePath $NodePath -RepairShortcut 6>&1 | Out-Null
$state=Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'TS6-Layout\persistence\state.json') -Raw | ConvertFrom-Json
& (Join-Path $state.release 'scripts\Start-Layout.ps1') | Out-Null
Write-Host 'Layout activated. Use TeamSpeak from Start Menu next time. The extracted setup folder can be deleted.' -ForegroundColor Green
}finally{Exit-LayoutOperation $operation}
