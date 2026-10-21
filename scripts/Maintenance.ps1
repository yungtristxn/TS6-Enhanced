#requires -Version 7.0
[CmdletBinding()]
param([ValidateSet('Update','Remove','Connect')][string]$Action, [string]$NodePath, [switch]$Restart, [switch]$RestartExisting, [switch]$FunctionsOnly, [switch]$Background)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Runtime.ps1')
function Stop-LayoutClient([string]$ClientPath) {
    $running=@(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ClientPath })
    $windows=@($running | Where-Object { [long]$_.MainWindowHandle -ne 0 })
    if($running.Count -and !$windows.Count){throw 'Open the TeamSpeak window, then retry. Background renderer processes were left alone.'}
    foreach($process in $windows) {
        if (!$process.CloseMainWindow()) { throw 'TeamSpeak could not close normally. Exit it yourself, then retry. No process was killed.' }
    }
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    while(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ClientPath }) {
        if([DateTime]::UtcNow -gt $deadline){throw 'TeamSpeak is still running. Finish its dialog or exit it yourself, then retry. No process was killed.'}
        Start-Sleep -Milliseconds 200
    }
}
function Assert-UpdateInstaller($Pending,[string]$Root) {
    if($Pending.schema -ne 1 -or $Pending.version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$' -or $Pending.sha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Invalid pending update receipt'}
    $expected=[IO.Path]::GetFullPath((Join-Path $Root ('updates\TS6-Enhanced-'+$Pending.version+'-Setup.exe')))
    if([IO.Path]::GetFullPath($Pending.path) -cne $expected){throw 'Update installer escaped its managed location'}
    Assert-LayoutPlainPath $expected
    if((Get-FileHash -LiteralPath $expected).Hash -ne $Pending.sha256){throw 'Update installer checksum changed; check for updates again'}
    return $expected
}
if($FunctionsOnly){return}
if(!$Action){throw 'Select a maintenance action'}
if($Background){
    # Give the worker its own hidden console. Node's detached startup skips
    # PowerShell execution; sharing Node's console kills removal when TS closes.
    $maintenanceArguments=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$PSCommandPath+'"'),'-Action',$Action)
    if($NodePath){$maintenanceArguments+=@('-NodePath',('"'+$NodePath+'"'))}
    if($Restart){$maintenanceArguments+='-Restart'}
    if($RestartExisting){$maintenanceArguments+='-RestartExisting'}
    $backgroundProcess=Start-Process -FilePath (Join-Path $PSHOME 'pwsh.exe') -ArgumentList $maintenanceArguments -WindowStyle Hidden -PassThru
    try{$backgroundProcess.WaitForExit();$backgroundExitCode=$backgroundProcess.ExitCode}finally{$backgroundProcess.Dispose()}
    exit $backgroundExitCode
}
$root=Join-Path $env:LOCALAPPDATA 'TS6-Layout'
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
Assert-LayoutPlainPath $root
$operation=Enter-LayoutOperation
$clientStopped=$false
try {
if($Action -eq 'Connect') {
    if(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client }) {
        if(!$RestartExisting -and (Get-NetTCPConnection -LocalPort 9988 -State Listen -ErrorAction SilentlyContinue)){return}
        if(!$Restart){throw 'Close TeamSpeak when ready, then run setup again.'}
        Stop-LayoutClient $client
    }
    & (Join-Path $PSScriptRoot 'Start-Inspection.ps1') | Out-Null
    return
}
    if($Action -eq 'Update') {
        $pending=Get-Content -LiteralPath (Join-Path $root 'pending-update.json') -Raw | ConvertFrom-Json
        $installer=Assert-UpdateInstaller $pending $root
        foreach($name in @('html/client_ui/main.js','html/client_ui/main.css')){
            $expected=$pending.resourceHashes.$name
            if($expected -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path (Split-Path -Parent $client) $name)).Hash -ne $expected){throw 'TeamSpeak no longer matches the staged update. It was left running.'}
        }
        Stop-LayoutClient $client
        $clientStopped=$true
        $job=Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -WindowStyle Hidden -PassThru
        # Start-Process -Wait also waits for the newly reopened TeamSpeak tree.
        try{$job.WaitForExit();$installerExitCode=$job.ExitCode}finally{$job.Dispose()}
        if($installerExitCode -ne 0){
            $state=Get-Content -LiteralPath (Join-Path $root 'persistence\state.json') -Raw | ConvertFrom-Json
            & (Join-Path $state.release 'scripts\Start-Layout.ps1') -Quiet
            throw 'Update setup failed. The existing managed installation was reopened; see setup logs.'
        }
        Remove-Item -LiteralPath (Join-Path $root 'pending-update.json')
        return
    }
    # Both owned-file operations must pass before changing native preferences.
    & (Join-Path $PSScriptRoot 'Install-Persistence.ps1') Uninstall -RepairShortcut -WhatIf | Out-Null
    & (Join-Path $PSScriptRoot 'Theme.ps1') Uninstall -WhatIf | Out-Null
    if(!$NodePath){$runtime=Get-Content -LiteralPath (Join-Path $root 'install-runtime.json') -Raw | ConvertFrom-Json;$NodePath=$runtime.node}
    if(!(Test-LayoutRuntime $NodePath 22)){throw 'The saved Node runtime is missing. Repair the layout installation before uninstalling.'}
    & (Join-Path $PSScriptRoot 'Maintenance.ps1') Connect -Restart:$Restart
    & $NodePath (Join-Path $project 'tools\restore.mjs')
    if($LASTEXITCODE){throw 'Appearance restoration failed. The installed theme and shortcut were retained.'}
    Stop-LayoutClient $client
    & (Join-Path $PSScriptRoot 'Install-Persistence.ps1') Uninstall -RepairShortcut
    & (Join-Path $PSScriptRoot 'Theme.ps1') Uninstall
    # Keep the first-install receipt as recovery history; a future fresh install
    # captures its own baseline rather than reusing this one.
    $baseline=Join-Path $root 'before-install.json'
    if(Test-Path -LiteralPath $baseline){
        $history=Join-Path $root 'uninstall-history';Assert-LayoutPlainPath $history;New-Item -ItemType Directory -Path $history -Force | Out-Null
        Move-Item -LiteralPath $baseline -Destination (Join-Path $history ((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-before-install.json'))
    }
    if($Restart){Start-Process -FilePath $client -WorkingDirectory (Split-Path -Parent $client) -WindowStyle Normal | Out-Null}
} catch {
    $logs=Join-Path $root 'setup-logs';New-Item -ItemType Directory -Path $logs -Force | Out-Null
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $logs 'maintenance-error.txt')
    if($Action -eq 'Update' -and $clientStopped -and !(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $client })){
        Start-Process -FilePath $client -WorkingDirectory (Split-Path -Parent $client) -WindowStyle Normal | Out-Null
    }
    throw
} finally {Exit-LayoutOperation $operation}
