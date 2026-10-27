// Disposable GUI-subsystem client. Its transparent off-screen window never
// activates or appears on the taskbar, but handles the real WM_CLOSE protocol.
using System;using System.IO;using System.Diagnostics;using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
class RestartClientFixture {
 delegate IntPtr WindowProc(IntPtr window,uint message,IntPtr w,IntPtr l);
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct WindowClass {
  public uint style;public WindowProc proc;public int clsExtra,wndExtra;public IntPtr instance,icon,cursor,background;public string menu,name;
 }
 [StructLayout(LayoutKind.Sequential)] struct Message {public IntPtr hwnd;public uint message;public IntPtr w,l;public uint time;public int x,y;public uint privateValue;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern ushort RegisterClass(ref WindowClass value);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateWindowEx(uint ex,string cls,string name,uint style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr value);
 [DllImport("user32.dll")] static extern bool SetLayeredWindowAttributes(IntPtr hwnd,uint key,byte alpha,uint flags);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hwnd,int command);
 [DllImport("user32.dll")] static extern bool DestroyWindow(IntPtr hwnd);
 [DllImport("user32.dll")] static extern void PostQuitMessage(int code);
 [DllImport("user32.dll")] static extern IntPtr DefWindowProc(IntPtr hwnd,uint message,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] static extern IntPtr SetTimer(IntPtr hwnd,IntPtr id,uint milliseconds,IntPtr callback);
 [DllImport("user32.dll")] static extern int GetMessage(out Message message,IntPtr hwnd,uint min,uint max);
 [DllImport("user32.dll")] static extern bool TranslateMessage(ref Message message);
 [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message message);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
 static string root;static int pid;static DateTime deadline;static WindowProc procedure=Handle;
 static string Read(string name){try{return File.ReadAllText(Path.Combine(root,name)).Trim();}catch{return "";}}
 static IntPtr Handle(IntPtr hwnd,uint message,IntPtr w,IntPtr l){
  if(message==0x10){
   File.AppendAllText(Path.Combine(root,"close-requests.txt"),pid+"\n");
   if(Read("client-mode.txt")=="refuse")return IntPtr.Zero;
   if(Read("ignore-exit.txt")=="true"){ShowWindow(hwnd,0);return IntPtr.Zero;}
   DestroyWindow(hwnd);return IntPtr.Zero;
  }
  if(message==0x113&&(File.Exists(Path.Combine(root,"exit-"+pid+".txt"))||DateTime.UtcNow>deadline)){DestroyWindow(hwnd);return IntPtr.Zero;}
  if(message==2){PostQuitMessage(0);return IntPtr.Zero;}
  return DefWindowProc(hwnd,message,w,l);
 }
 [STAThread] static int Main(){
  root=Environment.GetEnvironmentVariable("TSIX_STARTUP_TEST_ROOT");
  if(String.IsNullOrEmpty(root)||!File.Exists(Path.Combine(root,"fixture-only")))return 91;
  string expected=Path.Combine(root,"profile","Programs","TeamSpeak","TeamSpeak.exe");
  if(!String.Equals(Path.GetFullPath(Process.GetCurrentProcess().MainModule.FileName),Path.GetFullPath(expected),StringComparison.OrdinalIgnoreCase))return 92;
  pid=Process.GetCurrentProcess().Id;deadline=DateTime.UtcNow.AddSeconds(90);
  var cls=new WindowClass{proc=procedure,name="TsixRestartFixture"};if(RegisterClass(ref cls)==0)return 93;
  IntPtr window=CreateWindowEx(0x08080080,cls.name,"Isolated restart fixture",0x00CF0000,-30000,-30000,1,1,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero);
  if(window==IntPtr.Zero)return 94;SetLayeredWindowAttributes(window,0,0,2);ShowWindow(window,4);SetTimer(window,new IntPtr(1),50,IntPtr.Zero);
  var record=new {pid=pid,skip=Environment.GetEnvironmentVariable("TSIX_SKIP_STARTUP_RETRY"),token=Environment.GetEnvironmentVariable("TSIX_NATIVE_TOKEN"),endpoint=Environment.GetEnvironmentVariable("TSIX_NATIVE_ENDPOINT"),operation=Environment.GetEnvironmentVariable("TSIX_OPERATION_TOKEN"),stderr=GetStdHandle(-12).ToInt64()};
  File.WriteAllText(Path.Combine(root,"client-"+pid+".json"),new JavaScriptSerializer().Serialize(record));
  if(record.skip=="1")File.AppendAllText(Path.Combine(root,"reopened.txt"),pid+"\n");
  File.WriteAllText(Path.Combine(root,"ready-"+pid+".txt"),window.ToInt64().ToString());
  Message message;while(GetMessage(out message,IntPtr.Zero,0,0)>0){TranslateMessage(ref message);DispatchMessage(ref message);}
  return 0;
 }
}
