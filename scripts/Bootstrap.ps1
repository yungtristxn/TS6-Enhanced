#requires -Version 5.1
[CmdletBinding()]
param([switch]$Uninstall, [switch]$Prepare, [switch]$RestartClient, [string]$ErrorFile)
# Inno/Node can pass PowerShell 7 module paths into Windows PowerShell 5.1.
# Bootstrap only uses this host's built-ins; keep incompatible modules out.
$env:PSModulePath = [IO.Path]::Combine($PSHOME,'Modules')
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=$null; $logging=$false; $result=1
try {
    $operation=Enter-LayoutOperation
    $logRoot=Join-Path $env:LOCALAPPDATA 'TS6-Layout\setup-logs'
    Assert-LayoutPlainPath $logRoot
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $log=Join-Path $logRoot ((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.txt')
    Start-Transcript -LiteralPath $log -Force | Out-Null; $logging=$true
    Write-Host 'TS6 Enhanced - automatic setup' -ForegroundColor Cyan
    if (![Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'This package requires Windows on an x64 PC.' }
    Assert-LayoutPackage $project
    if (!$Uninstall) {
        Write-Host '[1/3] Checking TeamSpeak...'
        $release=Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw | ConvertFrom-Json
        $client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak'
        if (!(Test-Path -LiteralPath (Join-Path $client 'TeamSpeak.exe'))) { throw 'Install TeamSpeak 6 for this Windows user first. Expected: %LOCALAPPDATA%\Programs\TeamSpeak. This package does not include TeamSpeak.' }
        foreach ($p in $release.supportedClient.resourceHashes.PSObject.Properties) {
            $file=Join-Path $client $p.Name
            if (!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file).Hash -ne $p.Value) {
                throw "This package supports TS6 $($release.supportedClient.version), build $($release.supportedClient.build). Your client files do not match. No theme or shortcut was changed."
            }
        }
        Write-Host '[2/3] Preparing runtimes (only missing ones are downloaded)...'
    }
    if ($Uninstall) {
        $saved=Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'TS6-Layout\install-runtime.json') -Raw | ConvertFrom-Json
        if(!(Test-LayoutRuntime $saved.pwsh 7) -or !(Test-LayoutRuntime $saved.node 22)){throw 'Saved maintenance runtimes are unavailable. Repair the installation before removing it.'}
        & $saved.pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Maintenance.ps1') -Action Remove -NodePath $saved.node -Restart
    } else {
        $lock=Get-Content -LiteralPath (Join-Path $project 'runtime-lock.json') -Raw | ConvertFrom-Json
        $runtimeRoot=Join-Path $env:LOCALAPPDATA 'TS6-Layout\runtimes'
        $pwsh=Resolve-LayoutRuntime powershell $lock.powershell $runtimeRoot
        $node=Resolve-LayoutRuntime node $lock.node $runtimeRoot
        # Preparation must not replace the active installation's receipt.
        # Persistence publishes it only after committing the managed shortcut.
        if($Prepare){$result=0;return}
        Write-Host '[3/3] Installing and activating the layout...'
        $extra=@();if($RestartClient){$extra+='-RestartClient'}
        if($ErrorFile){$extra+=@('-ErrorFile',$ErrorFile)}
        & $pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Complete-Setup.ps1') -NodePath $node @extra
    }
    if ($LASTEXITCODE -ne 0) { throw 'Setup did not finish. The message above explains the next step. Recovery files and logs were retained.' }
    Write-Host 'Done. You can close this window.' -ForegroundColor Green
    $result=0
} catch {
    if($ErrorFile -and (!(Test-Path -LiteralPath $ErrorFile) -or ![IO.File]::ReadAllText($ErrorFile).Trim())){
        Write-LayoutFailure $ErrorFile $_.Exception.Message
    }
    Write-Host "`nSetup needs attention: $($_.Exception.Message)" -ForegroundColor Red
    if ($log) { Write-Host "Details to share if needed: $log" }
} finally {
    if ($logging) { Stop-Transcript | Out-Null }
    Exit-LayoutOperation $operation
}
exit $result
