#requires -Version 7.0
# One command from a clean main branch to a published GitHub release:
# checks, tests, build, tag, draft upload, digest verification, publish.
# Every outward step asks for confirmation; -WhatIf previews them all.
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [string]$NotesFile,
    [switch]$SkipTests,
    [string]$CefSdkDirectory,
    [string]$Remote = 'origin'
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed: $($Arguments -join ' ')" }
}
function Step([string]$Text) { Write-Output "`n== $Text" }
Push-Location $project
try {
    $release = Get-Content -LiteralPath release.json -Raw | ConvertFrom-Json
    $version = $release.version
    $tag = "v$version"
    $repository = $release.updates.repository
    if (!$NotesFile) { $NotesFile = Join-Path $project "docs/releases/$version.md" }
    $NotesFile = [IO.Path]::GetFullPath($NotesFile)

    Step "Preflight for $repository $tag"
    if (!(Test-Path -LiteralPath $NotesFile -PathType Leaf) -or ![IO.File]::ReadAllText($NotesFile).Trim()) {
        throw "Write release notes first: $NotesFile"
    }
    if (!(Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI and run gh auth login first.' }
    Run gh @('auth', 'status')
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -ne 'main') { throw "Release from main, not $branch." }
    if (git status --porcelain) { throw 'Commit or stash local changes first; the release must match a commit.' }
    if (git tag --list $tag) { throw "Tag $tag already exists locally. Bump release.json for a new release." }
    if (git ls-remote --tags $Remote "refs/tags/$tag") { throw "Tag $tag already exists on $Remote." }
    $css = Get-Content -LiteralPath theme/layout.css -Raw
    if ($css -notmatch "--tsix-layout-version:\s*$([regex]::Escape($version));") { throw 'Update the version marker in theme/layout.css.' }

    if ($SkipTests) { Write-Warning 'Skipping checks and tests.' }
    else {
        Step 'Format check'
        Run npm @('run', '-s', 'format:check')
        foreach ($suite in 'Core', 'Browser', 'Native') {
            Step "$suite suite"
            Run pwsh @('-NoProfile', '-File', 'scripts/Test-Project.ps1', '-Suite', $suite)
        }
    }

    Step 'Build installer'
    $build = @('-NoProfile', '-File', 'scripts/Build-Release.ps1', '-Installer', '-ForPublication', '-Repository', $repository)
    if ($CefSdkDirectory) { $build += @('-CefSdkDirectory', $CefSdkDirectory) }
    Run pwsh $build
    $directory = Join-Path $project "dist/$version"
    $assets = Get-ChildItem -LiteralPath $directory -File | Where-Object Name -in @(
        "TS6-Enhanced-$version-Setup.exe", "TS6-Enhanced-$version-Setup.exe.sha256",
        "TS6-Enhanced-$version-Update.exe", "TS6-Enhanced-$version-Update.exe.sha256",
        "TS6-Enhanced-$version-windows-x64.zip", "TS6-Enhanced-$version-windows-x64.zip.sha256", 'release.json')
    if ($assets.Count -ne 7) { throw "Expected seven release files in $directory." }
    $local = @{}
    foreach ($asset in $assets) { $local[$asset.Name] = (Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }

    if (!$PSCmdlet.ShouldProcess("$Remote main and $tag", 'Push main and create the release tag')) { return }
    Step 'Push and tag'
    Run git @('push', $Remote, 'main')
    Run git @('tag', '-a', $tag, '-m', "TS6 Enhanced $version")
    Run git @('push', $Remote, $tag)

    Step 'Upload draft'
    Run pwsh @('-NoProfile', '-File', 'scripts/Upload-Release.ps1', '-NotesFile', $NotesFile)

    Step 'Verify uploaded files'
    $remoteAssets = gh release view $tag --repo "github.com/$repository" --json assets --jq '.assets[] | "\(.name) \(.digest)"'
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the draft release.' }
    $seen = @{}
    foreach ($line in $remoteAssets) {
        $name, $digest = $line -split ' ', 2
        if (!$local.ContainsKey($name)) { throw "Unexpected asset on the draft: $name" }
        if ($digest -ne "sha256:$($local[$name])") { throw "Digest mismatch for $name. The draft stays unpublished." }
        $seen[$name] = $true
        Write-Output "  $name  sha256:$($local[$name])"
    }
    if ($seen.Count -ne $local.Count) { throw 'The draft is missing release files. It stays unpublished.' }

    if (!$PSCmdlet.ShouldProcess("github.com/$repository $tag", 'Publish the verified draft release')) {
        Write-Output 'Draft uploaded and verified; publish it on GitHub when ready.'
        return
    }
    Step 'Publish'
    $publish = @('release', 'edit', $tag, '--repo', "github.com/$repository", '--draft=false')
    $publish += if ($release.channel -eq 'stable') { '--latest' } else { '--latest=false' }
    Run gh $publish
    $url = gh release view $tag --repo "github.com/$repository" --json url --jq .url
    Write-Output "`nPublished $url"
} finally {
    Pop-Location
}
