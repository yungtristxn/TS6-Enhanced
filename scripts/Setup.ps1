#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param([ValidateSet('Install','Update','Uninstall')][string]$Action = 'Install', [switch]$RepairShortcut, [string]$NodePath)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try {
$project = Split-Path -Parent $PSScriptRoot
$release = Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$client = Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'TeamSpeak.lnk'
$themeTool = Join-Path $PSScriptRoot 'Theme.ps1'
$persistenceTool = Join-Path $PSScriptRoot 'Install-Persistence.ps1'
if ($Action -eq 'Uninstall') {
    & $persistenceTool Uninstall -RepairShortcut:$RepairShortcut -WhatIf
    & $themeTool Uninstall -WhatIf
    if ($PSCmdlet.ShouldProcess('TS6 Enhanced','Restore saved appearance and the original shortcut, remove the owned theme, and restart TeamSpeak')) {
        & (Join-Path $PSScriptRoot 'Maintenance.ps1') Remove -NodePath $NodePath -Restart
    }
    Write-Output 'Recovery files and previous launcher releases are retained under LocalAppData\TS6-Layout.'
    return
}

# Read-only preflight finishes before either installation is touched.
if (!(Test-Path -LiteralPath (Join-Path $client 'TeamSpeak.exe'))) {
    throw 'This release supports the default per-user TS6 installation: %LOCALAPPDATA%\Programs\TeamSpeak.'
}
foreach ($property in $release.supportedClient.resourceHashes.PSObject.Properties) {
    $path = Join-Path $client $property.Name
    if (!(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $property.Value) {
        throw "Unsupported or modified TS6 UI resources. This release supports $($release.supportedClient.version), build $($release.supportedClient.build). Nothing was installed."
    }
}
if (!(Test-Path -LiteralPath $shortcut)) {
    throw 'This release requires the standard per-user TeamSpeak Start Menu shortcut. Custom/all-users installations need separate validation; nothing was installed.'
}
& $themeTool $Action -WhatIf
& $persistenceTool Install -RepairShortcut:$RepairShortcut -NodePath $NodePath -WhatIf
if (!$PSCmdlet.ShouldProcess('TS6 Enhanced',"$Action the official theme and automatic attachment on normal Start Menu launch")) { return }
$destination=Join-Path $env:APPDATA 'TeamSpeak\Default\extensions\local.tsix.layout'
$checkpoint=Join-Path $env:LOCALAPPDATA ('TS6-Layout\transactions\'+[guid]::NewGuid().ToString('N')+'\local.tsix.layout')
. (Join-Path $PSScriptRoot 'Runtime.ps1')
Assert-LayoutPlainPath $checkpoint
$hadTheme=Test-Path -LiteralPath $destination
if($hadTheme){New-Item -ItemType Directory -Path (Split-Path -Parent $checkpoint) -Force | Out-Null;Copy-Item -LiteralPath $destination -Destination $checkpoint -Recurse -Force}
& $themeTool $Action
try { & $persistenceTool Install -RepairShortcut:$RepairShortcut -NodePath $NodePath }
catch {
    $failure=$_.Exception.Message
    try {if($hadTheme){& $themeTool Restore -BackupPath $checkpoint}else{& $themeTool Uninstall}}
    catch {throw "Shortcut setup failed; theme recovery also needs attention. Original files remain at $checkpoint. $failure. $($_.Exception.Message)"}
    throw "Shortcut setup failed. The previous theme installation was restored. $failure"
}
Write-Output "TS6 Enhanced $($release.version) installed for the current Windows user."
Write-Output 'The next managed launch activates the theme and compact tree automatically.'
Write-Output 'Subsequent Start Menu launches attach automatically. Existing direct EXE launches, protocol links and taskbar pins are not intercepted.'
}finally{Exit-LayoutOperation $operation}
