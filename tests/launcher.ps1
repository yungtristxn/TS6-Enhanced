#requires -Version 7.0
# Exercise native argument passing and completion markers without launching TS6.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $project ('.local\launcher-tests\'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $scratch 'scripts'),(Join-Path $scratch 'tools') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'scripts\Start-Layout.ps1') -Destination (Join-Path $scratch 'scripts\Start-Layout.ps1')
Copy-Item -LiteralPath (Join-Path $project 'scripts\Runtime.ps1') -Destination (Join-Path $scratch 'scripts\Runtime.ps1')
$previousLocalData=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $scratch 'profile'
try {
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
@{node=(Get-Command node).Source;preserveAppearance=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $scratch 'runtime.json')
& $launcher | Out-Null
$arguments=Get-Content -LiteralPath (Join-Path $scratch 'arguments.json') -Raw | ConvertFrom-Json
Check (($arguments -join '|') -eq '--port|9988|--upgrade') 'An update must preserve appearance instead of repeating first-install defaults'
# Use the real Node launch/receipt path; failure must not be reported as ready.
@'
import {writeFileSync} from 'node:fs';
writeFileSync(process.argv[process.argv.indexOf('--ready-file')+1],JSON.stringify({status:'failed',message:'fixture manager failure'}));
'@ | Set-Content (Join-Path $scratch 'tools\manager.mjs')
$refused=$false;try{& $launcher}catch{$refused=$_.Exception.Message.Contains('fixture manager failure')}
Check $refused 'Manager initialization failure was reported as successful launch'
Remove-Item -LiteralPath (Join-Path $scratch 'tools\manager.mjs')
Remove-Item -LiteralPath (Join-Path $scratch '.theme-ready')
'console.error("fixture activation failure");process.exit(1)' | Set-Content -LiteralPath (Join-Path $scratch 'tools\session.mjs')
$refused=$false
try { & $launcher } catch { $refused=$_.Exception.Message.Contains('fixture activation failure') }
Check $refused 'Attachment failure was not surfaced'
Check (!(Test-Path -LiteralPath (Join-Path $scratch '.theme-ready'))) 'Failed activation was marked complete'
Copy-Item (Join-Path $project 'scripts\Complete-Setup.ps1') (Join-Path $scratch 'scripts\Complete-Setup.ps1')
$messages=[Collections.Generic.List[string]]::new()
function Get-NetTCPConnection {param($LocalPort,$State,$ErrorAction) return $null}
function Write-Host {param($Object,$ForegroundColor) $messages.Add([string]$Object)}
function Start-Sleep {param($Seconds) throw 'Fixture ends while setup waits for the normal client'}
$waiting=$false
try{& (Join-Path $scratch 'scripts\Complete-Setup.ps1') -NodePath (Get-Command node).Source}catch{$waiting=$_.Exception.Message.StartsWith('Fixture ends')}
Check ($waiting -and ($messages -join ' ').Contains('Setup is not complete') -and ($messages -join ' ').Contains('Keep this setup window open')) 'Waiting setup gave advice for an installation that does not exist yet'
Write-Output 'PASS: first-launch native arguments, saved completion, subsequent opt-out, failed activation retry and error details.'
}finally{$env:LOCALAPPDATA=$previousLocalData}
