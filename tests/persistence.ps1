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
$installer = Join-Path $project 'scripts\Install-Persistence.ps1'
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
$link.Description = 'Untouched original'
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
Check ($owned.TargetPath -eq (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe')) 'Wrong launcher executable'
Check ($owned.Arguments.Contains('-WindowStyle Hidden') -and $owned.Arguments.EndsWith('-Quiet')) 'Launcher must be unobtrusive'
Check ((Get-Content (Join-Path $state.release 'runtime.json') -Raw | ConvertFrom-Json).node -eq (Get-Command node).Source) 'Resolved Node path was not saved'
foreach ($file in @('scripts\Start-Layout.ps1','scripts\Start-Inspection.ps1','tools\session.mjs','tools\appearance.mjs','tools\cdp.mjs','tools\client.mjs','tools\workspace-runtime.js','tools\streams-runtime.js')) {
    Check ((Get-FileHash (Join-Path $state.release $file)).Hash -eq (Get-FileHash (Join-Path $project $file)).Hash) "Wrong bundled file: $file"
}
$oldRelease = $state.release
& $installer Install -ShortcutPath $shortcut -StateRoot $stateRoot
$state = Get-Content (Join-Path $stateRoot 'state.json') -Raw | ConvertFrom-Json
Check ($oldRelease -ne $state.release -and (Test-Path -LiteralPath $oldRelease)) 'Update did not preserve the previous release'
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
}finally{$env:LOCALAPPDATA=$previousLocalData}
