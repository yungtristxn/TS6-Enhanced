#requires -Version 5.1
param([ValidateSet('Protect','Unprotect')][string]$Action,[Parameter(Mandatory)][string]$Path)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
. (Join-Path $PSScriptRoot 'Runtime.ps1')
Assert-LayoutPlainPath $Path
Add-Type -AssemblyName System.Security
# Protect window identity as well as the requested source. A recycled HWND must
# never silently capture a different window after an update.
function Get-WindowIdentity([string]$SourceId){
    if(!('TsixWindowOwner' -as [type])){Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class TsixWindowOwner {
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint process);
}
'@
    }
    $handle=0L;if(![long]::TryParse($SourceId,[ref]$handle)-or $handle -le 0){throw 'Window source is not restorable'}
    [uint32]$owner=0;$thread=[TsixWindowOwner]::GetWindowThreadProcessId([IntPtr]$handle,[ref]$owner)
    if(!$thread -or !$owner){throw 'The shared window is no longer available'}
    $process=Get-Process -Id $owner -ErrorAction Stop
    return @{pid=$owner;started=$process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}
}
try {
    $entropy=[Text.Encoding]::UTF8.GetBytes('TS6-Enhanced-update-session-v1')
    if($Action -eq 'Protect'){
        $raw=[Console]::In.ReadToEnd();if([Text.Encoding]::UTF8.GetByteCount($raw) -gt 70000){throw 'Snapshot too large'}
        $value=$raw|ConvertFrom-Json;$windows=@{}
        foreach($connection in $value.snapshot.connections){foreach($stream in $connection.outbound){if($stream.source.type -eq 3){$windows[$stream.source.id]=Get-WindowIdentity $stream.source.id}}}
        # Keep the original JSON as a string so rich-text/Unicode state is not
        # changed by PowerShell object conversion or serializer depth limits.
        $envelope=@{payload=$raw;windows=$windows}|ConvertTo-Json -Depth 6 -Compress
        $bytes=[Text.Encoding]::UTF8.GetBytes($envelope)
        $encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $temporary=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
        try{[IO.File]::WriteAllBytes($temporary,$encrypted);[IO.File]::Move($temporary,$Path)}finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
    }else{
        $encrypted=[IO.File]::ReadAllBytes($Path);if($encrypted.Length -gt 131072){throw 'Protected snapshot too large'}
        $bytes=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $value=[Text.Encoding]::UTF8.GetString($bytes)|ConvertFrom-Json
        $allowed=@{}
        foreach($property in $value.windows.PSObject.Properties){
            $valid=$false;try{$current=Get-WindowIdentity $property.Name;$valid=$current.pid -eq $property.Value.pid -and $current.started -ceq $property.Value.started}catch{}
            $allowed[$property.Name]=$valid
        }
        [Console]::Out.Write((@{payload=$value.payload;windowMatches=$allowed}|ConvertTo-Json -Depth 6 -Compress))
    }
}catch{[Console]::Error.Write('The protected update session could not be processed.');exit 1}
