#requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ArchivePath, [switch]$PackageOnly,[string]$ExpectedRepository,[switch]$Installer)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$ArchivePath = [IO.Path]::GetFullPath($ArchivePath)
$manifest = Get-Content (Join-Path $project 'release.json') -Raw | ConvertFrom-Json
$prefix = 'TS6-Enhanced-'+$manifest.version+'-windows-x64/'
$expectedFiles = @('Install.cmd','Uninstall.cmd','Install.ps1','Uninstall.ps1','release.json','runtime-lock.json','LICENSE','README.md','SHA256SUMS.txt',
    'scripts/Bootstrap.ps1','scripts/Runtime.ps1','scripts/Complete-Setup.ps1','scripts/Maintenance.ps1',
    'scripts/Setup.ps1','scripts/Start-Layout.ps1','scripts/Start-Inspection.ps1',
    'scripts/Install-Persistence.ps1','scripts/Theme.ps1','scripts/Test-Theme.ps1',
    'tools/cdp.mjs','tools/client.mjs','tools/session.mjs','tools/appearance.mjs','tools/install-state.mjs','tools/restore.mjs','tools/updates.mjs','tools/manager.mjs','tools/manager-lock.mjs','tools/manager-runtime.js','tools/streams-runtime.js','tools/workspace-runtime.js',
    'theme/local.tsix.layout/package.json','theme/local.tsix.layout/layout.css','theme/local.tsix.layout/preview.svg')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
    $names = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
    foreach ($name in $names) {
        if (!$name.StartsWith($prefix) -or $name -match '(^|/)\.\.?(/|$)|\.local|\.git|node_modules|\.lnk$|\.db|\.log$|screenshots|backups|[a-z]:') {
            throw "Unexpected or private archive path: $name"
        }
    }
    if (($names | Sort-Object -Unique).Count -ne $names.Count) { throw 'Duplicate archive entries' }
    $fileNames = @($names | Where-Object { !$_.EndsWith('/') })
    if (Compare-Object ($expectedFiles | ForEach-Object { $prefix+$_ }) $fileNames) { throw 'Release contents differ from the minimal runtime inventory' }
} finally { $zip.Dispose() }
$scratch = Join-Path $project ('.local\release-tests\'+[guid]::NewGuid().ToString('N'))
[IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath,$scratch)
$root = Join-Path $scratch $prefix.TrimEnd('/')
$packagedRelease=Get-Content -LiteralPath (Join-Path $root 'release.json') -Raw | ConvertFrom-Json
$packagedTheme=Get-Content -LiteralPath (Join-Path $root 'theme\local.tsix.layout\package.json') -Raw | ConvertFrom-Json
if($packagedRelease.version -cne $manifest.version){throw 'Packaged release version differs from the source version'}
if($ExpectedRepository -and $packagedRelease.updates.repository -cne $ExpectedRepository){throw 'Packaged update repository differs from the intended release repository'}
if($packagedRelease.updates.repository -and $packagedTheme.repository -cne ('https://github.com/'+$packagedRelease.updates.repository)){throw 'Theme repository and update repository disagree'}
$checksumLines = Get-Content -LiteralPath (Join-Path $root 'SHA256SUMS.txt')
$hashedFiles = @()
foreach ($line in $checksumLines) {
    if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw 'Malformed file checksum' }
    $expected=$Matches[1];$relative=$Matches[2]
    $hashedFiles += $relative
    if ($relative -match '(^|/)\.\.?(/|$)|[a-z]:|^/') { throw 'Unsafe checksum path' }
    $file = Join-Path $root $relative
    if ((Get-FileHash -LiteralPath $file).Hash -ne $expected) { throw "Checksum mismatch: $relative" }
    $content = Get-Content -LiteralPath $file -Raw
    if ($content -match '(?i)[a-z]:[\\/]+Users[\\/]+[^\\/\s]+') { throw "Developer-specific absolute path: $relative" }
}
if ($hashedFiles.Count -ne ($hashedFiles | Sort-Object -Unique).Count -or
    (Compare-Object ($expectedFiles | Where-Object { $_ -ne 'SHA256SUMS.txt' }) $hashedFiles)) { throw 'Missing or duplicate file checksums' }
$artifacts = @($ArchivePath)
if ($Installer) {
    $directory = Split-Path -Parent $ArchivePath
    $metadata = Join-Path $directory 'release.json'
    if ((Get-FileHash -LiteralPath $metadata).Hash -ne (Get-FileHash -LiteralPath (Join-Path $root 'release.json')).Hash) {
        throw 'Release metadata differs from the packaged metadata'
    }
    $exe = Join-Path $directory ('TS6-Enhanced-'+$manifest.version+'-Setup.exe')
    $bytes = [IO.File]::ReadAllBytes($exe)
    $offset = if ($bytes.Length -ge 64) { [BitConverter]::ToUInt32($bytes,60) } else { 0 }
    if ($offset -lt 64 -or $offset+6 -gt $bytes.Length -or $bytes[0] -ne 77 -or $bytes[1] -ne 90 -or
        [BitConverter]::ToUInt32($bytes,$offset) -ne 0x4550 -or [BitConverter]::ToUInt16($bytes,$offset+4) -notin @(0x14c,0x8664)) {
        throw 'Release EXE is not a Windows x86/x64 installer'
    }
    $artifacts += $exe
}
foreach ($artifact in $artifacts) {
    $checksum = (Get-Content -LiteralPath ($artifact+'.sha256') -Raw).TrimEnd()
    if ($checksum -cnotmatch '^([a-f0-9]{64})  (.+)$') { throw 'Malformed artifact checksum' }
    if ($Matches[2] -cne [IO.Path]::GetFileName($artifact) -or (Get-FileHash -LiteralPath $artifact).Hash -ne $Matches[1]) {
        throw "Artifact checksum mismatch: $artifact"
    }
}
if ($Installer) { Write-Output 'PASS: installer format/hash and matching release metadata.' }
if ($PackageOnly) {
    Write-Output 'PASS: exact package inventory, no private paths/data files, and all file/archive hashes. Installed-client preflight was not requested.'
    return
}
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'TeamSpeak.lnk'
$before = (Get-FileHash -LiteralPath $shortcut).Hash
& (Join-Path $root 'Install.ps1') -RepairShortcut -WhatIf
if ((Get-FileHash -LiteralPath $shortcut).Hash -ne $before) { throw 'Extracted-package preflight changed the real shortcut' }
# Prove unsupported resources stop setup before any installer mutation.
$releaseFile = Join-Path $root 'release.json'
$bytes = [IO.File]::ReadAllBytes($releaseFile)
try {
    $bad = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
    $bad.supportedClient.resourceHashes.'html/client_ui/main.js' = '0'*64
    $bad | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $releaseFile -Encoding utf8
    $refused = $false
    try { & (Join-Path $root 'Install.ps1') -WhatIf } catch { $refused=$_.Exception.Message.Contains('Unsupported or modified TS6 UI resources') }
    if (!$refused) { throw 'Wrong client resources were not refused' }
    if ((Get-FileHash -LiteralPath $shortcut).Hash -ne $before) { throw 'Failed preflight changed the shortcut' }
} finally { [IO.File]::WriteAllBytes($releaseFile,$bytes) }
Write-Output 'PASS: exact package inventory, no private paths/data files, all file/archive hashes, extracted-package preflight, and unsupported-client refusal.'
