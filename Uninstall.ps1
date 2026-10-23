#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts\Setup.ps1') -Action Uninstall -WhatIf:$WhatIfPreference
