#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Install','Uninstall','Status')][string]$Action = 'Install',
    [string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Programs')) 'TeamSpeak.lnk'),
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'TS6-Layout\persistence'),
    [switch]$RepairShortcut,
    [string]$NodePath
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try {
$project = Split-Path -Parent $PSScriptRoot
$owner = 'ts6-layout-shortcut-v1'
$ShortcutPath = [IO.Path]::GetFullPath($ShortcutPath)
$StateRoot = [IO.Path]::GetFullPath($StateRoot).TrimEnd('\')
function Assert-PlainPath([string]$Path) {
    for ($cursor=$Path; $cursor; $cursor=Split-Path -Parent $cursor) {
        if ((Test-Path -LiteralPath $cursor) -and
            ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Linked path refused: $cursor"
        }
        if ($cursor -eq (Split-Path -Parent $cursor)) { break }
    }
}
function Get-Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
function Copy-Atomic([string]$Source,[string]$Destination) {
    Assert-PlainPath $Destination
    $temp=$Destination+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
    try {
        $stream=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try{$bytes=[IO.File]::ReadAllBytes($Source);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
        if([IO.File]::Exists($Destination)){[IO.File]::Replace($temp,$Destination,[NullString]::Value)}else{[IO.File]::Move($temp,$Destination)}
    }finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
}
function Resolve-PendingShortcut {
    if(!(Test-Path -LiteralPath $pendingPath)){return $null}
    Assert-PlainPath $pendingPath
    $pending=Get-Content -LiteralPath $pendingPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if($pending.owner -cne $owner -or $pending.shortcut -ne $ShortcutPath -or $pending.history -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{8}$'){throw 'Invalid pending shortcut transaction; recovery files were retained.'}
    $folder=Join-Path $StateRoot ('history\'+$pending.history)
    $names=@('TeamSpeak.lnk','replacement.lnk','previous-original.lnk','next-original.lnk','state.json','next-state.json')
    foreach($name in $names){
        $file=Join-Path $folder $name;Assert-PlainPath $file
        if($pending.hashes.$name -notmatch '^[A-Fa-f0-9]{64}$' -or (Get-Hash $file) -ne $pending.hashes.$name){throw 'Shortcut transaction evidence changed; automatic recovery refused.'}
    }
    foreach($item in @(@($ShortcutPath,'TeamSpeak.lnk','replacement.lnk'),@($original,'previous-original.lnk','next-original.lnk'),@($statePath,'state.json','next-state.json'))){
        if((Get-Hash $item[0]) -notin @($pending.hashes.($item[1]),$pending.hashes.($item[2]))){throw 'A file changed outside the pending shortcut transaction. It was left intact.'}
    }
    $next=Get-Content -LiteralPath (Join-Path $folder 'next-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if($next.owner -cne $owner -or $next.shortcut -ne $ShortcutPath -or $next.currentHash -ne $pending.hashes.'replacement.lnk' -or $next.originalHash -ne $pending.hashes.'next-original.lnk'){throw 'Pending shortcut state does not match its saved files'}
    if(!$WhatIfPreference -and $Action -ne 'Status'){
        # Replaying any interrupted prefix is safe. The journal is removed only
        # after all three independently atomic replacements have committed.
        Copy-Atomic (Join-Path $folder 'replacement.lnk') $ShortcutPath
        Copy-Atomic (Join-Path $folder 'next-original.lnk') $original
        Copy-Atomic (Join-Path $folder 'next-state.json') $statePath
        Notify-LayoutShortcutChanged $ShortcutPath
        Remove-Item -LiteralPath $pendingPath
    }
    return [pscustomobject]@{State=$next;Original=(Join-Path $folder 'next-original.lnk')}
}

Assert-PlainPath $ShortcutPath
Assert-PlainPath $StateRoot
if ([IO.Path]::GetExtension($ShortcutPath) -ne '.lnk' -or !(Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) {
    throw 'Select an existing TeamSpeak .lnk shortcut. No other launch registration will be changed.'
}
if ($ShortcutPath.StartsWith($StateRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Shortcut and recovery storage must be separate.' }
$statePath = Join-Path $StateRoot 'state.json'
$original = Join-Path $StateRoot 'original-TeamSpeak.lnk'
$pendingPath=Join-Path $StateRoot 'pending-shortcut.json'
$recovered=Resolve-PendingShortcut
$state = $null
if (Test-Path -LiteralPath $statePath) {
    Assert-PlainPath $statePath
    $state = if($recovered){$recovered.State}else{Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json}
    if ($state.owner -cne $owner -or $state.shortcut -ne $ShortcutPath) { throw 'Persistence ownership or shortcut mismatch.' }
    $verifiedOriginal=if($recovered){$recovered.Original}else{$original}
    Assert-PlainPath $verifiedOriginal
    if (!(Test-Path -LiteralPath $verifiedOriginal) -or (Get-Hash $verifiedOriginal) -ne $state.originalHash) { throw 'Original shortcut backup is missing or changed.' }
    $observedHash = Get-Hash $ShortcutPath
    if(!$state.installed -and !$recovered){$state.currentHash=$observedHash}
    if (!$recovered -and $state.installed -and $observedHash -ne $state.currentHash) {
        if (!$RepairShortcut) { throw 'The shortcut changed since setup. It was left intact; inspect the backup, or use -RepairShortcut to accept metadata changes with identical launch settings.' }
        # Repair is explicit. Never infer ownership from a shortcut name or
        # silently accept changed target/arguments, launch flags or user fields.
        $recorded = Join-Path $StateRoot ('history\'+(Split-Path -Leaf $state.release)+'\replacement.lnk')
        Assert-PlainPath $recorded
        if (!(Test-Path -LiteralPath $recorded) -or (Get-Hash $recorded) -ne $state.currentHash) { throw 'Recorded managed shortcut cannot be verified; repair refused.' }
        $shell = New-Object -ComObject WScript.Shell
        $currentLink = $shell.CreateShortcut($ShortcutPath)
        $recordedLink = $shell.CreateShortcut($recorded)
        foreach ($field in @('TargetPath','Arguments','WorkingDirectory','IconLocation','Description','Hotkey','WindowStyle')) {
            if ($currentLink.$field -cne $recordedLink.$field) { throw "Shortcut launch settings changed ($field); repair refused." }
        }
        $currentBytes = [IO.File]::ReadAllBytes($ShortcutPath)
        $recordedBytes = [IO.File]::ReadAllBytes($recorded)
        # Protect the Shell Link header/class and LinkFlags, including RunAsUser.
        if ($currentBytes.Length -lt 76 -or $recordedBytes.Length -lt 76) { throw 'Invalid shortcut header; repair refused.' }
        for ($i=0; $i -lt 24; $i++) { if ($currentBytes[$i] -ne $recordedBytes[$i]) { throw 'Shortcut header or launch flags changed; repair refused.' } }
        # Adopt only in memory until ShouldProcess succeeds; history below saves
        # the exact observed shortcut and previous ownership state before writes.
        $state.currentHash = $observedHash
        Write-Output 'Verified identical shortcut launch settings. Repair will preserve the current file in shortcut history.'
    }
} elseif (Test-Path -LiteralPath $StateRoot) { throw 'Recovery directory exists without this project ownership record; refusing to replace it.' }
if ($Action -eq 'Status') {
    if ($state) { [pscustomobject]@{Installed=$state.installed;Shortcut=$ShortcutPath;Backup=$original;Release=$state.release} }
    else { Write-Output 'Shortcut persistence is not installed.' }
    return
}
if ($Action -eq 'Uninstall' -and (!$state -or !$state.installed)) { Write-Output 'Shortcut persistence is already absent.'; return }
$files = @('scripts\Start-Layout.ps1','scripts\Start-ManagedLayout.ps1','scripts\Start-Inspection.ps1','scripts\Maintenance.ps1','scripts\Runtime.ps1','scripts\Theme.ps1','scripts\Install-Persistence.ps1',
    'release.json','tools\session.mjs','tools\appearance.mjs','tools\install-state.mjs','tools\restore.mjs','tools\updates.mjs','tools\live-update.mjs','tools\manager.mjs','tools\manager-lock.mjs','tools\manager-runtime.js',
    'tools\cdp.mjs','tools\client.mjs','tools\workspace-runtime.js','tools\streams-runtime.js')
if ($Action -eq 'Install') {
    $powershell = Get-LayoutPowerShell
    $bundledNode=(Test-Path -LiteralPath (Join-Path $project 'runtime\node.exe')) -or (Test-Path -LiteralPath (Join-Path $project 'SHA256SUMS.txt'))
    if($bundledNode){
        $node=Resolve-LayoutNode $project
        $files+=@('runtime\node.exe','runtime\LICENSE')
    }else{
        # Source-checkout development can use an explicitly supplied/local Node.
        $node = if ($NodePath) { [IO.Path]::GetFullPath($NodePath) } else { (Get-Command node -ErrorAction Stop).Source }
    }
    $nodeVersion = & $node --version
    if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion -replace '^v(\d+).*','$1') -lt 22) { throw 'Node 22 or newer is required.' }
    $clientExe = Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
    if (!(Test-Path -LiteralPath $clientExe)) { throw 'Installed TeamSpeak executable not found.' }
    foreach ($file in $files) {
        $source = Join-Path $project $file
        Assert-PlainPath $source
        if (!(Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing launcher source: $file" }
    }
}
if((!$state -or !$state.installed) -and $Action -eq 'Install'){
    # For an exact restored link, inspect the verified recovery copy instead of
    # resolving the live Start Menu path again. A matching hash alone does not
    # prove it native: a managed original must still be rejected.
    $inspect=if($state -and $state.currentHash -eq $state.originalHash){$original}else{$ShortcutPath}
    $native=(New-Object -ComObject WScript.Shell).CreateShortcut($inspect)
    if($native.Arguments -match 'Start-Layout\.ps1'){throw 'A managed shortcut cannot become the native original. Restore the verified original shortcut from recovery history first.'}
}
if (!$PSCmdlet.ShouldProcess($ShortcutPath, "$Action automatic layout attachment; retain byte-for-byte shortcut recovery")) { return }
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
if ($state -and !$state.installed -and $Action -eq 'Install') {
    # Once removed, the native client/user owns the link again. A fresh install
    # saves that current link and keeps the preceding baseline as history.
    $previous=Join-Path $StateRoot ('history\before-reinstall-'+[guid]::NewGuid().ToString('N'))
    Assert-PlainPath $previous
    New-Item -ItemType Directory -Path $previous | Out-Null
    Copy-Item -LiteralPath $original -Destination (Join-Path $previous 'original-TeamSpeak.lnk')
    Copy-Item -LiteralPath $statePath -Destination (Join-Path $previous 'state.json')
}
if (!$state) {
    Copy-Item -LiteralPath $ShortcutPath -Destination $original
    $state = [pscustomobject]@{owner=$owner;shortcut=$ShortcutPath;originalHash=(Get-Hash $original);currentHash=(Get-Hash $ShortcutPath);installed=$false;release=$null}
    Write-LayoutJSON $statePath $state
}
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$history = Join-Path $StateRoot ('history\'+$stamp)
Assert-PlainPath $history
New-Item -ItemType Directory -Path $history -Force | Out-Null
Copy-Item -LiteralPath $ShortcutPath -Destination (Join-Path $history 'TeamSpeak.lnk')
Copy-Item -LiteralPath $statePath -Destination (Join-Path $history 'state.json')
Copy-Item -LiteralPath $original -Destination (Join-Path $history 'previous-original.lnk')
$nextOriginal=Join-Path $history 'next-original.lnk'
Copy-Item -LiteralPath $(if(!$state.installed -and $Action -eq 'Install'){$ShortcutPath}else{$original}) -Destination $nextOriginal
$state.originalHash=Get-Hash $nextOriginal
if ($Action -eq 'Install') {
    # Immutable releases avoid in-place updates and leave each previous runtime
    # available for recovery. Only this explicit source allowlist is copied.
    $release = Join-Path $StateRoot ('releases\'+$stamp)
    Assert-PlainPath $release
    foreach ($file in $files) {
        $destination = Join-Path $release $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $project $file) -Destination $destination
        if ((Get-Hash $destination) -ne (Get-Hash (Join-Path $project $file))) { throw "Copied launcher failed verification: $file" }
    }
    # Each release owns its runtime, so updates cannot replace a running helper
    # and an extracted setup folder can be deleted after installation.
    if($bundledNode){$node=Join-Path $release 'runtime\node.exe'}
    # Pin the built-in Windows host and resolved Node; neither needs PATH edits.
    # An incomplete first activation must still retry setup when repaired.
    $preserveAppearance=[bool]($state.installed -and $state.release -and (Test-Path -LiteralPath (Join-Path $state.release '.theme-ready') -PathType Leaf))
    @{node=$node;preserveAppearance=$preserveAppearance} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $release 'runtime.json') -Encoding utf8
    # Installed helpers need a permanent maintenance runtime even when setup was
    # started from the source checkout rather than the EXE.
    # Retain the receipt field name for compatibility with an older updater.
    Write-LayoutJSON (Join-Path (Split-Path -Parent $StateRoot) 'install-runtime.json') @{node=$node;pwsh=$powershell}
    $shell = New-Object -ComObject WScript.Shell
    $launcher=Join-Path $StateRoot 'Start-Layout.ps1'
    Assert-PlainPath $launcher
    if(Test-Path -LiteralPath $launcher){Copy-Item -LiteralPath $launcher -Destination (Join-Path $history 'previous-launcher.ps1')}
    Copy-Atomic (Join-Path $release 'scripts\Start-ManagedLayout.ps1') $launcher
    $staged = Join-Path $history 'replacement.lnk'
    # Keep the native AppUserModelID and other Shell properties. A new blank
    # link loses that identity, leaving Windows Search's old app entry behind.
    Copy-Item -LiteralPath $nextOriginal -Destination $staged
    $link = $shell.CreateShortcut($staged)
    $link.TargetPath = $powershell
    $link.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$launcher+'" -Quiet'
    $link.WorkingDirectory = $StateRoot
    $link.IconLocation = $clientExe+',0'
    $link.Description = 'TeamSpeak with automatic local layout enhancements'
    $link.WindowStyle = 7
    $link.Save()
    $check = $shell.CreateShortcut($staged)
    if ($check.TargetPath -ne $powershell -or $check.Arguments -ne $link.Arguments) { throw 'Shortcut verification failed; original remains unchanged.' }
    $state.release = $release
    $state.installed = $true
} else {
    $staged = Join-Path $history 'replacement.lnk'
    Copy-Item -LiteralPath $original -Destination $staged
    $state.installed = $false
}
# Save the complete transaction before changing the live link or its baseline.
if ((Get-Hash $ShortcutPath) -ne $state.currentHash) { throw 'Shortcut changed during setup; refusing replacement.' }
$state.currentHash=Get-Hash $staged
Write-LayoutJSON (Join-Path $history 'next-state.json') $state
$hashes=@{}
foreach($name in @('TeamSpeak.lnk','replacement.lnk','previous-original.lnk','next-original.lnk','state.json','next-state.json')){$hashes[$name]=Get-Hash (Join-Path $history $name)}
Write-LayoutJSON $pendingPath @{owner=$owner;shortcut=$ShortcutPath;history=$stamp;hashes=$hashes}
Resolve-PendingShortcut | Out-Null
if($Action -eq 'Install'){
    # Windows can retain a launch command from an older registered app entry.
    # Preserve those entry scripts, then forward them to the stable dispatcher.
    # Helper payloads and their manifests remain available for recovery.
    $forwarder=Join-Path $history 'legacy-launcher.ps1'
    @'
#requires -Version 5.1
[CmdletBinding()]
param([ValidateRange(1024,65535)][int]$Port=9988,[switch]$Quiet)
$entry=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\Start-Layout.ps1'))
$powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$launchArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$entry,'-Port',"$Port")
if($Quiet){$launchArguments+='-Quiet'}
& $powershell @launchArguments
if($LASTEXITCODE -ne 0){throw 'The managed TeamSpeak launcher failed. See the launcher log in LocalAppData\TS6-Layout.'}
'@ | Set-Content -LiteralPath $forwarder -Encoding UTF8
    foreach($previous in Get-ChildItem -LiteralPath (Join-Path $StateRoot 'releases') -Directory){
        if($previous.FullName -eq $release -or $previous.Name -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{8}$'){continue}
        Assert-PlainPath $previous.FullName
        $entry=Join-Path $previous.FullName 'scripts\Start-Layout.ps1'
        $receipt=Join-Path $previous.FullName 'runtime.json'
        Assert-PlainPath $entry;Assert-PlainPath $receipt
        if(!(Test-Path -LiteralPath $entry -PathType Leaf) -or !(Test-Path -LiteralPath $receipt -PathType Leaf)){continue}
        if((Get-Hash $entry) -eq (Get-Hash $forwarder)){continue}
        Copy-Item -LiteralPath $entry -Destination (Join-Path $history ('launcher-before-'+$previous.Name+'.ps1'))
        Copy-Atomic $forwarder $entry
    }
}
Write-Output "$Action complete: $ShortcutPath"
Write-Output "Original shortcut backup: $original"
Write-Output 'No running client, native file, startup task, protocol handler or pinned taskbar shortcut was changed.'

}finally{Exit-LayoutOperation $operation}
