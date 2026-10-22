#requires -Version 5.1
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port = 9988, [switch]$Quiet)
$ErrorActionPreference = 'Stop'
$operation=$null
try {
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
$project = Split-Path -Parent $PSScriptRoot
$runtimeFile = Join-Path $project 'runtime.json'
$runtime = if (Test-Path -LiteralPath $runtimeFile) { Get-Content -LiteralPath $runtimeFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
$node = if ($runtime) { $runtime.node } else { (Get-Command node -ErrorAction Stop).Source }
$activated = Join-Path $project '.theme-ready'
[string[]]$setupArguments = @(if ($runtime -and !(Test-Path -LiteralPath $activated)) { if($runtime.preserveAppearance){'--upgrade'}else{'--setup'} })
$nodeVersion = & $node --version
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion -replace '^v(\d+).*','$1') -lt 22) {
    throw 'Node 22 or newer is required for the optional layout helpers.'
}
$taskExe = Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
$running = @(Get-Process -Name TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $taskExe })
if(!$running.Count){
    $pendingPath=Join-Path $env:LOCALAPPDATA 'TS6-Layout\pending-update.json'
    if(Test-Path -LiteralPath $pendingPath){
        Assert-LayoutPlainPath $pendingPath
        try{$pending=Get-Content -LiteralPath $pendingPath -Raw -Encoding UTF8 | ConvertFrom-Json}
        catch{$pending=$null;Write-Warning 'The queued update could not be read. Check for updates again after TeamSpeak opens.'}
        $release=Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if($pending.schema -eq 2 -and $pending.mode -eq 'next-launch' -and $pending.fromVersion -ceq $release.version){
            try { & (Join-Path $PSScriptRoot 'Maintenance.ps1') -Action Update }
            catch {
                $logs=Join-Path $env:LOCALAPPDATA 'TS6-Layout\setup-logs'
                Assert-LayoutPlainPath $logs;New-Item -ItemType Directory -Path $logs -Force | Out-Null
                $_.Exception.Message | Set-Content -LiteralPath (Join-Path $logs 'update-error.txt') -Encoding UTF8
                # A queued update must never prevent access to the native client.
                if(!(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $taskExe})){
                    Start-Process -FilePath $taskExe -WorkingDirectory (Split-Path -Parent $taskExe) -WindowStyle Normal | Out-Null
                }
            }
            return
        }
    }
}
if (!$running.Count) {
    & (Join-Path $PSScriptRoot 'Start-Inspection.ps1') -Port $Port
} elseif (!(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
    throw 'TS6 is running normally. It was not restarted. When idle, exit TS6 and run this command again.'
}
# session.mjs independently verifies loopback binding, owning executable,
# main-window identity, exact build and selected theme before any mutation.
# Windows PowerShell treats redirected native stderr as ErrorRecords. Collect
# the complete message and use the exit code, instead of stopping on its first line.
$previousErrorAction=$ErrorActionPreference
try {
    $ErrorActionPreference='Continue'
    $output = & $node (Join-Path $project 'tools\session.mjs') --port $Port @setupArguments 2>&1
    $attachmentExitCode=$LASTEXITCODE
} finally {$ErrorActionPreference=$previousErrorAction}
if ($attachmentExitCode -ne 0) { throw "Layout attachment failed. $($output -join [Environment]::NewLine)" }
$output | Write-Output
if ($setupArguments.Count) { 'Activated by native Appearance settings' | Set-Content -LiteralPath $activated -Encoding utf8 }
if(Test-Path -LiteralPath (Join-Path $project 'tools\manager.mjs')) {
    $manager=Join-Path $project 'tools\manager.mjs'
    $statusRoot=Join-Path $env:LOCALAPPDATA 'TS6-Layout\launcher'
    New-Item -ItemType Directory -Path $statusRoot -Force | Out-Null
    $receipt=Join-Path $statusRoot ('manager-'+[guid]::NewGuid().ToString('N')+'.json')
    $worker=Start-Process -FilePath $node -ArgumentList ('"'+$manager+'" --ready-file "'+$receipt+'"') -WindowStyle Hidden -PassThru
    try {
        $deadline=[DateTime]::UtcNow.AddSeconds(20)
        while(!(Test-Path -LiteralPath $receipt)){
            if($worker.HasExited -or [DateTime]::UtcNow -ge $deadline){throw 'Maintenance controls did not start. See TS6-Layout\manager-error.json in LocalAppData, then retry the Start Menu shortcut.'}
            Start-Sleep -Milliseconds 100
        }
        $managerState=Get-Content -LiteralPath $receipt -Raw -Encoding UTF8 | ConvertFrom-Json
        if($managerState.status -ne 'ready'){throw "Maintenance controls could not attach: $($managerState.message)"}
    }finally{$worker.Dispose();if(Test-Path -LiteralPath $receipt){Remove-Item -LiteralPath $receipt}}
}
Write-Output 'This session uses a loopback-only inspection listener. Exit TS6 and launch normally to remove it. No background service was installed.'
if ($Quiet) {
    $statusRoot = Join-Path $env:LOCALAPPDATA 'TS6-Layout\launcher'
    New-Item -ItemType Directory -Path $statusRoot -Force | Out-Null
    @{ status='ready'; timestamp=[DateTime]::UtcNow.ToString('o'); release=$project } | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $statusRoot 'last-launch.json') -Encoding utf8
}
} catch {
    if (!$Quiet) { throw }
    $statusRoot = Join-Path $env:LOCALAPPDATA 'TS6-Layout\launcher'
    New-Item -ItemType Directory -Path $statusRoot -Force | Out-Null
    @{ status='failed'; timestamp=[DateTime]::UtcNow.ToString('o'); release=$project; message=$_.Exception.Message } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $statusRoot 'last-launch.json') -Encoding utf8
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
        "The layout enhancements could not be attached. TS6 was not restarted or closed.`n`n$($_.Exception.Message)`n`nDetails: $statusRoot\last-launch.json",
        'TeamSpeak layout', 'OK', 'Warning')
    exit 1
}

finally{Exit-LayoutOperation $operation}
