using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("TeamSpeak")]
[assembly: AssemblyProduct("TS6 Enhanced")]
[assembly: AssemblyDescription("TeamSpeak with TS6 Enhanced")]
[assembly: AssemblyVersion("1.0.0.0")]
// Component version: product-only bumps must preserve the runtime fingerprint
// so a later CSS-only release can still apply its appearance live.
[assembly: AssemblyFileVersion("1.0.0.0")]

internal static class Launcher {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    static readonly string Local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
    static readonly string Data = Path.Combine(Local, "TS6-Layout");
    static readonly string Client = Path.Combine(Local, "Programs", "TeamSpeak", "TeamSpeak.exe");

    static string Quote(string value) {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char character in value) {
            if (character == '\\') { slashes++; continue; }
            result.Append('\\', slashes * (character == '"' ? 2 : 1) + (character == '"' ? 1 : 0));
            result.Append(character); slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }
    static void Plain(string path) {
        for (string current = Path.GetFullPath(path); !String.IsNullOrEmpty(current); current = Path.GetDirectoryName(current)) {
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Linked installation paths are not supported. Run setup to repair the installation.");
            if (Path.GetPathRoot(current) == current) break;
        }
    }
    static Dictionary<string, object> Read(string path) {
        Plain(path); return Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
    }
    static string Text(Dictionary<string, object> value, string key) {
        object found;
        if (!value.TryGetValue(key, out found) || !(found is string)) throw new IOException("Missing installation setting: " + key);
        return (string)found;
    }
    static string Release(string root, Dictionary<string, object> state) {
        if (Text(state, "owner") != "ts6-layout-shortcut-v1" || !(state["installed"] is bool)) throw new IOException("Invalid launcher ownership record.");
        string selected = Text(state, "release");
        if (!Path.IsPathRooted(selected)) throw new IOException("Invalid managed release path.");
        string release = Path.GetFullPath(selected).TrimEnd(Path.DirectorySeparatorChar);
        if (!String.Equals(Path.GetDirectoryName(release), Path.Combine(root, "releases"), StringComparison.OrdinalIgnoreCase) || !Regex.IsMatch(Path.GetFileName(release), @"^\d{8}-\d{6}-\d{3}-[a-f0-9]{8}$"))
            throw new IOException("The selected release is outside this installation.");
        Plain(release); return release;
    }
    static Process Start(string exe, string arguments, string directory, bool hidden, bool inheritOperation) {
        Plain(exe);
        var start = new ProcessStartInfo(exe, arguments) { WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = hidden, WindowStyle = hidden ? ProcessWindowStyle.Hidden : ProcessWindowStyle.Normal };
        if (!inheritOperation) start.EnvironmentVariables.Remove("TSIX_OPERATION_TOKEN");
        return Process.Start(start);
    }
    static void Run(string exe, string arguments, string directory, int timeout) {
        var start = new ProcessStartInfo(exe, arguments) { WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
        Plain(exe);
        using (var process = Process.Start(start)) {
            var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(timeout)) { process.Kill(); throw new IOException("Enhancement attachment timed out. TeamSpeak was left open."); }
            if (process.ExitCode != 0) throw new IOException((error.Result + " " + output.Result).Trim());
        }
    }
    static bool ClientRunning() {
        foreach (var process in Process.GetProcessesByName("TeamSpeak")) using (process) {
            try { if (String.Equals(process.MainModule.FileName, Client, StringComparison.OrdinalIgnoreCase)) return true; }
            catch (System.ComponentModel.Win32Exception) { }
            catch (InvalidOperationException) { }
        }
        return false;
    }
    static void Receipt(string path, object state) {
        Plain(path); Directory.CreateDirectory(Path.GetDirectoryName(path));
        string temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try {
            File.WriteAllText(temp, Json.Serialize(state), new UTF8Encoding(false));
            if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path);
        } finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    // Same lease as setup: the immutable worker owns it while the stable entry
    // exits, allowing a queued installer to replace the stable EXE safely.
    static FileStream EnterOperation() {
        string path = Path.Combine(Data, "operation.lock"); Plain(path); Directory.CreateDirectory(Data);
        string inherited = Environment.GetEnvironmentVariable("TSIX_OPERATION_TOKEN");
        DateTime deadline = DateTime.UtcNow.AddSeconds(75);
        using (var gate = new Mutex(false, @"Local\TS6EnhancedOperationAdmission")) {
            while (DateTime.UtcNow < deadline) {
                bool held = false; FileStream lease = null;
                try {
                    try { held = gate.WaitOne(3000); } catch (AbandonedMutexException) { held = true; }
                    if (!held) continue;
                    bool owned = false;
                    try {
                        using (var writer = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None)) {
                            byte[] token = Encoding.ASCII.GetBytes(Guid.NewGuid().ToString("N"));
                            writer.SetLength(0); writer.Write(token, 0, token.Length); writer.Flush(true); owned = true;
                        }
                    } catch (IOException) { }
                    lease = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
                    string actual;
                    using (var reader = new StreamReader(lease, Encoding.ASCII, false, 128, true)) actual = reader.ReadToEnd();
                    if (!Regex.IsMatch(actual, "^[a-f0-9]{32,64}$")) throw new IOException("Invalid lifecycle operation receipt.");
                    if (owned || (!String.IsNullOrEmpty(inherited) && actual == inherited)) {
                        Environment.SetEnvironmentVariable("TSIX_OPERATION_TOKEN", actual); return lease;
                    }
                    lease.Dispose(); lease = null;
                } catch { if (lease != null) lease.Dispose(); throw; }
                finally { if (held) gate.ReleaseMutex(); }
                Thread.Sleep(100);
            }
        }
        throw new IOException("Another TS6 Enhanced operation is still running. Retry when it finishes.");
    }
    static int Worker(string root, int port) {
        using (var operation = EnterOperation()) {
            var state = Read(Path.Combine(root, "state.json")); string release = Release(root, state);
            if (!(bool)state["installed"]) { using (Start(Client, "", Path.GetDirectoryName(Client), false, false)) { } return 0; }
            string node = Text(Read(Path.Combine(release, "runtime.json")), "node");
            if (!Path.IsPathRooted(node)) throw new IOException("Invalid Node runtime path.");
            var manifest = Read(Path.Combine(release, "release.json")); bool running = ClientRunning();
            string pendingPath = Path.Combine(Data, "pending-update.json");
            if (!running && File.Exists(pendingPath)) {
                var pending = Read(pendingPath); object from;
                if (pending.TryGetValue("fromVersion", out from) && (string)from == Text(manifest, "version")) {
                    string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
                    using (var update = Start(powershell, "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File " + Quote(Path.Combine(release, "scripts", "Maintenance.ps1")) + " -Action Update", release, true, true)) {
                        update.WaitForExit(); if (update.ExitCode != 0) throw new IOException("The queued update could not finish. Run setup to repair it.");
                    }
                    return 0;
                }
            }
            if (running && !IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(endpoint => endpoint.Port == port && IPAddress.IsLoopback(endpoint.Address)))
                throw new IOException("TeamSpeak is already open without enhancements. Close it when your call is finished, then reopen TeamSpeak from Search or your pinned shortcut.");
            using (Start(Client, "--remote-debugging-address=127.0.0.1 --remote-debugging-port=" + port, Path.GetDirectoryName(Client), false, false)) { }
            string marker = Path.Combine(release, ".theme-ready");
            var runtime = Read(Path.Combine(release, "runtime.json")); object preserve;
            string setup = File.Exists(marker) ? "" : runtime.TryGetValue("preserveAppearance", out preserve) && preserve is bool && (bool)preserve ? " --upgrade" : " --setup";
            Run(node, Quote(Path.Combine(release, "tools", "session.mjs")) + " --port " + port + setup, release, 150000);
            if (!File.Exists(marker)) File.WriteAllText(marker, "Activated through native Appearance settings", new UTF8Encoding(false));
            string receipt = Path.Combine(Data, "launcher", "manager-" + Guid.NewGuid().ToString("N") + ".json");
            Directory.CreateDirectory(Path.GetDirectoryName(receipt)); Plain(receipt);
            using (var manager = Start(node, Quote(Path.Combine(release, "tools", "manager.mjs")) + " --port " + port + " --ready-file " + Quote(receipt), release, true, false)) {
                try {
                    DateTime deadline = DateTime.UtcNow.AddSeconds(75);
                    while (!File.Exists(receipt)) {
                        if (manager.HasExited || DateTime.UtcNow >= deadline) throw new IOException("The update controls could not start. See the manager error in LocalAppData\\TS6-Layout.");
                        Thread.Sleep(100);
                    }
                    var result = Read(receipt);
                    if (Text(result, "status") != "ready") throw new IOException(Text(result, "message"));
                } finally { if (File.Exists(receipt)) File.Delete(receipt); }
            }
            Receipt(Path.Combine(Data, "launcher", "last-launch.json"), new { status = "ready", timestamp = DateTime.UtcNow.ToString("o"), release = release, entry = "native", port = port });
            return 0;
        }
    }
    [STAThread] static int Main(string[] args) {
        try {
            bool worker = args.Length > 0 && args[0] == "--worker";
            string root = worker ? Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "..", "..")) : AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            int offset = worker ? 1 : 0, port = 9988;
            if (args.Length > offset && (args.Length != offset + 2 || args[offset] != "--port" || !Int32.TryParse(args[offset + 1], out port) || port < 1024 || port > 65535)) throw new IOException("Invalid launcher arguments.");
            if (worker) return Worker(root, port);
            var state = Read(Path.Combine(root, "state.json")); string release = Release(root, state);
            if (!(bool)state["installed"]) { using (Start(Client, "", Path.GetDirectoryName(Client), false, false)) { } return 0; }
            using (Start(Path.Combine(release, "runtime", "TS6-Enhanced.exe"), "--worker --port " + port, release, true, true)) { }
            return 0;
        } catch (Exception error) {
            try { Receipt(Path.Combine(Data, "launcher", "last-launch.json"), new { status = "failed", timestamp = DateTime.UtcNow.ToString("o"), message = error.Message, entry = "native" }); } catch { }
            MessageBox.Show(error.Message, "TS6 Enhanced", MessageBoxButtons.OK, MessageBoxIcon.Warning); return 1;
        }
    }
}
