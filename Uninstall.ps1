#requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param([switch]$RepairShortcut)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts\Setup.ps1') -Action Uninstall -RepairShortcut:$RepairShortcut -WhatIf:$WhatIfPreference
