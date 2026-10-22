#requires -Version 5.1
# Real .lnk round-trip in ignored scratch space. Never invokes a shortcut.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$root = Join-Path $project ('.local\persistence-tests\'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
$previousLocalData=$env:LOCALAPPDATA;$env:LOCALAPPDATA=Join-Path $root 'profile'
New-Item -ItemType Directory -Path (Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak') -Force | Out-Null
'Fixture only; never executed' | Set-Content (Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe')
try {
$shortcut = Join-Path $root 'TeamSpeak.lnk'
$stateRoot = Join-Path $root 'state'
$package=Join-Path $root 'package'
New-Item -ItemType Directory -Path (Join-Path $package 'runtime') -Force | Out-Null
foreach($name in @('scripts','tools','release.json')){Copy-Item (Join-Path $project $name) $package -Recurse}
Copy-Item (Get-Command node).Source (Join-Path $package 'runtime\node.exe')
'Fixture license' | Set-Content (Join-Path $package 'runtime\LICENSE')
& (Join-Path $project 'scripts\Build-Launcher.ps1') -OutputPath (Join-Path $package 'runtime\TS6-Enhanced.exe') -IconSource ''
$installer = Join-Path $package 'scripts\Install-Persistence.ps1'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
$link.Description = 'Untouched original'
$link.Hotkey = 'CTRL+ALT+SHIFT+F12'
$link.Save()
$hash = (Get-FileHash -LiteralPath $shortcut).Hash
function Check($condition,[string]$message) { if (!$condition) { throw $message } }
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot -WhatIf
Check (!(Test-Path -LiteralPath $stateRoot)) 'WhatIf changed storage'
Check ((Get-FileHash -LiteralPath $shortcut).Hash -eq $hash) 'WhatIf changed the shortcut'
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot
$state = Get-Content (Join-Path $stateRoot 'state.json') -Raw | ConvertFrom-Json
Check ($state.installed) 'Install state missing'
Check ((Get-FileHash (Join-Path $stateRoot 'original-TeamSpeak.lnk')).Hash -eq $hash) 'Backup not byte-identical'
$owned = $shell.CreateShortcut($shortcut)
Check ($owned.TargetPath -eq (Join-Path $stateRoot 'TS6-Enhanced.exe')) 'Shortcut must target its own application launcher'
Check ($owned.Arguments -eq '') 'Native launcher must not depend on cached script arguments'
Check ($owned.IconLocation -eq ((Join-Path $stateRoot 'TS6-Enhanced.exe')+',0')) 'Shortcut icon must come from the installed launcher'
Check ($owned.Hotkey -eq $link.Hotkey) 'Managed shortcut discarded native shortcut properties'
$stableArguments=$owned.Arguments
$stableTarget=$owned.TargetPath
$savedNode=(Get-Content (Join-Path $state.release 'runtime.json') -Raw | ConvertFrom-Json).node
Check ($savedNode -eq (Join-Path $state.release 'runtime\node.exe')) 'Bundled Node was not pinned to the permanent release'
Check ((Get-FileHash $savedNode).Hash -eq (Get-FileHash (Join-Path $package 'runtime\node.exe')).Hash) 'Bundled runtime changed during copying'
Check (Test-Path (Join-Path $state.release 'runtime\LICENSE')) 'Bundled runtime license was not retained'
foreach ($file in @('scripts\Start-Layout.ps1','scripts\Start-Inspection.ps1','tools\session.mjs','tools\appearance.mjs','tools\cdp.mjs','tools\client.mjs','tools\workspace-runtime.js','tools\streams-runtime.js')) {
    Check ((Get-FileHash (Join-Path $state.release $file)).Hash -eq (Get-FileHash (Join-Path $project $file)).Hash) "Wrong bundled file: $file"
}
$oldRelease = $state.release
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot
$state = Get-Content (Join-Path $stateRoot 'state.json') -Raw | ConvertFrom-Json
Check ($oldRelease -ne $state.release -and (Test-Path -LiteralPath $oldRelease)) 'Update did not preserve the previous release'
Check ($shell.CreateShortcut($shortcut).Arguments -ceq $stableArguments) 'Updating must not change the cached shortcut command'
Check ($shell.CreateShortcut($shortcut).TargetPath -ceq $stableTarget) 'Updating must not change the registered application target'
$currentEntry=Join-Path $state.release 'scripts\Start-Layout.ps1'
$entryBytes=[IO.File]::ReadAllBytes($currentEntry)
try {
    'param($Port,[switch]$Quiet); "current:${Port}:${Quiet}"' | Set-Content -LiteralPath $currentEntry
    $result=& (Join-Path $oldRelease 'scripts\Start-Layout.ps1') -Port 9999 -Quiet
    Check ($result -eq 'current:9999:True') 'A cached legacy shortcut did not forward to the current release'
}finally{[IO.File]::WriteAllBytes($currentEntry,$entryBytes)}
Check ((Get-FileHash (Join-Path $stateRoot 'original-TeamSpeak.lnk')).Hash -eq $hash) 'Update replaced original recovery'
# Model a binary metadata change with unchanged WScript launch properties.
# The terminal extra-data marker ends the link; trailing padding is not launched.
$managedBytes = [IO.File]::ReadAllBytes($shortcut)
[IO.File]::WriteAllBytes($shortcut, [byte[]]($managedBytes + [byte[]](0,0,0,0)))
$metadataHash = (Get-FileHash -LiteralPath $shortcut).Hash
$stateHash = (Get-FileHash (Join-Path $stateRoot 'state.json')).Hash
$refused=$false
try { & $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot } catch { $refused=$true }
Check $refused 'Metadata changes must require explicit repair'
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot -RepairShortcut -WhatIf
Check ((Get-FileHash -LiteralPath $shortcut).Hash -eq $metadataHash) 'Repair dry run changed shortcut'
Check ((Get-FileHash (Join-Path $stateRoot 'state.json')).Hash -eq $stateHash) 'Repair dry run changed ownership state'
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot -RepairShortcut
$state = Get-Content (Join-Path $stateRoot 'state.json') -Raw | ConvertFrom-Json
$observedBackup = Join-Path $stateRoot ('history\'+(Split-Path -Leaf $state.release)+'\TeamSpeak.lnk')
Check ((Get-FileHash $observedBackup).Hash -eq $metadataHash) 'Repair did not preserve the exact observed shortcut'
Check ((Get-FileHash (Join-Path $stateRoot 'original-TeamSpeak.lnk')).Hash -eq $hash) 'Repair replaced original recovery'
& $installer Uninstall -ShortcutPath $shortcut -StateRoot $stateRoot
Check ((Get-FileHash -LiteralPath $shortcut).Hash -eq $hash) 'Uninstall did not restore exact original bytes'
& $installer Uninstall -ShortcutPath $shortcut -StateRoot $stateRoot
$link=$shell.CreateShortcut($shortcut);$link.Description='Native shortcut refreshed after removal';$link.Save()
$freshHash=(Get-FileHash -LiteralPath $shortcut).Hash
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot -WhatIf
Check ((Get-FileHash (Join-Path $stateRoot 'original-TeamSpeak.lnk')).Hash -eq $hash) 'Fresh-install preview changed the previous baseline'
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot
Check ((Get-FileHash (Join-Path $stateRoot 'original-TeamSpeak.lnk')).Hash -eq $freshHash) 'Fresh install did not save the current native shortcut'
$oldBaselines=@(Get-ChildItem (Join-Path $stateRoot 'history') -Directory -Filter 'before-reinstall-*' | ForEach-Object { (Get-FileHash (Join-Path $_.FullName 'original-TeamSpeak.lnk')).Hash })
Check ($hash -in $oldBaselines) 'Fresh install discarded the previous shortcut baseline'
& $installer Uninstall -ShortcutPath $shortcut -StateRoot $stateRoot
Check ((Get-FileHash -LiteralPath $shortcut).Hash -eq $freshHash) 'Fresh uninstall did not restore the refreshed native shortcut'
# Reconstruct the durable state after replacing the live link but before
# committing ownership. The production script must replay each interrupted
# operation and still restore the exact original after a subsequent removal.
foreach($phase in @('initial','update','uninstall','reinstall')){
    $case=Join-Path $root $phase;New-Item -ItemType Directory -Path $case | Out-Null
    $caseLink=Join-Path $case 'TeamSpeak.lnk';Copy-Item $shortcut $caseLink
    $caseState=Join-Path $case 'state';$action='Install'
    & $installer Install -ShortcutPath $caseLink -StateRoot $caseState | Out-Null
    if($phase -eq 'update'){& $installer Install -ShortcutPath $caseLink -StateRoot $caseState | Out-Null}
    if($phase -in @('uninstall','reinstall')){& $installer Uninstall -ShortcutPath $caseLink -StateRoot $caseState | Out-Null;$action='Uninstall'}
    if($phase -eq 'reinstall'){
        $native=$shell.CreateShortcut($caseLink);$native.Description='New native baseline';$native.Save()
        & $installer Install -ShortcutPath $caseLink -StateRoot $caseState | Out-Null;$action='Install'
    }
    $history=Get-ChildItem (Join-Path $caseState 'history') -Directory | Where-Object Name -Match '^\d{8}-' | Sort-Object Name | Select-Object -Last 1
    $hashes=@{};foreach($name in @('TeamSpeak.lnk','replacement.lnk','previous-original.lnk','next-original.lnk','state.json','next-state.json')){$hashes[$name]=(Get-FileHash (Join-Path $history.FullName $name)).Hash}
    Copy-Item (Join-Path $history.FullName 'state.json') (Join-Path $caseState 'state.json') -Force
    Copy-Item (Join-Path $history.FullName 'previous-original.lnk') (Join-Path $caseState 'original-TeamSpeak.lnk') -Force
    $pending=Join-Path $caseState 'pending-shortcut.json'
    @{owner='ts6-layout-shortcut-v1';shortcut=$caseLink;history=$history.Name;hashes=$hashes} | ConvertTo-Json -Depth 5 | Set-Content $pending
    & $installer $action -ShortcutPath $caseLink -StateRoot $caseState -WhatIf | Out-Null
    Check (Test-Path $pending) 'Dry run changed pending recovery'
    & $installer $action -ShortcutPath $caseLink -StateRoot $caseState | Out-Null
    Check (!(Test-Path $pending)) "Pending $phase transaction did not complete"
    & $installer Uninstall -ShortcutPath $caseLink -StateRoot $caseState | Out-Null
    Check ((Get-FileHash $caseLink).Hash -eq $hashes.'next-original.lnk') "Interrupted $phase lost the native baseline"
}
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot
$link = $shell.CreateShortcut($shortcut);$link.Description='User edit';$link.Save()
$changed = (Get-FileHash -LiteralPath $shortcut).Hash
$refused=$false
try { & $installer Uninstall -ShortcutPath $shortcut -StateRoot $stateRoot } catch { $refused=$true }
Check $refused 'Must refuse to overwrite an independently edited shortcut'
Check ((Get-FileHash -LiteralPath $shortcut).Hash -eq $changed) 'User edit was modified'
$refused=$false
try { & $installer Uninstall -ShortcutPath $shortcut -StateRoot $stateRoot -RepairShortcut } catch { $refused=$true }
Check $refused 'Repair must also refuse changed user-visible shortcut settings'
Check ((Get-FileHash -LiteralPath $shortcut).Hash -eq $changed) 'Repair modified a user edit'
# Restore only this test's verified managed link and alter the RunAsUser flag.
$state = Get-Content (Join-Path $stateRoot 'state.json') -Raw | ConvertFrom-Json
$recorded = Join-Path $stateRoot ('history\'+(Split-Path -Leaf $state.release)+'\replacement.lnk')
$flagBytes = [IO.File]::ReadAllBytes($recorded)
$flagBytes[21] = $flagBytes[21] -bxor 0x20
[IO.File]::WriteAllBytes($shortcut,$flagBytes)
$flagHash = (Get-FileHash $shortcut).Hash
$refused=$false
try { & $installer Uninstall -ShortcutPath $shortcut -StateRoot $stateRoot -RepairShortcut } catch { $refused=$true }
Check $refused 'Repair must refuse changed execution flags'
Check ((Get-FileHash $shortcut).Hash -eq $flagHash) 'Repair changed execution-flag edit'
# Even an exact match must not let a contaminated managed recovery copy become
# the native baseline during reinstall. Detect it in preflight without writes.
$badState=Join-Path $root 'managed-original';New-Item -ItemType Directory -Path $badState | Out-Null
$badLink=Join-Path $root 'managed-original.lnk';Copy-Item $recorded $badLink
$badHash=(Get-FileHash $badLink).Hash
Copy-Item $recorded (Join-Path $badState 'original-TeamSpeak.lnk')
@{owner='ts6-layout-shortcut-v1';shortcut=$badLink;originalHash=$badHash;currentHash=$badHash;installed=$false;release=$state.release} | ConvertTo-Json | Set-Content (Join-Path $badState 'state.json')
$refused=$false
try{& $installer Install -ShortcutPath $badLink -StateRoot $badState -WhatIf}catch{$refused=$_.Exception.Message.Contains('managed shortcut cannot become')}
Check $refused 'A managed original passed reinstall preflight'
Check ((Get-FileHash $badLink).Hash -eq $badHash) 'Preflight changed the contaminated fixture'
$collision=Join-Path $root 'foreign-state'
New-Item -ItemType Directory -Path $collision | Out-Null
$refused=$false
try { & $installer Install -ShortcutPath $shortcut -StateRoot $collision } catch { $refused=$true }
Check $refused 'Must refuse an unowned state directory'
Write-Output 'PASS: dry run, runtime copy, repeat update, exact restoration, explicit metadata repair/backups, repair dry run, execution-flag/user-edit refusal, and ownership collisions.'
# Exercise the stable entry with inert scripts. No real shortcut/client launch.
$dispatch=Join-Path $root 'dispatch';New-Item -ItemType Directory -Path $dispatch | Out-Null
$entry=Join-Path $dispatch 'Start-Layout.ps1';Copy-Item (Join-Path $project 'scripts\Start-ManagedLayout.ps1') $entry
foreach($stamp in @('20261022-000000-000-aaaaaaaa','20261022-000000-000-bbbbbbbb')){
    $target=Join-Path $dispatch ('releases\'+$stamp)
    New-Item -ItemType Directory -Path (Join-Path $target 'scripts') -Force | Out-Null
    'param($Port,[switch]$Quiet); [pscustomobject]@{Release=(Split-Path -Leaf (Split-Path -Parent $PSScriptRoot)); Port=$Port; Quiet=[bool]$Quiet}' | Set-Content (Join-Path $target 'scripts\Start-Layout.ps1')
    @{owner='ts6-layout-shortcut-v1';installed=$true;release=$target} | ConvertTo-Json | Set-Content (Join-Path $dispatch 'state.json')
    $result=& $entry -Port 9999 -Quiet
    Check ($result.Release -ceq $stamp -and $result.Port -eq 9999 -and $result.Quiet) 'Cached entry did not dispatch to the current release'
}
@{owner='ts6-layout-shortcut-v1';installed=$true;release=$project} | ConvertTo-Json | Set-Content (Join-Path $dispatch 'state.json')
$refused=$false;try{& $entry}catch{$refused=$_.Exception.Message.Contains('escaped')};Check $refused 'Launcher accepted a release outside its installation'
Write-Output 'PASS: stable shortcut dispatch selects the current release and rejects escaped paths.'
# Exercise the actual native dispatch with inert client/session/manager programs.
# No real TeamSpeak process, endpoint, updater or PowerShell launcher is invoked.
$nativeCase=Join-Path $root 'native-launcher';New-Item -ItemType Directory -Path $nativeCase | Out-Null
Copy-Item -LiteralPath (Join-Path $package 'runtime\TS6-Enhanced.exe') -Destination (Join-Path $nativeCase 'TS6-Enhanced.exe')
'throw "The native launcher must not invoke this PowerShell wrapper."' | Set-Content -LiteralPath (Join-Path $nativeCase 'Start-Layout.ps1')
$fakeSource=Join-Path $nativeCase 'Client.cs'
@'
using System;using System.IO;
class Fixture { static void Main(string[] args) { File.WriteAllText(Path.Combine(Environment.GetEnvironmentVariable("LOCALAPPDATA"),"client-arguments.txt"),String.Join("|",args)); } }
'@ | Set-Content -LiteralPath $fakeSource
& (Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe') /nologo /target:winexe ('/out:'+(Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe')) $fakeSource
Check ($LASTEXITCODE -eq 0) 'Fixture client did not compile'
$launcherHash=(Get-FileHash (Join-Path $nativeCase 'TS6-Enhanced.exe')).Hash
foreach($stamp in @('20261022-000000-000-cccccccc','20261022-000000-000-dddddddd')){
    $fixtureRelease=Join-Path $nativeCase ('releases\'+$stamp)
    New-Item -ItemType Directory -Path (Join-Path $fixtureRelease 'tools'),(Join-Path $fixtureRelease 'runtime') -Force | Out-Null
    Copy-Item (Join-Path $nativeCase 'TS6-Enhanced.exe') (Join-Path $fixtureRelease 'runtime\TS6-Enhanced.exe')
    @{node=(Get-Command node).Source;preserveAppearance=$true} | ConvertTo-Json | Set-Content (Join-Path $fixtureRelease 'runtime.json')
    @{version='1.0.7'} | ConvertTo-Json | Set-Content (Join-Path $fixtureRelease 'release.json')
    @'
import {writeFileSync} from 'node:fs';
if(!process.env.TSIX_OPERATION_TOKEN)throw Error('Lost operation lease');
writeFileSync(new URL('../session-arguments.json',import.meta.url),JSON.stringify(process.argv.slice(2)));
'@ | Set-Content (Join-Path $fixtureRelease 'tools\session.mjs')
    @'
import {writeFileSync} from 'node:fs';
if(process.env.TSIX_OPERATION_TOKEN)throw Error('Long-lived manager inherited the operation token');
writeFileSync(process.argv[process.argv.indexOf('--ready-file')+1],JSON.stringify({status:'ready'}));
'@ | Set-Content (Join-Path $fixtureRelease 'tools\manager.mjs')
    @{owner='ts6-layout-shortcut-v1';installed=$true;release=$fixtureRelease} | ConvertTo-Json | Set-Content (Join-Path $nativeCase 'state.json')
    $native=Start-Process -FilePath (Join-Path $nativeCase 'TS6-Enhanced.exe') -ArgumentList '--port','9999' -WindowStyle Hidden -PassThru
    try{Check ($native.WaitForExit(5000) -and $native.ExitCode -eq 0) 'Native entry did not dispatch successfully'}finally{$native.Dispose()}
    $deadline=[DateTime]::UtcNow.AddSeconds(12);$launchReceipt=Join-Path $env:LOCALAPPDATA 'TS6-Layout\launcher\last-launch.json'
    do{
        $started=if(Test-Path $launchReceipt){Get-Content $launchReceipt -Raw | ConvertFrom-Json}else{$null}
        if($started.status -eq 'failed'){throw $started.message}
        if($started.status -eq 'ready' -and $started.release -eq $fixtureRelease){break}
        if([DateTime]::UtcNow -ge $deadline){throw 'Native worker did not finish'}
        Start-Sleep -Milliseconds 100
    }while($true)
    Check ($started.entry -eq 'native' -and $started.port -eq 9999) 'Wrong launch receipt'
    Check (((Get-Content (Join-Path $fixtureRelease 'session-arguments.json') -Raw | ConvertFrom-Json) -join '|') -eq '--port|9999|--upgrade') 'Native startup lost activation or port arguments'
    Check ((Get-Content (Join-Path $env:LOCALAPPDATA 'client-arguments.txt') -Raw) -eq '--remote-debugging-address=127.0.0.1|--remote-debugging-port=9999') 'Native client lost loopback debugging flags'
    Check ((Get-FileHash (Join-Path $nativeCase 'TS6-Enhanced.exe')).Hash -eq $launcherHash) 'Changing releases replaced the stable entry during dispatch'
}
# A queued update must be able to replace the stable EXE while the immutable
# worker retains the same lifecycle lease as the existing maintenance scripts.
New-Item -ItemType Directory -Path (Join-Path $fixtureRelease 'scripts') -Force | Out-Null
Copy-Item (Join-Path $project 'scripts\Runtime.ps1') (Join-Path $fixtureRelease 'scripts\Runtime.ps1')
@{fromVersion='1.0.7'} | ConvertTo-Json | Set-Content (Join-Path $env:LOCALAPPDATA 'TS6-Layout\pending-update.json')
@'
param($Action)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$operation=Enter-LayoutOperation
try{
    $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
    $stable=Join-Path $root 'TS6-Enhanced.exe';$next=$stable+'.replacement'
    Copy-Item -LiteralPath $stable -Destination $next
    [IO.File]::Replace($next,$stable,[NullString]::Value)
    @{Action=$Action;Major=$PSVersionTable.PSVersion.Major;Token=$env:TSIX_OPERATION_TOKEN} | ConvertTo-Json | Set-Content (Join-Path $root 'update-handoff.json')
}finally{Exit-LayoutOperation $operation}
'@ | Set-Content (Join-Path $fixtureRelease 'scripts\Maintenance.ps1')
$native=Start-Process -FilePath (Join-Path $nativeCase 'TS6-Enhanced.exe') -WindowStyle Hidden -PassThru
try{Check ($native.WaitForExit(5000) -and $native.ExitCode -eq 0) 'Update dispatch failed'}finally{$native.Dispose()}
$deadline=[DateTime]::UtcNow.AddSeconds(12)
while(!(Test-Path (Join-Path $nativeCase 'update-handoff.json'))){if([DateTime]::UtcNow -ge $deadline){throw 'Native update handoff did not finish'};Start-Sleep -Milliseconds 100}
$handoff=Get-Content (Join-Path $nativeCase 'update-handoff.json') -Raw | ConvertFrom-Json
Check ($handoff.Action -eq 'Update' -and $handoff.Major -eq 5 -and $handoff.Token -match '^[a-f0-9]{32}$') 'Maintenance handoff lost the Windows host or lifecycle lease'
@{owner='ts6-layout-shortcut-v1';installed=$false;release=$fixtureRelease} | ConvertTo-Json | Set-Content (Join-Path $nativeCase 'state.json')
'pending' | Set-Content (Join-Path $env:LOCALAPPDATA 'client-arguments.txt')
$native=Start-Process -FilePath (Join-Path $nativeCase 'TS6-Enhanced.exe') -WindowStyle Hidden -PassThru
try{Check ($native.WaitForExit(5000) -and $native.ExitCode -eq 0) 'Removed installation did not launch native TeamSpeak'}finally{$native.Dispose()}
$deadline=[DateTime]::UtcNow.AddSeconds(5)
while((Get-Content (Join-Path $env:LOCALAPPDATA 'client-arguments.txt') -Raw)){
    if([DateTime]::UtcNow -ge $deadline){throw 'Removed installation retained enhancement launch flags'}
    Start-Sleep -Milliseconds 100
}
Write-Output 'PASS: native entry selects the current release, invokes Node directly, permits queued replacement with the lifecycle lease, and launches stock after removal.'
}finally{$env:LOCALAPPDATA=$previousLocalData}
