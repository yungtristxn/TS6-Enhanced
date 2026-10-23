#requires -Version 5.1
# Only fixture shortcuts and profile directories are modified.
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
$scratch=Join-Path $project ('.local\legacy-removal-tests\'+[guid]::NewGuid().ToString('N'))
$previousLocalData=$env:LOCALAPPDATA
function Check($condition,$message){if(!$condition){throw $message}}
try {
    $env:LOCALAPPDATA=Join-Path $scratch 'profile'
    $stateRoot=Join-Path $scratch 'persistence';New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    $shortcut=Join-Path $scratch 'TeamSpeak.lnk';$original=Join-Path $stateRoot 'original-TeamSpeak.lnk'
    $shell=New-Object -ComObject WScript.Shell
    $link=$shell.CreateShortcut($original);$link.TargetPath=Join-Path $scratch 'TeamSpeak.exe';$link.Save()
    $originalHash=(Get-FileHash $original).Hash
    $link=$shell.CreateShortcut($shortcut);$link.TargetPath=Join-Path $stateRoot 'TS6-Enhanced.exe';$link.Save()
    $statePath=Join-Path $stateRoot 'state.json'
    $state=@{owner='ts6-layout-shortcut-v1';shortcut=$shortcut;installed=$true;originalHash=$originalHash;currentHash=(Get-FileHash $shortcut).Hash;release=(Join-Path $stateRoot 'releases\fixture')}
    $state | ConvertTo-Json | Set-Content $statePath
    $restore=Join-Path $project 'scripts\Restore-LegacyShortcut.ps1'
    $args=@{Action='Uninstall';ShortcutPath=$shortcut;StateRoot=$stateRoot}
    & $restore @args -WhatIf
    Check ((Get-FileHash $shortcut).Hash -eq $state.currentHash) 'WhatIf changed the shortcut'
    $link=$shell.CreateShortcut($shortcut);$link.Arguments='user-added';$link.Save()
    $modifiedHash=(Get-FileHash $shortcut).Hash
    $refused=$false;try{& $restore @args}catch{$refused=$true}
    Check ($refused -and (Get-FileHash $shortcut).Hash -eq $modifiedHash) 'A changed shortcut was overwritten'
    $link=$shell.CreateShortcut($shortcut);$link.Arguments='';$link.Save()
    $state.currentHash=(Get-FileHash $shortcut).Hash;$state | ConvertTo-Json | Set-Content $statePath
    & $restore @args
    & $restore @args
    Check ((Get-FileHash $shortcut).Hash -eq $originalHash) 'Original shortcut bytes were not restored'
    Check (!(Get-Content $statePath -Raw | ConvertFrom-Json).installed) 'Legacy dispatcher was not retired'
    $extensions=Join-Path $scratch 'extensions';$backups=Join-Path $scratch 'backups'
    $theme=Join-Path $extensions 'local.tsix.layout';New-Item -ItemType Directory -Path $theme -Force | Out-Null
    $asset=Join-Path $theme 'local-edit.txt';'keep' | Set-Content $asset
    $remove=Join-Path $project 'scripts\Remove-LegacyTheme.ps1'
    $refused=$false;try{& $remove Uninstall -ExtensionsPath $extensions -BackupRoot $backups}catch{$refused=$true}
    Check ($refused -and (Test-Path $asset)) 'An unowned theme was removed'
    @{project='ts6-layout-project-v1';identifier='local.tsix.layout'} | ConvertTo-Json | Set-Content (Join-Path $theme '.tsix-owner.json')
    & $remove Uninstall -ExtensionsPath $extensions -BackupRoot $backups -WhatIf
    Check (Test-Path $asset) 'WhatIf moved the legacy theme'
    & $remove Uninstall -ExtensionsPath $extensions -BackupRoot $backups
    & $remove Uninstall -ExtensionsPath $extensions -BackupRoot $backups
    Check (!(Test-Path $theme) -and @(Get-ChildItem $backups -Recurse -Filter local-edit.txt).Count -eq 1) 'Legacy theme recovery lost a user edit'
    Write-Output 'PASS: legacy shortcut byte restoration, changed-link refusal, owned theme backup, WhatIf and repeat removal.'
}finally{$env:LOCALAPPDATA=$previousLocalData}
