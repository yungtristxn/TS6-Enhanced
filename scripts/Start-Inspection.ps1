#requires -Version 5.1
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 9988)
$ErrorActionPreference = 'Stop'
$exe = Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
if (!(Test-Path -LiteralPath $exe)) { throw "Client not found: $exe" }
if (Get-Process TeamSpeak -ErrorAction SilentlyContinue) {
    throw 'TeamSpeak is already running. No restart was performed. If its debugger is enabled, use client.mjs inspect. Otherwise close it yourself when idle, then rerun this command.'
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is already occupied." }
# This launches the interactive TS6 client for inspection; it never terminates it.
Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -ArgumentList "--remote-debugging-address=127.0.0.1","--remote-debugging-port=$Port" -WindowStyle Normal
$listeners = @()
$deadline=[DateTime]::UtcNow.AddSeconds(60)
while ([DateTime]::UtcNow -lt $deadline) {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count) { break }
    Start-Sleep -Milliseconds 250
}
if (!$listeners.Count) { throw 'TeamSpeak did not finish starting within 60 seconds. Let the client finish opening, then launch its Start Menu shortcut again.' }
foreach ($listener in $listeners) {
    if ($listener.LocalAddress -notin @('127.0.0.1','::1')) { throw 'Debugger is not loopback-only. No connection attempted. Close this inspection session manually.' }
    $owner = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener.OwningProcess)
    if ($owner.ExecutablePath -ne $exe) { throw 'Debugger port belongs to a different executable. No connection attempted.' }
}
Write-Output "Verified TS6 debugger on loopback port $Port. No wildcard origin override was needed."
Write-Output 'Run node tools/client.mjs inspect. After inspection, exit TS6 yourself when idle and start it normally to remove the temporary debugger listener.'
