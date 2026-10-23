#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <string>
#include <vector>
#include "runtime.h"
static wchar_t rendererEndpoint[96]{},rendererToken[65]{};

void SetEnhancedConnection(const char16_t* endpoint,size_t endpointLength,const char16_t* token,size_t tokenLength) {
    if(!endpoint||!token||endpointLength>=96||tokenLength!=64)return;
    wmemcpy(rendererEndpoint,reinterpret_cast<const wchar_t*>(endpoint),endpointLength);rendererEndpoint[endpointLength]=0;
    wmemcpy(rendererToken,reinterpret_cast<const wchar_t*>(token),tokenLength);rendererToken[tokenLength]=0;
}

bool SupportedImage(HMODULE module, DWORD stamp, DWORD size) {
    if (!module) return false;
    auto base = reinterpret_cast<const BYTE*>(module);
    auto dos = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE || dos->e_lfanew <= 0 || dos->e_lfanew > 4096) return false;
    auto nt = reinterpret_cast<const IMAGE_NT_HEADERS64*>(base + dos->e_lfanew);
    return nt->Signature == IMAGE_NT_SIGNATURE && nt->FileHeader.Machine == IMAGE_FILE_MACHINE_AMD64 &&
        nt->FileHeader.TimeDateStamp == stamp && nt->OptionalHeader.SizeOfImage == size;
}

bool StartEnhancedHost(const std::wstring& directory) {
    // The updater inherits the capability; CEF extra_info carries it to the UI.
    // Never reuse a caller's endpoint.
    SetEnvironmentVariableW(L"TSIX_NATIVE_ENDPOINT", nullptr);
    SetEnvironmentVariableW(L"TSIX_NATIVE_TOKEN", nullptr);
    BYTE bytes[32];
    if (BCryptGenRandom(nullptr, bytes, sizeof(bytes), BCRYPT_USE_SYSTEM_PREFERRED_RNG) < 0) return false;
    constexpr wchar_t hex[] = L"0123456789abcdef";
    wchar_t token[65]{};
    for (unsigned i = 0; i < 32; ++i) { token[2*i] = hex[bytes[i] >> 4]; token[2*i+1] = hex[bytes[i] & 15]; }
    if (!SetEnvironmentVariableW(L"TSIX_NATIVE_TOKEN", token)) return false;
    const std::wstring package = directory + L"\\TS6-Enhanced";
    const std::wstring node = package + L"\\runtime\\node.exe";
    std::wstring command = L"\"" + node + L"\" \"" + package + L"\\tools\\native-manager.mjs\"";
    SECURITY_ATTRIBUTES security{sizeof(security), nullptr, TRUE};
    HANDLE inputRead=nullptr, inputWrite=nullptr, outputRead=nullptr, outputWrite=nullptr;
    HANDLE nullFile=INVALID_HANDLE_VALUE;
    PROCESS_INFORMATION process{};
    bool success=false;
    SIZE_T attributeBytes=0;
    InitializeProcThreadAttributeList(nullptr, 1, 0, &attributeBytes);
    std::vector<BYTE> attributes(attributeBytes);
    STARTUPINFOEXW startup{}; startup.StartupInfo.cb=sizeof(startup);
    startup.lpAttributeList=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(attributes.data());
    bool initialized=InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &attributeBytes) != FALSE;
    if (initialized && CreatePipe(&inputRead,&inputWrite,&security,0) && CreatePipe(&outputRead,&outputWrite,&security,0) &&
        SetHandleInformation(inputWrite,HANDLE_FLAG_INHERIT,0) && SetHandleInformation(outputRead,HANDLE_FLAG_INHERIT,0)) {
        nullFile=CreateFileW(L"NUL",GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,&security,OPEN_EXISTING,0,nullptr);
        HANDLE inherited[]{inputRead,outputWrite,nullFile};
        startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput=inputRead;startup.StartupInfo.hStdOutput=outputWrite;startup.StartupInfo.hStdError=nullFile;
        if (nullFile!=INVALID_HANDLE_VALUE && UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,inherited,sizeof(inherited),nullptr,nullptr) &&
            CreateProcessW(node.c_str(),command.data(),nullptr,nullptr,TRUE,CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,nullptr,directory.c_str(),&startup.StartupInfo,&process)) {
            CloseHandle(process.hThread);
            CloseHandle(outputWrite);outputWrite=nullptr;
            // Bounded readiness handshake; a failed updater never prevents native startup.
            std::string line;
            const auto deadline=GetTickCount64()+5000;
            while(GetTickCount64()<deadline && WaitForSingleObject(process.hProcess,0)==WAIT_TIMEOUT) {
                DWORD available=0;
                if(!PeekNamedPipe(outputRead,nullptr,0,nullptr,&available,nullptr))break;
                if(available){char buffer[128];DWORD read=0;if(!ReadFile(outputRead,buffer,min(available,127UL),&read,nullptr))break;line.append(buffer,read);}
                if(line.size()>32)break;
                if(line.find('\n')!=std::string::npos){
                    unsigned port=0;bool valid=true;
                    for(char c:line){if(c=='\n')break;if(c<'0'||c>'9'){valid=false;break;}port=port*10+unsigned(c-'0');if(port>65535){valid=false;break;}}
                    if(valid&&port>=1024){auto endpoint=L"ws://127.0.0.1:"+std::to_wstring(port);success=SetEnvironmentVariableW(L"TSIX_NATIVE_ENDPOINT",endpoint.c_str())!=FALSE;}
                    break;
                }
                Sleep(10);
            }
            CloseHandle(process.hProcess);
        }
    }
    if(initialized)DeleteProcThreadAttributeList(startup.lpAttributeList);
    for(HANDLE handle:{inputRead,outputRead,outputWrite})if(handle)CloseHandle(handle);
    if(nullFile!=INVALID_HANDLE_VALUE)CloseHandle(nullFile);
    if(!success){if(inputWrite)CloseHandle(inputWrite);SetEnvironmentVariableW(L"TSIX_NATIVE_TOKEN",nullptr);}
    // On success the browser owns inputWrite until process exit. It is not
    // inherited by renderers. EOF tells the host that the browser has closed.
    return success;
}

std::u16string EnhancedScript(HMODULE module) {
    auto resource=FindResourceW(module,MAKEINTRESOURCEW(101),RT_RCDATA);
    if(!resource)return {};
    DWORD length=SizeofResource(module,resource);
    auto raw=static_cast<const char*>(LockResource(LoadResource(module,resource)));
    if(!raw||!length||length>2*1024*1024)return {};
    wchar_t endpoint[96]{},token[65]{};
    wcscpy_s(endpoint,rendererEndpoint);wcscpy_s(token,rendererToken);
    size_t e=wcslen(endpoint),t=wcslen(token);
    std::wstring address=endpoint;
    bool valid=e>15&&e<96&&t==64&&address.starts_with(L"ws://127.0.0.1:");
    for(size_t i=15;valid&&i<address.size();++i)valid=address[i]>=L'0'&&address[i]<=L'9';
    for(unsigned i=0;valid&&i<64;++i)valid=(token[i]>=L'0'&&token[i]<=L'9')||(token[i]>=L'a'&&token[i]<=L'f');
    int count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,raw,length,nullptr,0);
    if(count<=0)return {};
    std::u16string result=u"(()=>{const connection=";
    if(valid){result+=u"{endpoint:'";result.append(reinterpret_cast<char16_t*>(endpoint));result+=u"',token:'";result.append(reinterpret_cast<char16_t*>(token));result+=u"'};";}
    else result+=u"null;";
    size_t offset=result.size();result.resize(offset+count);
    MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,raw,length,reinterpret_cast<wchar_t*>(result.data()+offset),count);
    result+=u"})()";
    return result;
}

// These two legacy APIs are not exported by KernelBase on current Windows.
// Resolve the real Windows library by an absolute System32 path, on demand.
static HMODULE SystemVersion() {
    static HMODULE module=[](){wchar_t path[MAX_PATH];UINT n=GetSystemDirectoryW(path,MAX_PATH);if(!n||n>MAX_PATH-14)return HMODULE(nullptr);std::wstring full(path,n);full+=L"\\version.dll";return LoadLibraryExW(full.c_str(),nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);}();
    return module;
}
extern "C" DWORD WINAPI ProxyVerInstallFileW(DWORD a,LPCWSTR b,LPCWSTR c,LPCWSTR d,LPCWSTR e,LPCWSTR f,LPWSTR g,PUINT h) {
    auto fn=reinterpret_cast<decltype(&VerInstallFileW)>(GetProcAddress(SystemVersion(),"VerInstallFileW"));
    if(!fn){SetLastError(ERROR_PROC_NOT_FOUND);return VIF_CANNOTREADSRC;}return fn(a,b,c,d,e,f,g,h);
}
extern "C" DWORD WINAPI ProxyVerInstallFileA(DWORD a,LPCSTR b,LPCSTR c,LPCSTR d,LPCSTR e,LPCSTR f,LPSTR g,PUINT h) {
    auto fn=reinterpret_cast<decltype(&VerInstallFileA)>(GetProcAddress(SystemVersion(),"VerInstallFileA"));
    if(!fn){SetLastError(ERROR_PROC_NOT_FOUND);return VIF_CANNOTREADSRC;}return fn(a,b,c,d,e,f,g,h);
}
