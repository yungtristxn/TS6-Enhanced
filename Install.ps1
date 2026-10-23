#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Update)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts\Setup.ps1') -Action $(if ($Update) {'Update'} else {'Install'}) -WhatIf:$WhatIfPreference
