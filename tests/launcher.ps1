#requires -Version 7.0
# Exercise native argument passing and completion markers without launching TS6.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $project ('.local\launcher-tests\'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $scratch 'scripts'),(Join-Path $scratch 'tools') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'scripts\Start-Layout.ps1') -Destination (Join-Path $scratch 'scripts\Start-Layout.ps1')
@{node=(Get-Command node).Source} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $scratch 'runtime.json')
@'
import {writeFileSync} from 'node:fs';
writeFileSync(new URL('../arguments.json',import.meta.url),JSON.stringify(process.argv.slice(2)));
console.log('Fixture attachment complete');
'@ | Set-Content -LiteralPath (Join-Path $scratch 'tools\session.mjs')
function Get-Process { param($Name,$ErrorAction) [pscustomobject]@{Path=(Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe')} }
function Get-NetTCPConnection { param($LocalPort,$State,$ErrorAction) [pscustomobject]@{LocalPort=$LocalPort} }
function Check($condition,[string]$message) { if (!$condition) { throw $message } }
$launcher=Join-Path $scratch 'scripts\Start-Layout.ps1'
& $launcher | Out-Null
$arguments=Get-Content -LiteralPath (Join-Path $scratch 'arguments.json') -Raw | ConvertFrom-Json
Check (($arguments -join '|') -eq '--port|9988|--setup') 'First-launch flag must be passed as one argument, not individual characters'
Check (Test-Path -LiteralPath (Join-Path $scratch '.theme-ready')) 'Successful activation did not save the marker'
& $launcher | Out-Null
$arguments=Get-Content -LiteralPath (Join-Path $scratch 'arguments.json') -Raw | ConvertFrom-Json
Check (($arguments -join '|') -eq '--port|9988') 'Later launches must respect manual theme choices'
Remove-Item -LiteralPath (Join-Path $scratch '.theme-ready')
'console.error("fixture activation failure");process.exit(1)' | Set-Content -LiteralPath (Join-Path $scratch 'tools\session.mjs')
$refused=$false
try { & $launcher } catch { $refused=$_.Exception.Message.Contains('fixture activation failure') }
Check $refused 'Attachment failure was not surfaced'
Check (!(Test-Path -LiteralPath (Join-Path $scratch '.theme-ready'))) 'Failed activation was marked complete'
Write-Output 'PASS: first-launch native arguments, saved completion, subsequent opt-out, failed activation retry and error details.'
