#requires -Version 5.1
# Portable dependencies for the current user. No admin, PATH edits or winget.
function Assert-LayoutPlainPath([string]$Path) {
    for ($cursor=[IO.Path]::GetFullPath($Path); $cursor; $cursor=Split-Path -Parent $cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Linked setup path refused: $cursor"
        }
        if ($cursor -eq (Split-Path -Parent $cursor)) { break }
    }
}
function Test-LayoutRuntime([string]$Path, [int]$MinimumMajor) {
    if (!$Path -or !(Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $version = & $Path --version 2>$null
        return $LASTEXITCODE -eq 0 -and "$version" -match '(\d+)\.\d+\.\d+' -and [int]$Matches[1] -ge $MinimumMajor
    } catch { return $false }
}
function Resolve-LayoutRuntime {
    param([string]$Name, $Spec, [string]$Root, [switch]$PortableOnly)
    if (!$PortableOnly) {
        $command = $(if ($Name -eq 'powershell') {'pwsh.exe'} else {'node.exe'})
        $existing = Get-Command $command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($existing -and (Test-LayoutRuntime $existing.Source $Spec.minimumMajor)) { return $existing.Source }
    }
    if ($Name -notin @('powershell','node') -or $Spec.version -notmatch '^\d+\.\d+\.\d+$' -or $Spec.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid runtime lock.' }
    $uri = [uri]$Spec.url
    if ($uri.Scheme -ne 'https' -or $uri.Host -notin @('github.com','nodejs.org')) { throw 'Runtime downloads must use the official HTTPS source.' }
    $Root = [IO.Path]::GetFullPath($Root)
    Assert-LayoutPlainPath $Root
    $destination = Join-Path $Root ($Name+'-'+$Spec.version)
    $executable = [IO.Path]::GetFullPath((Join-Path $destination $Spec.executable))
    if (!$executable.StartsWith($destination+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe runtime executable path.' }
    Assert-LayoutPlainPath $executable
    $receipt = Join-Path $destination '.tsix-runtime.json'
    if (Test-Path -LiteralPath $destination) {
        if (!(Test-Path -LiteralPath $receipt)) { throw "Unrecognized runtime directory. Left unchanged: $destination" }
        $saved = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
        if ($saved.archiveHash -ne $Spec.sha256 -or !(Test-Path -LiteralPath $executable) -or
            (Get-FileHash -LiteralPath $executable).Hash -ne $saved.executableHash -or !(Test-LayoutRuntime $executable $Spec.minimumMajor)) {
            throw "The cached $Name runtime failed verification. Left unchanged: $destination"
        }
        return $executable
    }
    $stage = Join-Path $Root ('download-'+[guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    $archive = Join-Path $stage 'runtime.zip'
    Write-Host "Downloading $Name $($Spec.version) from $($uri.Host)..."
    $oldProgress = $ProgressPreference
    try {
        $ProgressPreference = 'SilentlyContinue'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri $Spec.url -OutFile $archive -TimeoutSec 180
    } finally { $ProgressPreference = $oldProgress }
    if ((Get-FileHash -LiteralPath $archive).Hash -ne $Spec.sha256) { throw "Downloaded $Name checksum mismatch. Nothing from the download was executed. Retry with a fresh official package." }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $content = Join-Path $stage 'content'
    [IO.Compression.ZipFile]::ExtractToDirectory($archive,$content)
    $stagedExe = Join-Path $content $Spec.executable
    if (!(Test-LayoutRuntime $stagedExe $Spec.minimumMajor)) { throw "Downloaded $Name could not run on this Windows installation." }
    @{ archiveHash=$Spec.sha256; executableHash=(Get-FileHash -LiteralPath $stagedExe).Hash } | ConvertTo-Json |
        Set-Content -LiteralPath (Join-Path $content '.tsix-runtime.json') -Encoding UTF8
    # Stage only inside the checked runtime root; never replace an unknown folder.
    Assert-LayoutPlainPath $destination
    if (Test-Path -LiteralPath $destination) { throw 'Runtime destination appeared during setup. Rerun setup to verify it.' }
    Move-Item -LiteralPath $content -Destination $destination
    Remove-Item -LiteralPath $archive
    Remove-Item -LiteralPath $stage
    return $executable
}
function Assert-LayoutPackage([string]$Root) {
    $checksums = Join-Path $Root 'SHA256SUMS.txt'
    # A source checkout has no manifest; distributed ZIPs always include it.
    if (!(Test-Path -LiteralPath $checksums)) { return }
    foreach ($line in Get-Content -LiteralPath $checksums) {
        if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw 'Invalid package checksum list. Extract a fresh copy of the whole ZIP.' }
        $hash=$Matches[1]; $relative=$Matches[2]
        if ($relative -match '(^|[/\\])\.\.?([/\\]|$)|:|^[/\\]') { throw 'Unsafe package checksum path.' }
        $path=Join-Path $Root $relative
        Assert-LayoutPlainPath $path
        if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path).Hash -ne $hash) { throw "Incomplete or changed package ($relative). Extract a fresh copy of the whole ZIP." }
    }
}
