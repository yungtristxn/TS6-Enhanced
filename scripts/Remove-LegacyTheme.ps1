#requires -Version 5.1
# Preserve an owned 1.x theme as a backup when restoring the user's appearance.
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Uninstall')][string]$Action = 'Uninstall',
    [string]$ExtensionsPath = (Join-Path $env:APPDATA 'TeamSpeak\Default\extensions'),
    [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA 'TS6-Layout\backups')
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try {
$identifier = 'local.tsix.layout'
$projectId = 'ts6-layout-project-v1'

function Get-AbsolutePath([string]$Path) {
    return [IO.Path]::GetFullPath($Path)
}
function Assert-PlainPath([string]$Path) {
    $cursor = Get-AbsolutePath $Path
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $item = Get-Item -LiteralPath $cursor -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point refused: $cursor" }
        }
        $parent = Split-Path -Parent $cursor
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}
function Assert-Package([string]$Path, [bool]$RequireOwner) {
    Assert-PlainPath $Path
    if (!(Test-Path -LiteralPath $Path -PathType Container)) { throw "Package directory missing: $Path" }
    # Inspect one level at a time; never descend into a junction/symlink.
    $queue = [Collections.Generic.Queue[string]]::new()
    $queue.Enqueue($Path)
    while ($queue.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $queue.Dequeue() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked package content refused: $($item.FullName)" }
            if ($item.PSIsContainer) { $queue.Enqueue($item.FullName) }
        }
    }
    if ($RequireOwner) {
        $ownerPath = Join-Path $Path '.tsix-owner.json'
        if (!(Test-Path -LiteralPath $ownerPath)) { throw 'Existing directory has no project ownership marker; refusing to replace it.' }
        $owner = Get-Content -LiteralPath $ownerPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($owner.project -cne $projectId -or $owner.identifier -cne $identifier) { throw 'Existing directory belongs to another project.' }
    }
}
function New-BackupPath {
    $snapshot = Join-Path $BackupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Path $snapshot -Force | Out-Null
    return Join-Path $snapshot $identifier
}

$ExtensionsPath = Get-AbsolutePath $ExtensionsPath
$BackupRoot = Get-AbsolutePath $BackupRoot
$destination = Get-AbsolutePath (Join-Path $ExtensionsPath $identifier)
if ((Split-Path -Parent $destination) -ne $ExtensionsPath.TrimEnd('\')) { throw 'Destination escaped the extensions directory.' }
Assert-PlainPath $ExtensionsPath
Assert-PlainPath $BackupRoot
# Backups must never be nested in the installed package.
foreach ($path in @($BackupRoot)) {
    if ($path -eq $destination -or $path.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe overlapping paths.' }
}
if ($BackupRoot -eq $ExtensionsPath -or $BackupRoot.StartsWith($ExtensionsPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backups must be outside the extensions directory.' }
$exists = Test-Path -LiteralPath $destination
if ($exists) { Assert-Package $destination $true }
if ($Action -eq 'Uninstall') {
    if (!$exists) { Write-Output 'Theme is already absent.'; return }
    if ($PSCmdlet.ShouldProcess($destination, 'Move this project theme into a recovery backup')) {
        $snapshot = New-BackupPath
        Move-Item -LiteralPath $destination -Destination $snapshot
        Write-Output "Uninstalled. Recovery backup: $snapshot"
    }
    return
}
}finally{Exit-LayoutOperation $operation}
