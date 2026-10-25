// Replaces only disposable fixture files. Never reads the real user profile.
using System;using System.IO;using System.Linq;using System.Diagnostics;
using System.Security.Cryptography;using System.Web.Script.Serialization;
using System.Collections.Generic;
class StartupInstallerFixture {
    static string Hash(string file){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(file))).Replace("-","");}
    static int Main(string[] args){
        string root=Environment.GetEnvironmentVariable("TSIX_STARTUP_TEST_ROOT");
        if(String.IsNullOrEmpty(root)||!File.Exists(Path.Combine(root,"fixture-only")))return 91;
        var json=new JavaScriptSerializer();string data=Path.Combine(root,"profile","TS6-Layout"),client=Path.Combine(root,"profile","Programs","TeamSpeak");
        File.AppendAllText(Path.Combine(root,"attempts.txt"),"attempt\n");
        File.WriteAllText(Path.Combine(root,"installer-pid.txt"),Process.GetCurrentProcess().Id.ToString());
        File.WriteAllLines(Path.Combine(root,"installer-arguments.txt"),args);
        while(File.ReadAllText(Path.Combine(root,"mode.txt"))=="hold")System.Threading.Thread.Sleep(20);
        if(File.ReadAllText(Path.Combine(root,"mode.txt"))=="fail")return 17;
        if(File.ReadAllText(Path.Combine(root,"mode.txt"))=="no-install")return 0;
        var pending=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(data,"pending-update.json")));
        string payload=Path.Combine(client,"TS6-Enhanced"),dll=Path.Combine(client,"version.dll"),marker=Path.Combine(payload,"marker.txt");
        File.WriteAllText(dll,"new DLL");File.WriteAllText(marker,"new payload");
        File.WriteAllText(Path.Combine(data,"native-install.json"),json.Serialize(new {
            owner="ts6-enhanced-native-v1",version=pending["version"],directory=payload,dll=dll,dllHash=Hash(dll),
            files=new[]{new {path="marker.txt",sha256=Hash(marker)}}
        }));
        return 0;
    }
}
