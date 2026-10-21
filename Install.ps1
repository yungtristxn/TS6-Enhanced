#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Update, [switch]$RepairShortcut)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts\Setup.ps1') -Action $(if ($Update) {'Update'} else {'Install'}) -RepairShortcut:$RepairShortcut -WhatIf:$WhatIfPreference
