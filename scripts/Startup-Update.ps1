#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][int]$StartupProcessId,
      [Parameter(Mandatory)][long]$StartupCreationTime,
      [Parameter(Mandatory)][long]$AcceptHandle,
      [Parameter(Mandatory)][string]$ArgumentsBase64)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$root=Join-Path $env:LOCALAPPDATA 'TS6-Layout'
$client=Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'
$operation=$null;$startup=$null;$accept=$null;$accepted=$false;$pending=$null
try {
    foreach($path in @($root,$client,(Join-Path $root 'pending-update.json'))){Assert-LayoutPlainPath $path}
    $startup=Get-Process -Id $StartupProcessId -ErrorAction Stop
    # Open the process handle before acknowledging, so PID reuse cannot redirect us.
    $null=$startup.Handle
    if($startup.Path -ine $client -or $startup.StartTime.ToUniversalTime().ToFileTimeUtc() -ne $StartupCreationTime){throw 'Startup process identity changed'}
    $arguments=if($ArgumentsBase64 -eq 'none'){''}else{[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($ArgumentsBase64))}
    if($arguments.Length -gt 32767 -or $arguments.Contains([char]0)){throw 'Invalid launch arguments'}
    $operation=Enter-LayoutOperation
    $pending=Get-Content -LiteralPath (Join-Path $root 'pending-update.json') -Raw | ConvertFrom-Json
    $installed=Get-Content -LiteralPath (Join-Path $root 'native-install.json') -Raw | ConvertFrom-Json
    if($installed.owner -ne 'ts6-enhanced-native-v1' -or $installed.version -notin @($pending.fromVersion,$pending.version)){throw 'Queued update belongs to another installation'}
    $null=& {param($entry,$dataRoot,$script) . $script -FunctionsOnly; Assert-UpdateInstaller $entry $dataRoot} $pending $root (Join-Path $PSScriptRoot 'Maintenance.ps1')
    $accept=[Threading.EventWaitHandle]::new($false,[Threading.EventResetMode]::ManualReset)
    $accept.SafeWaitHandle=[Microsoft.Win32.SafeHandles.SafeWaitHandle]::new([IntPtr]$AcceptHandle,$true)
    [Console]::Out.WriteLine('retry');[Console]::Out.Flush()
    if(!$accept.WaitOne(5000)){throw 'Startup retry was not acknowledged; the client was left running'}
    $accepted=$true
    if(!$startup.WaitForExit(30000)){throw 'Startup client did not exit; the update remains queued'}
    & (Join-Path $PSScriptRoot 'Native-Setup.ps1') -Action ApplyPending | Out-Null
} catch {
    try{Write-LayoutJSON (Join-Path $root 'native-error.json') @{at=[datetime]::UtcNow.ToString('o');message=$_.Exception.Message;
        update=@{version=$pending.version;sha256=$pending.sha256};phase='startup-retry'}}catch{}
    if(!$accepted){try{[Console]::Out.WriteLine('continue');[Console]::Out.Flush()}catch{}}
} finally {
    if($accept){$accept.Dispose()}
    Exit-LayoutOperation $operation
    # On failure open the existing client once, without recursively retrying.
    # Preserve the original URI/options in memory; never persist them in a log.
    if($accepted -and $startup.HasExited){
        try{Start-LayoutClient $client $arguments}
        catch{try{Write-LayoutJSON (Join-Path $root 'native-error.json') @{at=[datetime]::UtcNow.ToString('o');message='Update retry finished, but TeamSpeak could not reopen. Launch it normally.';phase='startup-reopen'}}catch{}}
    }
    if($startup){$startup.Dispose()}
}
