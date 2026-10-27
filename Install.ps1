#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'scripts\Native-Setup.ps1') -Action Install -WhatIf:$WhatIfPreference
