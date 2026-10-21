#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param([string]$Directory)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
if (!$Directory) {
    $version = (Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw | ConvertFrom-Json).version
    $Directory = Join-Path $project "dist/$version"
}
$Directory = [IO.Path]::GetFullPath($Directory)
$release = Get-Content -LiteralPath (Join-Path $Directory 'release.json') -Raw | ConvertFrom-Json
$repository = $release.updates.repository
if (!$repository -or $repository -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+$' -or $repository.Split('/')[1] -in @('.','..')) {
    throw 'Build with -Installer -ForPublication -Repository owner/repository before uploading.'
}
if ($release.version -notmatch '^\d+\.\d+\.\d+(-[a-z0-9.]+)?$' -or
    $release.channel -notin @('stable','preview') -or $release.updates.channel -ne $release.channel -or
    (($release.channel -eq 'stable') -eq $release.version.Contains('-'))) {
    throw 'Release version and channels do not agree.'
}
$tag = 'v'+$release.version
$displayVersion=$release.version -replace '^(\d+\.\d+)\.0$','$1'
$zip = Join-Path $Directory ('TS6-Enhanced-'+$release.version+'-windows-x64.zip')
$exe = Join-Path $Directory ('TS6-Enhanced-'+$release.version+'-Setup.exe')
& (Join-Path $project 'tests/release.ps1') -ArchivePath $zip -PackageOnly -Installer -ExpectedRepository $repository
# Explicit files only: never upload logs, other builds or private files alongside them.
$assets = @($exe,($exe+'.sha256'),$zip,($zip+'.sha256'),(Join-Path $Directory 'release.json'))
Write-Output "$repository / $tag"
$assets | ForEach-Object { Write-Output ([IO.Path]::GetFileName($_)) }
if (!$PSCmdlet.ShouldProcess("github.com/$repository / $tag",'Create a draft release and upload the five validated files')) { return }
if (!(Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install GitHub CLI and run gh auth login first.' }
$releaseArgs = @('release','create',$tag,'--repo',"github.com/$repository",'--verify-tag','--draft',
    '--title',('TS6 Enhanced '+$displayVersion),'--generate-notes')
if ($release.channel -eq 'preview') { $releaseArgs += @('--prerelease','--latest=false') }
& gh @releaseArgs @assets
if ($LASTEXITCODE -ne 0) { throw 'Draft upload failed. Inspect the GitHub release before retrying; existing releases and assets are not replaced.' }
Write-Output 'Draft uploaded. Review its files and release notes on GitHub before publishing.'
