#requires -Version 5.1
[CmdletBinding()]
param([Parameter(Mandatory)][string]$OutputPath,
      [string]$IconSource=(Join-Path $env:LOCALAPPDATA 'Programs\TeamSpeak\TeamSpeak.exe'))
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
$project=Split-Path -Parent $PSScriptRoot
$source=Join-Path $project 'tools\launcher.cs'
$compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path -LiteralPath $compiler)){throw 'The Windows .NET Framework compiler is required to build the launcher.'}
$hashes=(Get-FileHash -LiteralPath $source).Hash+(Get-FileHash -LiteralPath $compiler).Hash+(Get-FileHash -LiteralPath $PSCommandPath).Hash
if($IconSource){$hashes+=(Get-FileHash -LiteralPath $IconSource).Hash}
$hasher=[Security.Cryptography.SHA256]::Create()
try{$key=([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($hashes)))).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
# The Framework compiler emits a new module ID each time. Reuse verified bytes
# for unchanged source/compiler so CSS-only builds keep their runtime fingerprint.
$cache=Join-Path $project ('.local\launcher-cache\'+$key)
Assert-LayoutPlainPath $cache
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$binary=Join-Path $cache 'TS6-Enhanced.exe'
$checksum=$binary+'.sha256'
if(!(Test-Path -LiteralPath $binary) -or !(Test-Path -LiteralPath $checksum)){
    $temporary=Join-Path $cache ([guid]::NewGuid().ToString('N')+'.exe')
    try{
        $iconArguments=@()
        if($IconSource){
            # Icon.Save on an extracted HICON drops the other sizes and can
            # retain only a low-color legacy frame. Copy the PE resources intact.
            if(!('TS6Enhanced.IconResources' -as [type])){
                Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace TS6Enhanced {
    public static class IconResources {
        delegate bool EnumName(IntPtr module, IntPtr type, IntPtr name, IntPtr parameter);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
        [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool EnumResourceNames(IntPtr module, IntPtr type, EnumName callback, IntPtr parameter);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr FindResource(IntPtr module, IntPtr name, IntPtr type);
        [DllImport("kernel32.dll", SetLastError=true)] static extern uint SizeofResource(IntPtr module, IntPtr resource);
        [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
        [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr LockResource(IntPtr resource);
        static byte[] Resource(IntPtr module, IntPtr name, int type) {
            IntPtr resource = FindResource(module, name, (IntPtr)type);
            if (resource == IntPtr.Zero) throw new Win32Exception();
            uint length = SizeofResource(module, resource);
            if (length == 0 || length > 16777216) throw new InvalidDataException("Invalid icon resource size.");
            IntPtr bytes = LockResource(LoadResource(module, resource));
            if (bytes == IntPtr.Zero) throw new Win32Exception();
            byte[] result = new byte[length]; Marshal.Copy(bytes, result, 0, result.Length); return result;
        }
        public static byte[] Read(string path) {
            IntPtr module = LoadLibraryEx(path, IntPtr.Zero, 0x22); // Data/image resource only; never execute the source.
            if (module == IntPtr.Zero) throw new Win32Exception();
            try {
                byte[] group = null; Exception failure = null;
                EnumName find = delegate(IntPtr handle, IntPtr type, IntPtr name, IntPtr parameter) {
                    try { group = Resource(handle, name, 14); } catch(Exception error) { failure = error; }
                    return false;
                };
                EnumResourceNames(module, (IntPtr)14, find, IntPtr.Zero);
                if (failure != null) throw failure;
                if (group == null || group.Length < 6 || BitConverter.ToUInt16(group, 0) != 0 || BitConverter.ToUInt16(group, 2) != 1) throw new InvalidDataException("Missing application icon group.");
                int count = BitConverter.ToUInt16(group, 4);
                if (count == 0 || count > 256 || group.Length != 6 + 14 * count) throw new InvalidDataException("Invalid icon directory.");
                var images = new List<byte[]>();
                for (int i = 0; i < count; i++) {
                    byte[] image = Resource(module, (IntPtr)BitConverter.ToUInt16(group, 6 + 14 * i + 12), 3);
                    if (image.Length != BitConverter.ToUInt32(group, 6 + 14 * i + 8)) throw new InvalidDataException("Icon frame length mismatch.");
                    images.Add(image);
                }
                using (var stream = new MemoryStream()) using (var writer = new BinaryWriter(stream)) {
                    writer.Write(group, 0, 6); int offset = 6 + 16 * count;
                    for (int i = 0; i < count; i++) {
                        writer.Write(group, 6 + 14 * i, 12); writer.Write(offset); offset += images[i].Length;
                    }
                    foreach (byte[] image in images) writer.Write(image);
                    writer.Flush(); return stream.ToArray();
                }
            } finally { FreeLibrary(module); }
        }
    }
}
'@
            }
            Assert-LayoutPlainPath $IconSource
            $iconBytes=[TS6Enhanced.IconResources]::Read($IconSource)
            $iconFile=Join-Path $cache 'TeamSpeak.ico'
            [IO.File]::WriteAllBytes($iconFile,$iconBytes)
            $iconArguments=@('/win32icon:'+$iconFile)
        }
        & $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll @iconArguments ('/out:'+$temporary) $source
        if($LASTEXITCODE -ne 0){throw 'Native launcher compilation failed'}
        if($IconSource -and [Convert]::ToBase64String([TS6Enhanced.IconResources]::Read($temporary)) -cne [Convert]::ToBase64String($iconBytes)){throw 'The compiled launcher did not preserve the complete application icon.'}
        Copy-Item -LiteralPath $temporary -Destination $binary -Force
        (Get-FileHash -LiteralPath $binary).Hash | Set-Content -LiteralPath $checksum -Encoding ASCII
    }finally{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary}}
}
if((Get-FileHash -LiteralPath $binary).Hash -cne (Get-Content -LiteralPath $checksum -Raw).Trim()){throw 'Cached launcher checksum changed. Remove its cache directory and rebuild.'}
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
Assert-LayoutPlainPath $OutputPath
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
Copy-Item -LiteralPath $binary -Destination $OutputPath -Force
