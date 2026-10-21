#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Install','Uninstall','Status')][string]$Action = 'Install',
    [string]$ShortcutPath = (Join-Path ([Environment]::GetFolderPath('Programs')) 'TeamSpeak.lnk'),
    [string]$StateRoot = (Join-Path $env:LOCALAPPDATA 'TS6-Layout\persistence'),
    [switch]$RepairShortcut,
    [string]$NodePath
)
$ErrorActionPreference = 'Stop'
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
Assert-PlainPath $ShortcutPath
Assert-PlainPath $StateRoot
if ([IO.Path]::GetExtension($ShortcutPath) -ne '.lnk' -or !(Test-Path -LiteralPath $ShortcutPath -PathType Leaf)) {
    throw 'Select an existing TeamSpeak .lnk shortcut. No other launch registration will be changed.'
}
if ($ShortcutPath.StartsWith($StateRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Shortcut and recovery storage must be separate.' }
$statePath = Join-Path $StateRoot 'state.json'
$original = Join-Path $StateRoot 'original-TeamSpeak.lnk'
$state = $null
if (Test-Path -LiteralPath $statePath) {
    Assert-PlainPath $statePath
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if ($state.owner -cne $owner -or $state.shortcut -ne $ShortcutPath) { throw 'Persistence ownership or shortcut mismatch.' }
    Assert-PlainPath $original
    if (!(Test-Path -LiteralPath $original) -or (Get-Hash $original) -ne $state.originalHash) { throw 'Original shortcut backup is missing or changed.' }
    $observedHash = Get-Hash $ShortcutPath
    if ($observedHash -ne $state.currentHash) {
        if (!$RepairShortcut -or !$state.installed) { throw 'The shortcut changed since setup. It was left intact; inspect the backup, or use -RepairShortcut to accept metadata changes with identical launch settings.' }
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
$files = @('scripts\Start-Layout.ps1','scripts\Start-Inspection.ps1','scripts\Maintenance.ps1','scripts\Runtime.ps1','scripts\Theme.ps1','scripts\Install-Persistence.ps1',
    'release.json','tools\session.mjs','tools\appearance.mjs','tools\install-state.mjs','tools\restore.mjs','tools\updates.mjs','tools\manager.mjs','tools\manager-runtime.js',
    'tools\cdp.mjs','tools\client.mjs','tools\workspace-runtime.js','tools\streams-runtime.js')
if ($Action -eq 'Install') {
    $pwsh = Join-Path $PSHOME 'pwsh.exe'
    $node = if ($NodePath) { [IO.Path]::GetFullPath($NodePath) } else { (Get-Command node -ErrorAction Stop).Source }
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
if (!$PSCmdlet.ShouldProcess($ShortcutPath, "$Action automatic layout attachment; retain byte-for-byte shortcut recovery")) { return }
New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
if (!$state) {
    Copy-Item -LiteralPath $ShortcutPath -Destination $original
    $state = [pscustomobject]@{owner=$owner;shortcut=$ShortcutPath;originalHash=(Get-Hash $original);currentHash=(Get-Hash $ShortcutPath);installed=$false;release=$null}
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
}
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$history = Join-Path $StateRoot ('history\'+$stamp)
Assert-PlainPath $history
New-Item -ItemType Directory -Path $history -Force | Out-Null
Copy-Item -LiteralPath $ShortcutPath -Destination (Join-Path $history 'TeamSpeak.lnk')
Copy-Item -LiteralPath $statePath -Destination (Join-Path $history 'state.json')
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
    # Pin the resolved executable: portable runtimes need no PATH registration.
    @{node=$node} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $release 'runtime.json') -Encoding utf8
    # Installed helpers need a permanent maintenance runtime even when setup was
    # started from the source checkout rather than the EXE.
    @{node=$node;pwsh=$pwsh} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $StateRoot) 'install-runtime.json') -Encoding utf8
    $shell = New-Object -ComObject WScript.Shell
    $staged = Join-Path $history 'replacement.lnk'
    $link = $shell.CreateShortcut($staged)
    $link.TargetPath = $pwsh
    $link.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $release 'scripts\Start-Layout.ps1')+'" -Quiet'
    $link.WorkingDirectory = $release
    $link.IconLocation = $clientExe+',0'
    $link.Description = 'TeamSpeak with automatic local layout enhancements'
    $link.WindowStyle = 7
    $link.Save()
    $check = $shell.CreateShortcut($staged)
    if ($check.TargetPath -ne $pwsh -or $check.Arguments -ne $link.Arguments) { throw 'Shortcut verification failed; original remains unchanged.' }
    $state.release = $release
    $state.installed = $true
} else {
    $staged = $original
    $state.installed = $false
}
try {
    # Fail closed if another process edited the link while files were staged.
    if ((Get-Hash $ShortcutPath) -ne $state.currentHash) { throw 'Shortcut changed during setup; refusing replacement.' }
    Copy-Item -LiteralPath $staged -Destination $ShortcutPath -Force
    $state.currentHash = Get-Hash $ShortcutPath
    $nextState = Join-Path $history 'next-state.json'
    $state | ConvertTo-Json | Set-Content -LiteralPath $nextState -Encoding utf8
    [IO.File]::Move($nextState,$statePath,$true)
} catch {
    # Only roll back our own replacement, never an unrelated concurrent edit.
    if ((Get-Hash $ShortcutPath) -eq (Get-Hash $staged)) {
        Copy-Item -LiteralPath (Join-Path $history 'TeamSpeak.lnk') -Destination $ShortcutPath -Force
    }
    throw
}
Write-Output "$Action complete: $ShortcutPath"
Write-Output "Original shortcut backup: $original"
Write-Output 'No running client, native file, startup task, protocol handler or pinned taskbar shortcut was changed.'
