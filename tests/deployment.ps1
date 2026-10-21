#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$testRoot = Join-Path $project ('.local\deployment-tests\' + [guid]::NewGuid().ToString('N'))
$previousLocalData=$env:LOCALAPPDATA
$schema=Join-Path $previousLocalData 'Programs\TeamSpeak\docs\extensions.json'
$env:LOCALAPPDATA=Join-Path $testRoot 'profile'
New-Item -ItemType Directory -Path (Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\docs') -Force | Out-Null
Copy-Item -LiteralPath $schema -Destination (Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\docs\extensions.json')
try {
$extensions = Join-Path $testRoot 'extensions'
$backups = Join-Path $testRoot 'backups'
$installer = Join-Path $project 'scripts\Theme.ps1'
$argsCommon = @{ ExtensionsPath = $extensions; BackupRoot = $backups }
$own = Join-Path $extensions 'local.tsix.layout'
New-Item -ItemType Directory -Path (Join-Path $extensions 'other.theme.keep') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $extensions 'other.theme.keep\sentinel.txt') -Value 'unrelated theme'
$before = (Get-FileHash -LiteralPath (Join-Path $extensions 'other.theme.keep\sentinel.txt')).Hash
& $installer Install @argsCommon -WhatIf
if (Test-Path -LiteralPath $own) { throw 'WhatIf wrote an install.' }
& $installer Install @argsCommon
Set-Content -LiteralPath (Join-Path $own 'local-edit.txt') -Value 'preserve in backup'
$hidden = Join-Path $own 'hidden-local-edit.txt'
Set-Content -LiteralPath $hidden -Value 'hidden local asset'
(Get-Item -LiteralPath $hidden).Attributes = [IO.FileAttributes]::Hidden
& $installer Update @argsCommon
$backup = Get-ChildItem -LiteralPath $backups -Directory | ForEach-Object { Join-Path $_.FullName 'local.tsix.layout' } | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'local-edit.txt') } | Select-Object -First 1
if (!$backup) { throw 'Update lost previous local content.' }
& $installer Restore @argsCommon -BackupPath $backup
if (!(Test-Path -LiteralPath (Join-Path $own 'local-edit.txt'))) { throw 'Restore lost local content.' }
if (!(Test-Path -LiteralPath (Join-Path $own 'hidden-local-edit.txt'))) { throw 'Restore lost a hidden local asset.' }
& $installer Uninstall @argsCommon
& $installer Uninstall @argsCommon
if (Test-Path -LiteralPath $own) { throw 'Uninstall did not remove own install.' }
& $installer Install @argsCommon
Remove-Item -LiteralPath (Join-Path $own 'layout.css')
'damaged copy' | Set-Content (Join-Path $own 'damage-sentinel.txt')
& $installer Install @argsCommon
if(!(Test-Path (Join-Path $own 'layout.css'))){throw 'Repair did not replace the missing asset'}
$damaged=@(Get-ChildItem $backups -Recurse -Filter damage-sentinel.txt)
if($damaged.Count -ne 1 -or (Test-Path (Join-Path $damaged[0].DirectoryName 'layout.css'))){throw 'Damaged copy was not retained intact'}
'{broken' | Set-Content (Join-Path $own 'package.json')
& $installer Uninstall @argsCommon
if(Test-Path $own){throw 'Owned theme with broken manifest could not be removed'}
# An identically named unowned directory must remain untouched.
New-Item -ItemType Directory -Path $own | Out-Null
Copy-Item -LiteralPath (Join-Path $project 'theme\local.tsix.layout\package.json') -Destination $own
$refused = $false
try { & $installer Install @argsCommon } catch { $refused = $true }
if (!$refused) { throw 'Unowned collision was overwritten.' }
if ($before -ne (Get-FileHash -LiteralPath (Join-Path $extensions 'other.theme.keep\sentinel.txt')).Hash) { throw 'An unrelated theme changed.' }
$junction = Join-Path $testRoot 'linked-extensions'
New-Item -ItemType Junction -Path $junction -Target $extensions | Out-Null
$refused = $false
try { & $installer Install -ExtensionsPath $junction -BackupRoot $backups } catch { $refused = $true }
if (!$refused) { throw 'Junction install root was accepted.' }
Write-Output 'PASS: WhatIf, install, update backup, restore including hidden assets, uninstall, idempotent uninstall, collision and junction refusal, unrelated-theme preservation.'
}finally{$env:LOCALAPPDATA=$previousLocalData}
