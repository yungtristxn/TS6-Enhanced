#requires -Version 5.1
[CmdletBinding(SupportsShouldProcess)]
param([ValidateSet('Install','Uninstall','ApplyPending')][string]$Action='Install',[switch]$Restart)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$project=Split-Path -Parent $PSScriptRoot
$root=Join-Path $env:LOCALAPPDATA 'TS6-Layout'
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak'
$exe=Join-Path $client 'TeamSpeak.exe'
$dll=Join-Path $client 'version.dll'
$destination=Join-Path $client 'TS6-Enhanced'
$receipt=Join-Path $root 'native-install.json'
foreach($path in @($root,$client,$dll,$destination,$receipt)){Assert-LayoutPlainPath $path}
$operation=Enter-LayoutOperation
try {
    if($Action -eq 'ApplyPending'){
        $deadline=[datetime]::UtcNow.AddSeconds(30)
        while(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object Path -EQ $exe){
            if([datetime]::UtcNow -gt $deadline){throw 'TeamSpeak is still running; the queued update was retained.'}
            Start-Sleep -Milliseconds 250
        }
        $pendingPath=Join-Path $root 'pending-update.json'
        $pending=Get-Content -LiteralPath $pendingPath -Raw | ConvertFrom-Json
        $release=Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw | ConvertFrom-Json
        # The retained installer package may already be the target version after
        # an interrupted post-install phase. Both entry points use the same queue.
        if($release.version -cne $pending.fromVersion -and $release.version -cne $pending.version){throw 'Queued update belongs to another installation'}
        $installer=& {param($pending,$dataRoot,$maintenance) . $maintenance -FunctionsOnly; Assert-UpdateInstaller $pending $dataRoot} $pending $root (Join-Path $PSScriptRoot 'Maintenance.ps1')
        if(!$PSCmdlet.ShouldProcess($installer,'Install the verified update after TeamSpeak closes')){return}
        $setup=Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TSIXDEFERRED=1','/TSIXNOOPEN=1' -WorkingDirectory $root -WindowStyle Hidden -PassThru
        $setup.WaitForExit()
        if($setup.ExitCode -ne 0){throw "Queued update failed ($($setup.ExitCode)); it remains available for retry"}
        Assert-LayoutNativeInstall $root $client $pending.version
        # A newer download must never be removed by this operation.
        $current=Get-Content -LiteralPath $pendingPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
        if($current -and $current.sha256 -eq $pending.sha256){Remove-Item -LiteralPath $pendingPath}
        return
    }
    $state=$null
    if(Test-Path -LiteralPath $receipt){
        $state=Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
        if($state.owner -ne 'ts6-enhanced-native-v1' -or $state.directory -ine $destination -or $state.dll -ine $dll){throw 'Invalid native ownership receipt'}
        if((Get-FileHash -LiteralPath $dll).Hash -ine $state.dllHash){throw 'The installed DLL was changed; it was left untouched'}
        foreach($file in $state.files){
            if($file.path -match '(^|[/\\])\.\.?([/\\]|$)|:|^[/\\]'){throw 'Invalid native file receipt'}
            $path=Join-Path $destination $file.path;Assert-LayoutPlainPath $path
            if((Get-FileHash -LiteralPath $path).Hash -ine $file.sha256){throw "Installed file changed: $($file.path)"}
        }
        $files=@(Get-ChildItem -LiteralPath $destination -File -Recurse)
        if($files.Count -ne @($state.files).Count){throw 'Unowned files exist in the native installation; nothing was removed'}
    }elseif((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $dll)){
        throw 'An unowned VERSION.dll or native payload already exists; nothing was overwritten'
    }
    if($Action -eq 'Uninstall' -and !$state){Write-Output 'Native installation is absent.';return}
    if($Action -eq 'Install'){
        $release=Get-Content -LiteralPath (Join-Path $project 'release.json') -Raw | ConvertFrom-Json
        foreach($image in $release.supportedClient.nativeImages.PSObject.Properties){
            if((Get-FileHash -LiteralPath (Join-Path $client $image.Name)).Hash -ine $image.Value.sha256){throw "Unsupported native TeamSpeak file: $($image.Name)"}
        }
        foreach($resource in $release.supportedClient.resourceHashes.PSObject.Properties){
            if((Get-FileHash -LiteralPath (Join-Path $client $resource.Name)).Hash -ine $resource.Value){throw 'Unsupported or modified TS6 UI resources'}
        }
        $payload=@('release.json','native\CEF-LICENSE.txt','runtime\node.exe','runtime\LICENSE','tools\native-manager.mjs','tools\updates.mjs','tools\install-state.mjs',
            'scripts\Native-Setup.ps1','scripts\Startup-Update.ps1','scripts\Runtime.ps1','scripts\Maintenance.ps1','scripts\Start-Inspection.ps1','scripts\Restore-LegacyShortcut.ps1','scripts\Remove-LegacyTheme.ps1',
            'tools\restore.mjs','tools\appearance.mjs','tools\cdp.mjs','tools\client.mjs')
        foreach($dependency in $release.nativeLoader.dependencies){
            if($dependency -notmatch '^node_modules/ws/(lib/[a-z-]+\.js|index\.js|wrapper\.mjs|package\.json|LICENSE)$'){throw 'Unexpected bundled dependency'}
            $payload+=$dependency
        }
        foreach($file in $payload+@('runtime\version.dll')){Assert-LayoutPlainPath (Join-Path $project $file);if(!(Test-Path -LiteralPath (Join-Path $project $file) -PathType Leaf)){throw "Native payload is missing $file"}}
    }
    if(!$PSCmdlet.ShouldProcess($client,"$Action TS6 Enhanced native loading")){return}
    if(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object Path -EQ $exe){
        if(!$Restart){throw 'Close TeamSpeak to install or remove the native loader. Your session was left running.'}
        Stop-LayoutClient $exe
    }
    $transaction=Join-Path $root ('native-history\'+[guid]::NewGuid().ToString('N'))
    Assert-LayoutPlainPath $transaction;New-Item -ItemType Directory -Path $transaction -Force | Out-Null
    if(Test-Path -LiteralPath $dll){Copy-Item -LiteralPath $dll -Destination (Join-Path $transaction 'version.dll')}
    if($state){Copy-Item -LiteralPath $receipt -Destination (Join-Path $transaction 'native-install.json')}
    if($Action -eq 'Uninstall'){
        # The legacy adapter is used only for explicit removal. Normal native
        # startup and the updater never require a debugging connection.
        if(Test-Path -LiteralPath (Join-Path $root 'before-install.json')){
            & (Join-Path $PSScriptRoot 'Maintenance.ps1') -Action Remove -LegacyOnly -NoLaunch -Restart
        }
        Remove-Item -LiteralPath $dll
        # Resolved source and target are fixed children of the installation and
        # recovery roots; every payload file was verified above.
        if([IO.Path]::GetFullPath($destination) -ine (Join-Path $client 'TS6-Enhanced') -or !(($transaction+'\').StartsWith(($root+'\native-history\'),[StringComparison]::OrdinalIgnoreCase))){throw 'Unexpected recovery target'}
        Move-Item -LiteralPath $destination -Destination (Join-Path $transaction 'payload')
        Remove-Item -LiteralPath $receipt
        if($Restart){Start-Process -FilePath $exe -WorkingDirectory $client -WindowStyle Normal | Out-Null}
        return
    }
    $stage=Join-Path $transaction 'new-payload'
    New-Item -ItemType Directory -Path $stage | Out-Null
    $inventory=@(foreach($file in $payload){
        $source=Join-Path $project $file;$target=Join-Path $stage $file
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $target
        $hash=(Get-FileHash -LiteralPath $source).Hash
        if((Get-FileHash -LiteralPath $target).Hash -cne $hash){throw "Native payload copy failed: $file"}
        [pscustomobject]@{path=$file;sha256=$hash}
    })
    $hadPayload=Test-Path -LiteralPath $destination
    try {
        if($hadPayload){
            if([IO.Path]::GetFullPath($destination) -ine (Join-Path $client 'TS6-Enhanced')){throw 'Unexpected native payload target'}
            Move-Item -LiteralPath $destination -Destination (Join-Path $transaction 'payload')
        }
        if(![IO.Path]::GetFullPath($stage).StartsWith(($root+'\native-history\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected staged payload path'}
        Move-Item -LiteralPath $stage -Destination $destination
        Copy-Item -LiteralPath (Join-Path $project 'runtime\version.dll') -Destination $dll -Force
        $hash=(Get-FileHash -LiteralPath $dll).Hash
        if($hash -cne (Get-FileHash -LiteralPath (Join-Path $project 'runtime\version.dll')).Hash){throw 'Native DLL copy failed'}
        Write-LayoutJSON $receipt @{owner='ts6-enhanced-native-v1';directory=$destination;dll=$dll;dllHash=$hash;version=$release.version;files=$inventory}
        Write-LayoutJSON (Join-Path $root 'install-runtime.json') @{node=(Join-Path $destination 'runtime\node.exe');pwsh=(Get-LayoutPowerShell)}
    }catch{
        $failure=$_
        if(Test-Path -LiteralPath (Join-Path $transaction 'version.dll')){Copy-Item -LiteralPath (Join-Path $transaction 'version.dll') -Destination $dll -Force}
        elseif(Test-Path -LiteralPath $dll){Remove-Item -LiteralPath $dll}
        if(Test-Path -LiteralPath $destination){Move-Item -LiteralPath $destination -Destination (Join-Path $transaction 'failed-payload')}
        if($hadPayload){Move-Item -LiteralPath (Join-Path $transaction 'payload') -Destination $destination}
        if($state){Copy-Item -LiteralPath (Join-Path $transaction 'native-install.json') -Destination $receipt -Force}
        elseif(Test-Path -LiteralPath $receipt){Remove-Item -LiteralPath $receipt}
        throw $failure
    }
    $oldState=Join-Path $root 'persistence\state.json'
    if(Test-Path -LiteralPath $oldState){
        $legacy=Get-Content -LiteralPath $oldState -Raw | ConvertFrom-Json
        $shortcut=Join-Path ([Environment]::GetFolderPath('Programs')) 'TeamSpeak.lnk'
        $exists=Test-Path -LiteralPath $shortcut
        $shell=New-Object -ComObject WScript.Shell
        $currentLink=if($exists){$shell.CreateShortcut($shortcut)}else{$null}
        $managedTarget=Join-Path $root 'persistence\TS6-Enhanced.exe'
        $ownedManaged=$currentLink -and $currentLink.TargetPath -ieq $managedTarget -and !$currentLink.Arguments
        if($legacy.installed -or $ownedManaged -or !$exists){
        $original=Join-Path $root 'persistence\original-TeamSpeak.lnk'
        foreach($path in @($oldState,$shortcut,$original)){Assert-LayoutPlainPath $path}
        if($legacy.owner -ne 'ts6-layout-shortcut-v1' -or $legacy.shortcut -ine $shortcut -or (Get-FileHash -LiteralPath $original).Hash -ine $legacy.originalHash){throw 'Legacy shortcut recovery could not be verified'}
        $originalLink=$shell.CreateShortcut($original)
        if($originalLink.TargetPath -ine $exe -or $originalLink.Arguments){throw 'The saved original is not a native TeamSpeak shortcut'}
        Copy-Item -LiteralPath $oldState -Destination (Join-Path $transaction 'legacy-state.json')
        if($exists){Copy-Item -LiteralPath $shortcut -Destination (Join-Path $transaction 'legacy-shortcut.lnk')}
        if(!$exists -or $ownedManaged -or (Get-FileHash -LiteralPath $shortcut).Hash -ieq $legacy.currentHash){
            Copy-Item -LiteralPath $original -Destination $shortcut -Force
            Notify-LayoutShortcutChanged $shortcut
        }
        # Preserve a subsequently changed link. Retiring the old dispatcher
        # also makes cached Search entries and old taskbar pins launch normally.
        $legacy.installed=$false;$legacy.currentHash=(Get-FileHash -LiteralPath $shortcut).Hash
        Write-LayoutJSON $oldState $legacy
        }
    }
    Write-Output "TS6 Enhanced $($release.version) installed. Launch TeamSpeak normally."
}finally{Exit-LayoutOperation $operation}
