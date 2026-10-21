#requires -Version 7.0
# Small entry point over the existing suites. Native/live checks are opt-in.
[CmdletBinding()]
param([ValidateSet('Core','Browser','Native','Installer')][string]$Suite='Core')
$ErrorActionPreference='Stop'
$project=Split-Path -Parent $PSScriptRoot
function Run([string]$Program,[string[]]$Arguments){
    & $Program @Arguments
    if($LASTEXITCODE -ne 0){throw "$Program failed: $($Arguments -join ' ')"}
}
$previousModel=$env:TSIX_STREAM_MODEL
Push-Location $project
try {
    switch($Suite){
        Core {
            foreach($file in Get-ChildItem tools,tests -File | Where-Object Extension -in '.js','.mjs'){Run node @('--check',$file.FullName)}
            foreach($file in Get-ChildItem scripts,tests -Filter '*.ps1'){
                $tokens=$null;$errors=$null
                [void][Management.Automation.Language.Parser]::ParseFile($file.FullName,[ref]$tokens,[ref]$errors)
                if($errors.Count){throw ($errors -join [Environment]::NewLine)}
            }
            Run node @('--test','tests/updates.test.mjs','tests/install-state.test.mjs','tests/manager-start.test.mjs')
            foreach($file in @('maintenance','launcher','deferred-update')){Run powershell.exe @('-NoProfile','-ExecutionPolicy','Bypass','-File',"tests/$file.ps1")}
            Run powershell.exe @('-NoProfile','-ExecutionPolicy','Bypass','-File','tests/bootstrap.ps1')
        }
        Browser {
            $env:TSIX_STREAM_MODEL='beta5'
            foreach($file in @('native-shell','workspace-controls','stream-tray','stream-chat','stream-polish','stream-volume','broadcast')){Run node @("tests/$file.mjs")}
        }
        Native {
            $themeArguments=@('-NoProfile','-File','scripts/Test-Theme.ps1')
            if($env:TSIX_CLIENT_PATH){$themeArguments+=@('-ClientPath',$env:TSIX_CLIENT_PATH)}
            Run pwsh $themeArguments
            foreach($file in @('manager','stream-volume-vue','stream-resize','stream-chat-refresh')){Run node @("tests/$file.mjs")}
        }
        Installer {
            foreach($file in @('maintenance','persistence')){Run powershell.exe @('-NoProfile','-ExecutionPolicy','Bypass','-File',"tests/$file.ps1")}
            foreach($file in @('installer-smoke','deployment')){Run pwsh @('-NoProfile','-File',"tests/$file.ps1")}
        }
    }
    Write-Output "PASS: $Suite suite. No live TeamSpeak interaction was invoked."
} finally {
    if($null -eq $previousModel){Remove-Item Env:TSIX_STREAM_MODEL -ErrorAction SilentlyContinue}else{$env:TSIX_STREAM_MODEL=$previousModel}
    Pop-Location
}
