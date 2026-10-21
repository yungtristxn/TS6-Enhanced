#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Install','Update','Uninstall','Restore')][string]$Action = 'Install',
    [string]$ExtensionsPath = (Join-Path $env:APPDATA 'TeamSpeak\Default\extensions'),
    [string]$BackupRoot = (Join-Path $env:LOCALAPPDATA 'TS6-Layout\backups'),
    [string]$BackupPath
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try {
$identifier = 'local.tsix.layout'
$projectId = 'ts6-layout-project-v1'
$sourcePath = Join-Path $PSScriptRoot "..\theme\$identifier"
$clientSchema = Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\docs\extensions.json'

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
function Assert-Package([string]$Path, [bool]$RequireOwner, [bool]$OwnershipOnly=$false) {
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
        $owner = Get-Content -LiteralPath $ownerPath -Raw | ConvertFrom-Json
        if ($owner.project -cne $projectId -or $owner.identifier -cne $identifier) { throw 'Existing directory belongs to another project.' }
    }
    if($OwnershipOnly){return}
    $json = Get-Content -LiteralPath (Join-Path $Path 'package.json') -Raw
    $manifest = $json | ConvertFrom-Json
    if ($manifest.identifier -cne $identifier) { throw 'Package identifier mismatch' }
    # Replacement sources must be complete; damaged owned destinations are
    # retained intact in recovery storage rather than required to validate.
    $schemaText = (Get-Content -LiteralPath $clientSchema -Raw).Replace('"$schema": "https://json-schema.org/draft-07/schema"', '"$schema": "http://json-schema.org/draft-07/schema#"')
    if (!(Test-Json -Json $json -Schema $schemaText)) { throw 'Package does not match the installed official extension schema.' }
    foreach ($file in @('layout.css','preview.svg')) {
        if (!(Test-Path -LiteralPath (Join-Path $Path $file) -PathType Leaf)) { throw "Missing asset: $file" }
    }
}
function Get-PackageHashes([string]$Path) {
    $base = (Get-AbsolutePath $Path).TrimEnd('\') + '\'
    return @(Get-ChildItem -LiteralPath $Path -Recurse -Force -File | Sort-Object FullName | ForEach-Object {
        ($_.FullName.Substring($base.Length)) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    })
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
# Backups and source must never be nested in the installed package.
foreach ($path in @($BackupRoot, (Get-AbsolutePath $sourcePath))) {
    if ($path -eq $destination -or $path.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe overlapping paths.' }
}
if ($BackupRoot -eq $ExtensionsPath -or $BackupRoot.StartsWith($ExtensionsPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backups must be outside the extensions directory.' }
$exists = Test-Path -LiteralPath $destination
if ($exists) { Assert-Package $destination $true $true }
if ($Action -eq 'Update' -and !$exists) { throw 'Theme is not installed. Use Install first.' }
if ($Action -eq 'Uninstall') {
    if (!$exists) { Write-Output 'Theme is already absent.'; return }
    if ($PSCmdlet.ShouldProcess($destination, 'Move this project theme into a recovery backup')) {
        $snapshot = New-BackupPath
        Move-Item -LiteralPath $destination -Destination $snapshot
        Write-Output "Uninstalled. Recovery backup: $snapshot"
    }
    return
}
if ($Action -eq 'Restore') {
    if (!$BackupPath) { throw 'Restore requires -BackupPath pointing to a saved local.tsix.layout directory.' }
    $sourcePath = Get-AbsolutePath $BackupPath
    if ($sourcePath -eq $destination -or $sourcePath.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup cannot be the installed package.' }
    Assert-Package $sourcePath $true
} else { Assert-Package $sourcePath $false }
if (!$PSCmdlet.ShouldProcess($destination, "$Action this project theme (back up any existing project version)")) { return }

# Stage before moving the current version. A failed copy leaves the install intact.
$stagingRoot = Join-Path (Split-Path -Parent $BackupRoot) ('staging-' + [guid]::NewGuid().ToString('N'))
Assert-PlainPath $stagingRoot
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
$staged = Join-Path $stagingRoot $identifier
Copy-Item -LiteralPath $sourcePath -Destination $staged -Recurse -Force
if (Compare-Object (Get-PackageHashes $sourcePath) (Get-PackageHashes $staged)) { throw "Staging verification failed; current install unchanged. Stage: $staged" }
@{ project = $projectId; identifier = $identifier; installedUtc = [DateTime]::UtcNow.ToString('o') } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $staged '.tsix-owner.json') -Encoding utf8
Assert-Package $staged $true
New-Item -ItemType Directory -Path $ExtensionsPath -Force | Out-Null
$snapshot = $null
if ($exists) {
    Assert-Package $destination $true $true
    $snapshot = New-BackupPath
    Move-Item -LiteralPath $destination -Destination $snapshot
}
try {
    if (Test-Path -LiteralPath $destination) { throw 'Destination appeared during staging; refusing to overwrite or nest the theme.' }
    Move-Item -LiteralPath $staged -Destination $destination
} catch {
    # Do not overwrite an unexpected destination created concurrently.
    if ($snapshot -and !(Test-Path -LiteralPath $destination)) { Copy-Item -LiteralPath $snapshot -Destination $destination -Recurse -Force }
    throw
}
# Only the now-empty, known staging directory is removed; backups are retained.
Remove-Item -LiteralPath $stagingRoot
Write-Output "$Action complete: $destination"
if ($snapshot) { Write-Output "Previous version backup: $snapshot" }
Write-Output 'In TS6: Settings > Appearance > User Theme > Refresh. Select TS6 Enhanced. See README for refreshing cached row metrics without restarting.'

}finally{Exit-LayoutOperation $operation}
