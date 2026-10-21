#requires -Version 5.1
# Isolated bootstrap failures under the actual built-in Windows PowerShell.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
. (Join-Path $project 'scripts\Runtime.ps1')
$scratch=Join-Path $project ('.local\bootstrap-tests\'+[guid]::NewGuid().ToString('N'))
function Check($condition,[string]$message) { if (!$condition) { throw $message } }
$package=Join-Path $scratch 'package'
New-Item -ItemType Directory -Path $package | Out-Null
'original' | Set-Content (Join-Path $package 'Install.cmd')
$hash=(Get-FileHash (Join-Path $package 'Install.cmd')).Hash.ToLowerInvariant()
($hash+'  Install.cmd') | Set-Content (Join-Path $package 'SHA256SUMS.txt')
Assert-LayoutPackage $package
'changed' | Set-Content (Join-Path $package 'Install.cmd');$refused=$false
try { Assert-LayoutPackage $package } catch { $refused=$_.Exception.Message.Contains('changed package') }
Check $refused 'Changed package was accepted'
# Exercise the real bootstrap through Node, as the updater/installer launches it.
# Direct powershell.exe calls from pwsh sanitize PSModulePath and miss this bug.
$preflight=Join-Path $scratch 'preflight';$localData=Join-Path $scratch 'profile'
$client=Join-Path $localData 'Programs\TeamSpeak'
New-Item -ItemType Directory -Path (Join-Path $preflight 'scripts'),$client -Force | Out-Null
foreach($name in @('Bootstrap.ps1','Runtime.ps1')){Copy-Item (Join-Path $project "scripts\$name") (Join-Path $preflight "scripts\$name")}
'not executed' | Set-Content (Join-Path $client 'TeamSpeak.exe')
'supported resource' | Set-Content (Join-Path $client 'resource.txt')
@{supportedClient=@{resourceHashes=@{'resource.txt'=(Get-FileHash (Join-Path $client 'resource.txt')).Hash}}} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $preflight 'release.json')
New-Item -ItemType Directory -Path (Join-Path $preflight 'runtime') -Force | Out-Null
$bundled=Join-Path $preflight 'runtime\node.exe'
Copy-Item (Get-Command node.exe).Source $bundled
'Fixture license' | Set-Content (Join-Path $preflight 'runtime\LICENSE')
Check ((Resolve-LayoutNode $preflight) -eq $bundled) 'Bootstrap did not choose its bundled runtime'
Move-Item $bundled ($bundled+'.hold')
$refused=$false
try{Resolve-LayoutNode $preflight}catch{$refused=$_.Exception.Message.Contains('bundled runtime is missing')}
Check $refused 'Missing bundled runtime fell back to a global install'
Move-Item ($bundled+'.hold') $bundled
$childProbe=Join-Path $scratch 'bootstrap-child.mjs'
@'
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const [script,localData,modulePath,mode='prepare']=process.argv.slice(2);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!['localappdata','psmodulepath','path'].includes(k.toLowerCase())));
const r=spawnSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...(mode==='prepare'?['-Prepare']:[])],{windowsHide:true,encoding:'utf8',env:{...env,PATH:join(process.env.SystemRoot,'System32'),LOCALAPPDATA:localData,PSModulePath:modulePath}});
if(r.error)throw r.error;
if(r.status){process.stdout.write(r.stdout);process.stderr.write(r.stderr)}
process.exit(r.status??1);
'@ | Set-Content -LiteralPath $childProbe -Encoding UTF8
$coreModules=Join-Path (Split-Path -Parent (Get-Command pwsh.exe).Source) 'Modules'
$receipt=Join-Path $localData 'TS6-Layout\install-runtime.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $receipt) -Force | Out-Null
Write-LayoutJSON $receipt @{node=(Get-Command node.exe).Source;pwsh=(Get-Command pwsh.exe).Source}
Write-LayoutJSON $receipt @{node=(Get-Command node.exe).Source;pwsh=(Get-Command pwsh.exe).Source}
$receiptHash=(Get-FileHash $receipt).Hash
$receiptProbe=Join-Path $scratch 'read-receipt.mjs'
'import {readFileSync} from "node:fs";const r=JSON.parse(readFileSync(process.argv[2],"utf8"));if(!r.node||!r.pwsh)process.exit(1)' | Set-Content $receiptProbe -Encoding UTF8
& node $receiptProbe $receipt
Check ($LASTEXITCODE -eq 0) 'The PowerShell 5.1 writer emitted JSON Node cannot read'
& node $childProbe (Join-Path $preflight 'scripts\Bootstrap.ps1') $localData ($coreModules+';'+$env:PSModulePath)
Check ($LASTEXITCODE -eq 0) 'Real bootstrap failed with inherited PowerShell 7 module paths'
Check ((Get-FileHash $receipt).Hash -eq $receiptHash) 'Preparation changed the active runtime receipt'
'exit 7' | Set-Content (Join-Path $preflight 'scripts\Complete-Setup.ps1')
& node $childProbe (Join-Path $preflight 'scripts\Bootstrap.ps1') $localData ($coreModules+';'+$env:PSModulePath) install
Check ($LASTEXITCODE -ne 0) 'Fixture failure before persistence was ignored'
Check ((Get-FileHash $receipt).Hash -eq $receiptHash) 'Failed repair changed the active runtime receipt'
Write-Output 'PASS: Windows PowerShell bootstrap, bundled runtime without Node on PATH, missing-bundle refusal and package integrity.'
