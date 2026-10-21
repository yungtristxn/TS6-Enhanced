#requires -Version 7.0
[CmdletBinding()]
param([string]$OutputDirectory,[string]$Repository,[switch]$Installer,[string]$Compiler,[switch]$ForPublication)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$release = Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw | ConvertFrom-Json
if(!$Repository){$Repository=$release.updates.repository}
if($Repository){if($Repository -notmatch '^[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+$' -or $Repository.Split('/')[1] -in @('.','..')){throw 'Use a GitHub owner/repository'};$release.updates.repository=$Repository}
if ($release.version -notmatch '^\d+\.\d+\.\d+(-[a-z0-9.]+)?$') { throw 'Invalid release version.' }
if($release.channel -notin @('stable','preview') -or $release.updates.channel -ne $release.channel){throw 'Release and update channels must agree: stable or preview.'}
if(($release.channel -eq 'stable') -eq $release.version.Contains('-')){throw 'Stable versions have no prerelease suffix; preview versions require one.'}
if($ForPublication -and (!$Repository -or !$Installer)){throw 'Publication builds require -Installer and a real -Repository owner/repository.'}
if($Installer){
    if(!$Compiler){$Compiler=(Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source}
    if(!$Compiler){$Compiler=Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'}
    if(!(Test-Path -LiteralPath $Compiler -PathType Leaf)){throw 'Inno Setup 6 compiler not found. Pass -Compiler with its ISCC.exe path.'}
}
$packageName = 'TS6-Enhanced-'+$release.version+'-windows-x64'
if(!$OutputDirectory){$OutputDirectory=Join-Path $project ('dist\'+$release.version)}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
for ($cursor=$OutputDirectory; $cursor; $cursor=Split-Path -Parent $cursor) {
    if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked release output path refused.' }
    if ($cursor -eq (Split-Path -Parent $cursor)) { break }
}
# Explicit allowlist: never archive the checkout, .local, installed client,
# profile, screenshots, logs, runtime backups or personal launch shortcuts.
$files = @('Install.cmd','Uninstall.cmd','Install.ps1','Uninstall.ps1','release.json','runtime-lock.json','LICENSE',
    'scripts\Bootstrap.ps1','scripts\Runtime.ps1','scripts\Complete-Setup.ps1','scripts\Maintenance.ps1',
    'scripts\Setup.ps1','scripts\Start-Layout.ps1','scripts\Start-Inspection.ps1',
    'scripts\Install-Persistence.ps1','scripts\Theme.ps1',
    'tools\cdp.mjs','tools\client.mjs','tools\session.mjs','tools\appearance.mjs','tools\install-state.mjs','tools\restore.mjs','tools\updates.mjs','tools\manager.mjs','tools\manager-lock.mjs','tools\manager-runtime.js',
    'tools\streams-runtime.js','tools\workspace-runtime.js',
    'theme\local.tsix.layout\package.json','theme\local.tsix.layout\layout.css','theme\local.tsix.layout\preview.svg')
$zipPath = Join-Path $OutputDirectory ($packageName+'.zip')
$hashPath = $zipPath+'.sha256'
$metadataPath=Join-Path $OutputDirectory 'release.json'
$exe=Join-Path $OutputDirectory ('TS6-Enhanced-'+$release.version+'-Setup.exe')
foreach($target in @($zipPath,$hashPath,$metadataPath)+$(if($Installer){@($exe,($exe+'.sha256'))}else{@()})){
    if(Test-Path -LiteralPath $target){throw 'Release already exists. Use a new version or output directory; artifacts are never overwritten.'}
}
$stage = Join-Path $project ('.local\release-staging\'+[guid]::NewGuid().ToString('N')+'\'+$packageName)
New-Item -ItemType Directory -Path $stage -Force | Out-Null
foreach ($file in $files) {
    $source = Join-Path $project $file
    if ((Get-Item -LiteralPath $source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked release input refused: $file" }
    $destination = Join-Path $stage $file
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination
}
Copy-Item -LiteralPath (Join-Path $project 'docs\release-readme.md') -Destination (Join-Path $stage 'README.md')
$release | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $stage 'release.json') -Encoding utf8
$themeManifest=Join-Path $stage 'theme\local.tsix.layout\package.json'
$theme=Get-Content -LiteralPath $themeManifest -Raw | ConvertFrom-Json
if($theme.version -ne $release.themeVersion){throw 'Theme manifest version does not match release.json.'}
if($Repository){$theme.repository='https://github.com/'+$Repository;$theme | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $themeManifest -Encoding utf8}
$checksums = @(Get-ChildItem -LiteralPath $stage -File -Recurse | Sort-Object FullName | ForEach-Object {
    (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()+'  '+$_.FullName.Substring($stage.Length+1).Replace('\','/')
})
$checksums | Set-Content -LiteralPath (Join-Path $stage 'SHA256SUMS.txt') -Encoding utf8
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
Compress-Archive -LiteralPath $stage -DestinationPath $zipPath -CompressionLevel Optimal
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
($zipHash+'  '+[IO.Path]::GetFileName($zipPath)) | Set-Content -LiteralPath $hashPath -Encoding utf8
Write-Output $zipPath
Write-Output "SHA256: $zipHash"
Copy-Item -LiteralPath (Join-Path $stage 'release.json') -Destination $metadataPath
if($Installer){
    $displayVersion=$release.version -replace '^(\d+\.\d+)\.0$','$1'
    & $Compiler /Qp ("/DPayload=$stage") ("/DAppVersion=$($release.version)") ("/DAppDisplayVersion=$displayVersion") ("/O$OutputDirectory") (Join-Path $project 'installer\Setup.iss')
    if($LASTEXITCODE -ne 0){throw 'Installer compilation failed'}
    ((Get-FileHash -LiteralPath $exe).Hash.ToLowerInvariant()+'  '+[IO.Path]::GetFileName($exe)) | Set-Content -LiteralPath ($exe+'.sha256') -Encoding utf8
    Write-Output $exe
}
& (Join-Path $project 'tests/release.ps1') -ArchivePath $zipPath -PackageOnly -Installer:$Installer -ExpectedRepository $Repository
