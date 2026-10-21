#requires -Version 5.1
[CmdletBinding()]
param([ValidateSet('Update','Remove','Connect')][string]$Action, [string]$NodePath, [switch]$Restart, [switch]$RestartExisting, [switch]$FunctionsOnly, [switch]$Background)
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Runtime.ps1')
function Assert-UpdateInstaller($Pending,[string]$Root) {
    if($Pending.schema -ne 2 -or $Pending.mode -ne 'next-launch' -or $Pending.version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$' -or $Pending.sha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Invalid pending update receipt'}
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
    $backgroundProcess=Start-Process -FilePath (Get-LayoutPowerShell) -ArgumentList $maintenanceArguments -WindowStyle Hidden -PassThru
    try{$backgroundProcess.WaitForExit();$backgroundExitCode=$backgroundProcess.ExitCode}finally{$backgroundProcess.Dispose()}
    exit $backgroundExitCode
}
$root=Join-Path $env:LOCALAPPDATA 'TS6-Layout'
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
Assert-LayoutPlainPath $root
$operation=Enter-LayoutOperation
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
        if(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $client}){throw 'The update is ready for the next TeamSpeak launch. The current session was left running.'}
        $pending=Get-Content -LiteralPath (Join-Path $root 'pending-update.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $installed=Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if($pending.fromVersion -cne $installed.version){throw 'The queued update belongs to a different installation'}
        $installer=Assert-UpdateInstaller $pending $root
        foreach($name in @('html/client_ui/main.js','html/client_ui/main.css')){
            $expected=$pending.resourceHashes.$name
            if($expected -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path (Split-Path -Parent $client) $name)).Hash -ne $expected){throw 'TeamSpeak no longer matches the staged update. It was left running.'}
        }
        $job=Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TSIXDEFERRED=1' -WindowStyle Hidden -PassThru
        # Start-Process -Wait also waits for the newly reopened TeamSpeak tree.
        try{$job.WaitForExit();$installerExitCode=$job.ExitCode}finally{$job.Dispose()}
        if($installerExitCode -ne 0){
            throw 'Update setup failed. Recovery files were retained; see setup logs.'
        }
        $receipt=Join-Path $root 'pending-update.json'
        $current=Get-Content -LiteralPath $receipt -Raw -Encoding UTF8 | ConvertFrom-Json
        if($current.version -ceq $pending.version -and $current.sha256 -ceq $pending.sha256){Remove-Item -LiteralPath $receipt}
        return
    }
    # Both owned-file operations must pass before changing native preferences.
    & (Join-Path $PSScriptRoot 'Install-Persistence.ps1') Uninstall -RepairShortcut -WhatIf | Out-Null
    & (Join-Path $PSScriptRoot 'Theme.ps1') Uninstall -WhatIf | Out-Null
    if(!$NodePath){$runtime=Get-Content -LiteralPath (Join-Path $root 'install-runtime.json') -Raw -Encoding UTF8 | ConvertFrom-Json;$NodePath=$runtime.node}
    if(!(Test-LayoutRuntime $NodePath 22)){throw 'The saved Node runtime is missing. Repair the layout installation before uninstalling.'}
    & (Join-Path $PSScriptRoot 'Maintenance.ps1') Connect -Restart:$Restart
    & $NodePath (Join-Path $project 'tools\restore.mjs')
    if($LASTEXITCODE){throw 'Appearance restoration failed. The installed theme and shortcut were retained.'}
    Stop-LayoutClient $client
    & (Join-Path $PSScriptRoot 'Install-Persistence.ps1') Uninstall -RepairShortcut
    & (Join-Path $PSScriptRoot 'Theme.ps1') Uninstall
    $queued=Join-Path $root 'pending-update.json';Assert-LayoutPlainPath $queued
    if(Test-Path -LiteralPath $queued){Remove-Item -LiteralPath $queued}
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
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $logs 'maintenance-error.txt') -Encoding UTF8
    throw
} finally {Exit-LayoutOperation $operation}
