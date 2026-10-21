#requires -Version 5.1
# Isolated bootstrap failures under the actual built-in Windows PowerShell.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
. (Join-Path $project 'scripts\Runtime.ps1')
$scratch=Join-Path $project ('.local\bootstrap-tests\'+[guid]::NewGuid().ToString('N'))
$fixture=Join-Path $scratch 'fixture'
New-Item -ItemType Directory -Path $fixture -Force | Out-Null
$probe=Join-Path $fixture 'probe.cmd'
'@echo off', 'echo v22.23.3' | Set-Content -LiteralPath $probe -Encoding Ascii
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fixtureArchive=Join-Path $scratch 'runtime.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($fixture,$fixtureArchive)
$spec=[pscustomobject]@{version='22.23.3';url='https://nodejs.org/dist/test-fixture.zip';sha256=(Get-FileHash $fixtureArchive).Hash.ToLowerInvariant();executable='probe.cmd';minimumMajor=22}
# Replace only the transport with a local fixture; production checksum/extract/
# receipt/path checks run unchanged. Real locked downloads are a separate check.
function Invoke-WebRequest { param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing) Copy-Item -LiteralPath $fixtureArchive -Destination $OutFile }
function Check($condition,[string]$message) { if (!$condition) { throw $message } }
$runtime=Resolve-LayoutRuntime node $spec (Join-Path $scratch 'cache') -PortableOnly
Check (Test-Path -LiteralPath $runtime) 'Runtime was not extracted'
Check ((Resolve-LayoutRuntime node $spec (Join-Path $scratch 'cache') -PortableOnly) -eq $runtime) 'Cache was not reused'
Add-Content -LiteralPath $runtime -Value 'echo changed' -Encoding Ascii
$refused=$false
try { Resolve-LayoutRuntime node $spec (Join-Path $scratch 'cache') -PortableOnly } catch { $refused=$_.Exception.Message.Contains('failed verification') }
Check $refused 'Changed cached executable was accepted'
$spec.sha256='0'*64; $refused=$false
try { Resolve-LayoutRuntime node $spec (Join-Path $scratch 'bad-download') -PortableOnly } catch { $refused=$_.Exception.Message.Contains('checksum mismatch') }
Check $refused 'Wrong download checksum was accepted'
Check (!(Test-Path (Join-Path $scratch 'bad-download\node-22.23.3'))) 'Bad download was installed'
$spec.executable='..\escape.cmd';$refused=$false
try { Resolve-LayoutRuntime node $spec (Join-Path $scratch 'bad-path') -PortableOnly } catch { $refused=$_.Exception.Message.Contains('Unsafe runtime') }
Check $refused 'Escaping executable path accepted'
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
Copy-Item (Join-Path $project 'runtime-lock.json') (Join-Path $preflight 'runtime-lock.json')
$childProbe=Join-Path $scratch 'bootstrap-child.mjs'
@'
import {spawnSync} from 'node:child_process';
const [script,localData,modulePath,mode='prepare']=process.argv.slice(2);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!['localappdata','psmodulepath'].includes(k.toLowerCase())));
const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...(mode==='prepare'?['-Prepare']:[])],{windowsHide:true,encoding:'utf8',env:{...env,LOCALAPPDATA:localData,PSModulePath:modulePath}});
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
Write-Output 'PASS: Windows PowerShell bootstrap, verified extraction/cache reuse, corrupt runtime/download refusal, path containment, package integrity.'
