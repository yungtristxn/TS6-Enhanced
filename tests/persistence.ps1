#requires -Version 7.0
# Real .lnk round-trip in ignored scratch space. Never invokes a shortcut.
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$root = Join-Path $project ('.local\persistence-tests\'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null
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
Check ($owned.TargetPath -eq (Join-Path $PSHOME 'pwsh.exe')) 'Wrong launcher executable'
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
$collision=Join-Path $root 'foreign-state'
New-Item -ItemType Directory -Path $collision | Out-Null
$refused=$false
try { & $installer Install -ShortcutPath $shortcut -StateRoot $collision } catch { $refused=$true }
Check $refused 'Must refuse an unowned state directory'
Write-Output 'PASS: dry run, runtime copy, repeat update, exact restoration, explicit metadata repair/backups, repair dry run, execution-flag/user-edit refusal, and ownership collisions.'
