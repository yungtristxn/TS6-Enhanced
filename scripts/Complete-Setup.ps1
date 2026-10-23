#requires -Version 5.1
[CmdletBinding()]
param([switch]$RestartClient,[switch]$DeferredUpdate,[switch]$NoLaunch,[string]$ErrorFile)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=$null
$phase='Preparing TeamSpeak'
try {
$operation=Enter-LayoutOperation
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
if($DeferredUpdate -and (Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $client})){throw 'TeamSpeak reopened before the queued update. It was left running; retry on the next launch.'}
if($RestartClient -and !$DeferredUpdate -and (Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client })){
    Stop-LayoutClient $client
}
$announced=$false
while (Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client }) {
    if($DeferredUpdate){throw 'TeamSpeak reopened before the queued update. It was left running.'}
    if (!$announced) {
        Write-Host 'Setup is not complete. Close TeamSpeak when your call is finished to continue.' -ForegroundColor Yellow
        Write-Host 'Keep this setup window open. If you close it, run setup again later.'
        $announced=$true
    }
    Start-Sleep -Seconds 1
}
$phase='Installing TS6 Enhanced'
& (Join-Path $PSScriptRoot 'Native-Setup.ps1') | Out-Null
if(!$NoLaunch){Start-Process -FilePath $client -WorkingDirectory (Split-Path -Parent $client) -WindowStyle Normal | Out-Null}
Write-Host 'TS6 Enhanced is installed. Launch TeamSpeak normally.' -ForegroundColor Green
}catch{
    Write-LayoutFailure $ErrorFile ($phase+': '+$_.Exception.Message)
    throw
}finally{Exit-LayoutOperation $operation}
