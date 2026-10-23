#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param([ValidateSet('Install','Update','Uninstall')][string]$Action = 'Install')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try {
$project = Split-Path -Parent $PSScriptRoot
$release = Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($release.nativeLoader.schema -eq 1){
    & (Join-Path $PSScriptRoot 'Native-Setup.ps1') -Action $(if($Action -eq 'Uninstall'){'Uninstall'}else{'Install'}) -Restart:($Action -eq 'Uninstall') -WhatIf:$WhatIfPreference
    return
}
# The native branch above owns preflight, staged backups, rollback and legacy
# migration. Do not fall back to the retired 1.x launcher installation format.
throw 'This setup requires a native TS6 Enhanced package.'
}finally{Exit-LayoutOperation $operation}
