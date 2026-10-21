#requires -Version 7.0
[CmdletBinding()]
param([string]$ClientPath = (Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak'))
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$theme = Join-Path $project 'theme\local.tsix.layout'
$schema = Join-Path $ClientPath 'docs\extensions.json'
# PowerShell registers draft-07 under its canonical HTTP URI. The bundled TS6
# schema uses HTTPS, which otherwise makes Test-Json fetch the same dialect.
# Normalize only that identifier so validation works offline; keep every rule.
$schemaText = (Get-Content -LiteralPath $schema -Raw).Replace('"$schema": "https://json-schema.org/draft-07/schema"', '"$schema": "http://json-schema.org/draft-07/schema#"')
if (!(Test-Json -Json (Get-Content -LiteralPath (Join-Path $theme 'package.json') -Raw) -Schema $schemaText)) { throw 'Official manifest schema validation failed.' }
$css = Get-Content -LiteralPath (Join-Path $theme 'layout.css') -Raw
if ($css -match '@import|url\s*\(') { throw 'This layout theme must be self-contained, without imported styles or content.' }
if ($css -match 'data-v-|!important[^;{]*--grid-|zoom\s*:') { throw 'Build hashes, tile geometry overrides, and UI zoom do not belong in the theme.' }
[xml](Get-Content -LiteralPath (Join-Path $theme 'preview.svg') -Raw) | Out-Null
$clientCss = Get-Content -LiteralPath (Join-Path $ClientPath 'html\client_ui\main.css') -Raw
$clientJs = Get-Content -LiteralPath (Join-Path $ClientPath 'html\client_ui\main.js') -Raw
# Strip comments before extracting simple class tokens. All classes must exist in
# this installed build; composed selectors additionally need DOM/runtime checks.
$withoutComments = [regex]::Replace($css, '/\*[\s\S]*?\*/', '')
$classes = [regex]::Matches($withoutComments, '(?<![\w-])\.([a-z][\w-]+)') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
foreach ($class in $classes) {
    if (!$clientCss.Contains('.' + $class) -and !$clientJs.Contains($class)) { throw "Selector class is absent from this build: $class" }
}
foreach ($variable in @('--ts-tree-client-height-compact','--ts-tree-client-height-default','--ts-tree-channel-height-default','--ts-tree-spacer-height-default')) {
    if (!$clientJs.Contains('variableCache.get("' + $variable + '"')) { throw "Tree virtualizer no longer reads $variable. Re-audit the build." }
}
Write-Output "PASS: official schema, local assets, and $($classes.Count) observed selector classes."
Write-Output 'This is static validation; live scrolling, controls and stream playback require separate checks.'
