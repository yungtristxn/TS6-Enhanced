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
Write-Output 'PASS: Windows PowerShell bootstrap, verified extraction/cache reuse, corrupt runtime/download refusal, path containment, package integrity.'
