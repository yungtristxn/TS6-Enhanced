#requires -Version 5.1
# Built-in Windows PowerShell and bundled Node. No admin or PATH edits.
if($PSVersionTable.PSEdition -eq 'Desktop'){$env:PSModulePath=Join-Path $PSHOME 'Modules'}
function Get-LayoutPowerShell {
    $path=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw 'Windows PowerShell 5.1 is unavailable. Repair Windows PowerShell before running setup.'}
    return $path
}
function Assert-LayoutPlainPath([string]$Path) {
    for ($cursor=[IO.Path]::GetFullPath($Path); $cursor; $cursor=Split-Path -Parent $cursor) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Linked setup path refused: $cursor"
        }
        if ($cursor -eq (Split-Path -Parent $cursor)) { break }
    }
}
function Test-LayoutRuntime([string]$Path, [int]$MinimumMajor) {
    if (!$Path -or !(Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $version = & $Path --version 2>$null
        return $LASTEXITCODE -eq 0 -and "$version" -match '(\d+)\.\d+\.\d+' -and [int]$Matches[1] -ge $MinimumMajor
    } catch { return $false }
}
function Resolve-LayoutNode([string]$Root) {
    $executable=Join-Path $Root 'runtime\node.exe'
    $license=Join-Path $Root 'runtime\LICENSE'
    Assert-LayoutPlainPath $executable
    Assert-LayoutPlainPath $license
    if(!(Test-Path -LiteralPath $executable -PathType Leaf) -or !(Test-Path -LiteralPath $license -PathType Leaf)) {
        throw 'The bundled runtime is missing. Download the complete installer or extract the whole ZIP again.'
    }
    if(!(Test-LayoutRuntime $executable 22)){throw 'The bundled runtime could not start. Run the installer again to repair it.'}
    return $executable
}
function Assert-LayoutPackage([string]$Root) {
    $checksums = Join-Path $Root 'SHA256SUMS.txt'
    # A source checkout has no manifest; distributed ZIPs always include it.
    if (!(Test-Path -LiteralPath $checksums)) { return }
    foreach ($line in Get-Content -LiteralPath $checksums) {
        if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw 'Invalid package checksum list. Extract a fresh copy of the whole ZIP.' }
        $hash=$Matches[1]; $relative=$Matches[2]
        if ($relative -match '(^|[/\\])\.\.?([/\\]|$)|:|^[/\\]') { throw 'Unsafe package checksum path.' }
        $path=Join-Path $Root $relative
        Assert-LayoutPlainPath $path
        if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-FileHash -LiteralPath $path).Hash -ne $hash) { throw "Incomplete or changed package ($relative). Extract a fresh copy of the whole ZIP." }
    }
}
function Write-LayoutJSON([string]$Path,$Value) {
    Assert-LayoutPlainPath $Path
    $temp=$Path+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
    try {
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 10))
        $stream=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
        if([IO.File]::Exists($Path)){[IO.File]::Replace($temp,$Path,[NullString]::Value)}else{[IO.File]::Move($temp,$Path)}
    }finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
}

function Write-LayoutFailure([string]$Path,[string]$Message) {
    if(!$Path){return}
    try {
        Assert-LayoutPlainPath $Path
        $text=($Message -replace '\x1b\[[0-9;]*m','').Trim()
        [IO.File]::WriteAllText($Path,$text,[Text.UTF8Encoding]::new($true))
    }catch{Write-Warning 'Could not write the setup error summary; details remain in the setup log.'}
}

function Assert-LayoutNativeInstall([string]$Root,[string]$Client,[string]$Version) {
    $receipt=Join-Path $Root 'native-install.json'
    Assert-LayoutPlainPath $receipt
    $state=Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    $payload=Join-Path $Client 'TS6-Enhanced';$dll=Join-Path $Client 'version.dll'
    if($state.owner -ne 'ts6-enhanced-native-v1' -or $state.version -cne $Version -or $state.directory -ine $payload -or $state.dll -ine $dll){throw 'Update did not produce the expected native installation receipt'}
    Assert-LayoutPlainPath $dll;Assert-LayoutPlainPath $payload
    if((Get-FileHash -LiteralPath $dll).Hash -ine $state.dllHash){throw 'Updated native DLL does not match its receipt'}
    if(!@($state.files).Count){throw 'Updated payload inventory is empty'}
    foreach($file in $state.files){
        if($file.path -match '(^|[/\\])\.\.?([/\\]|$)|:|^[/\\]'){throw 'Invalid updated payload path'}
        $path=Join-Path $payload $file.path;Assert-LayoutPlainPath $path
        if((Get-FileHash -LiteralPath $path).Hash -ine $file.sha256){throw 'Updated payload does not match its receipt'}
    }
    if(@(Get-ChildItem -LiteralPath $payload -File -Recurse).Count -ne @($state.files).Count){throw 'Updated payload contains unowned files'}
}

function Notify-LayoutShortcutChanged([string]$Path,[string]$IconPath='') {
    if(!('TS6Enhanced.ShellChanges' -as [type])){
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace TS6Enhanced {
    public static class ShellChanges {
        [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
        struct FileInfo {
            public IntPtr Icon; public int Index; public uint Attributes;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string DisplayName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string TypeName;
        }
        [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
        public static extern void SHChangeNotify(int events, uint flags, string path, IntPtr unused);
        [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
        static extern IntPtr SHGetFileInfo(string path, uint attributes, out FileInfo info, uint size, uint flags);
        [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
        static extern void SHUpdateImage(string path, int index, uint flags, int imageIndex);
        public static void RefreshExecutableIcon(string path) {
            FileInfo info;
            if(SHGetFileInfo(path, 0, out info, (uint)Marshal.SizeOf(typeof(FileInfo)), 0x4000) != IntPtr.Zero)
                SHUpdateImage(path, 0, 0, info.Index);
            SHChangeNotify(0x2000, 0x1005, path, IntPtr.Zero);
        }
    }
}
'@
    }
    # Refresh this app's icon cache entry as well as its shortcut metadata.
    if($IconPath){[TS6Enhanced.ShellChanges]::RefreshExecutableIcon($IconPath)}
    [TS6Enhanced.ShellChanges]::SHChangeNotify(0x2000,0x1005,$Path,[IntPtr]::Zero)
    [TS6Enhanced.ShellChanges]::SHChangeNotify(0x1000,0x1005,(Split-Path -Parent $Path),[IntPtr]::Zero)
}

# A short mutex serializes admission; shared read handles retain the operation
# across parent/child handoffs, including an updater waiting for Inno. Windows
# releases handles after a crash. Only descendants with the current token join.
function Enter-LayoutOperation {
    $path=Join-Path $env:LOCALAPPDATA 'TS6-Layout\operation.lock'
    Assert-LayoutPlainPath $path
    $gate=[Threading.Mutex]::new($false,'Local\TS6EnhancedOperationAdmission')
    $held=$false;$lease=$null;$previous=$env:TSIX_OPERATION_TOKEN
    try {
        try{$held=$gate.WaitOne(3000)}catch [Threading.AbandonedMutexException]{$held=$true}
        if(!$held){throw 'Another TS6 Enhanced operation is starting. Retry when it finishes.'}
        [IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
        $writer=$null
        try{$writer=[IO.File]::Open($path,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch [IO.IOException]{}
        if($writer){
            try{
                $token=[guid]::NewGuid().ToString('N')
                $bytes=[Text.Encoding]::ASCII.GetBytes($token)
                $writer.SetLength(0);$writer.Write($bytes,0,$bytes.Length);$writer.Flush($true)
            }finally{$writer.Dispose()}
        }
        $lease=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        $reader=[IO.StreamReader]::new($lease,[Text.Encoding]::ASCII,$false,128,$true)
        try{$actual=$reader.ReadToEnd()}finally{$reader.Dispose()}
        if(!$writer -and (!$previous -or $actual -cne $previous)){throw 'Another TS6 Enhanced operation is running. Finish it before retrying.'}
        if($actual -notmatch '^[a-f0-9]{32,64}$'){throw 'Invalid lifecycle operation receipt'}
        $env:TSIX_OPERATION_TOKEN=$actual
        return [pscustomobject]@{Lease=$lease;Previous=$previous}
    }catch{if($lease){$lease.Dispose()};throw}
    finally{if($held){$gate.ReleaseMutex()};$gate.Dispose()}
}
function Exit-LayoutOperation($Operation) {
    if($Operation){$Operation.Lease.Dispose();$env:TSIX_OPERATION_TOKEN=$Operation.Previous}
}

# Relaunch without inheriting the maintenance worker's standard handles. In
# particular, a GUI child must not retain Node's stderr pipe for its lifetime.
function Start-LayoutClient([string]$ClientPath,[string]$Arguments='') {
    Assert-LayoutPlainPath $ClientPath
    if(!('TS6Enhanced.ClientLauncher' -as [type])){
        Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Runtime.InteropServices;
namespace TS6Enhanced {
 public static class ClientLauncher {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup {
   public int cb;public string reserved,desktop,title;public int x,y,cx,cy,charsX,charsY,fill,flags;
   public short show,reservedSize;public IntPtr reservedPtr,input,output,error;
  }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {public IntPtr process,thread;public int pid,tid;}
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern bool CreateProcess(string app,System.Text.StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,int flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo info);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static int Start(string app,string arguments,string directory,string environment){
   var startup=new Startup();startup.cb=Marshal.SizeOf(startup);ProcessInfo info;
   IntPtr block=Marshal.StringToHGlobalUni(environment);
   try{
    if(!CreateProcess(app,new System.Text.StringBuilder("\""+app+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,false,0x08000400,block,directory,ref startup,out info))throw new Win32Exception(Marshal.GetLastWin32Error());
    CloseHandle(info.thread);CloseHandle(info.process);return info.pid;
   }finally{Marshal.FreeHGlobal(block);}
  }
 }
}
'@
    }
    $variables=[Collections.Generic.SortedDictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach($entry in [Environment]::GetEnvironmentVariables().GetEnumerator()){
        if($entry.Key -notin @('TSIX_NATIVE_TOKEN','TSIX_NATIVE_ENDPOINT','TSIX_OPERATION_TOKEN','TSIX_SESSION_RESUME')){$variables[$entry.Key]=[string]$entry.Value}
    }
    $variables['TSIX_SKIP_STARTUP_RETRY']='1'
    $block=(@($variables.GetEnumerator()|ForEach-Object {$_.Key+'='+$_.Value}) -join [char]0)+[char]0+[char]0
    [void][TS6Enhanced.ClientLauncher]::Start($ClientPath,$Arguments,(Split-Path -Parent $ClientPath),$block)
}

function Stop-LayoutClient([string]$ClientPath) {
    $running=@(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ClientPath })
    $windows=@($running | Where-Object { [long]$_.MainWindowHandle -ne 0 })
    if($running.Count -and !$windows.Count){throw 'Open the TeamSpeak window, then retry. Background renderer processes were left alone.'}
    foreach($process in $windows) {
        if (!$process.CloseMainWindow()) { throw 'TeamSpeak could not close normally. Exit it yourself, then retry. No process was killed.' }
    }
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    while(Get-Process TeamSpeak -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ClientPath }) {
        if([DateTime]::UtcNow -gt $deadline){throw 'TeamSpeak is still running. Finish its dialog or exit it yourself, then retry. No process was killed.'}
        Start-Sleep -Milliseconds 200
    }
}
