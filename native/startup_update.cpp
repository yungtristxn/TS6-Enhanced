#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <wincrypt.h>
#include <string>
#include <vector>
#include "startup_update.h"

static std::wstring QuoteArgument(const std::wstring& value) {
    std::wstring result=L"\"";size_t slashes=0;
    for(wchar_t c:value){
        if(c==L'\\'){++slashes;continue;}
        result.append(c==L'"'?slashes*2+1:slashes,L'\\');slashes=0;result+=c;
    }
    result.append(slashes*2,L'\\');return result+L"\"";
}
static std::wstring EncodedArguments() {
    int count=0;auto args=CommandLineToArgvW(GetCommandLineW(),&count);
    if(!args)return {};
    std::wstring value;
    for(int i=1;i<count;++i){if(i>1)value+=L' ';value+=QuoteArgument(args[i]);}
    LocalFree(args);
    // Encode argument data, not executable code. No URI or credentials enter logs.
    DWORD length=0,bytes=static_cast<DWORD>(value.size()*sizeof(wchar_t));
    if(!bytes)return L"none";
    constexpr DWORD format=CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF;
    if(!CryptBinaryToStringW(reinterpret_cast<const BYTE*>(value.data()),bytes,format,nullptr,&length))return {};
    std::wstring encoded(length,L'\0');
    if(!CryptBinaryToStringW(reinterpret_cast<const BYTE*>(value.data()),bytes,format,encoded.data(),&length))return {};
    encoded.resize(length);return encoded;
}
bool RetryStartupUpdate(const std::wstring& directory) {
    wchar_t skip[8]{};
    const DWORD skipped=GetEnvironmentVariableW(L"TSIX_SKIP_STARTUP_RETRY",skip,ARRAYSIZE(skip));
    SetEnvironmentVariableW(L"TSIX_SKIP_STARTUP_RETRY",nullptr);
    if(skipped==1&&skip[0]==L'1')return false;
    wchar_t local[32768]{},system[32768]{};
    DWORD length=GetEnvironmentVariableW(L"LOCALAPPDATA",local,ARRAYSIZE(local));
    if(!length||length>=ARRAYSIZE(local)||!GetSystemDirectoryW(system,ARRAYSIZE(system)))return false;
    const std::wstring root=std::wstring(local)+L"\\TS6-Layout";
    if(GetFileAttributesW((root+L"\\pending-update.json").c_str())==INVALID_FILE_ATTRIBUTES)return false;
    std::wstring script=root+L"\\app\\scripts\\Startup-Update.ps1";
    if(GetFileAttributesW(script.c_str())==INVALID_FILE_ATTRIBUTES)script=directory+L"\\TS6-Enhanced\\scripts\\Startup-Update.ps1";
    if(GetFileAttributesW(script.c_str())==INVALID_FILE_ATTRIBUTES)return false;
    const std::wstring args=EncodedArguments();if(args.empty())return false;
    FILETIME created{},exited{},kernel{},user{};
    if(!GetProcessTimes(GetCurrentProcess(),&created,&exited,&kernel,&user))return false;
    const auto birth=(static_cast<unsigned long long>(created.dwHighDateTime)<<32)|created.dwLowDateTime;
    SECURITY_ATTRIBUTES security{sizeof(security),nullptr,TRUE};
    HANDLE read=nullptr,write=nullptr,accept=CreateEventW(&security,TRUE,FALSE,nullptr);
    HANDLE nullFile=CreateFileW(L"NUL",GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,&security,OPEN_EXISTING,0,nullptr);
    bool retry=false;
    SIZE_T size=0;InitializeProcThreadAttributeList(nullptr,1,0,&size);
    std::vector<BYTE> memory(size);
    STARTUPINFOEXW startup{};startup.StartupInfo.cb=sizeof(startup);
    startup.lpAttributeList=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(memory.data());
    const bool initialized=InitializeProcThreadAttributeList(startup.lpAttributeList,1,0,&size)!=FALSE;
    if(initialized&&accept&&nullFile!=INVALID_HANDLE_VALUE&&CreatePipe(&read,&write,&security,0)&&SetHandleInformation(read,HANDLE_FLAG_INHERIT,0)){
        HANDLE inherited[]{write,accept,nullFile};
        startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput=nullFile;startup.StartupInfo.hStdOutput=write;startup.StartupInfo.hStdError=nullFile;
        const std::wstring powershell=std::wstring(system)+L"\\WindowsPowerShell\\v1.0\\powershell.exe";
        std::wstring command=QuoteArgument(powershell)+L" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "+QuoteArgument(script)+
            L" -StartupProcessId "+std::to_wstring(GetCurrentProcessId())+L" -StartupCreationTime "+std::to_wstring(birth)+
            L" -AcceptHandle "+std::to_wstring(reinterpret_cast<ULONG_PTR>(accept))+L" -ArgumentsBase64 "+args;
        PROCESS_INFORMATION process{};
        if(UpdateProcThreadAttribute(startup.lpAttributeList,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,inherited,sizeof(inherited),nullptr,nullptr)&&
           CreateProcessW(powershell.c_str(),command.data(),nullptr,nullptr,TRUE,CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT,nullptr,root.c_str(),&startup.StartupInfo,&process)){
            CloseHandle(process.hThread);CloseHandle(write);write=nullptr;
            std::string line;const auto deadline=GetTickCount64()+15000;
            while(GetTickCount64()<deadline&&WaitForSingleObject(process.hProcess,0)==WAIT_TIMEOUT){
                DWORD available=0;if(!PeekNamedPipe(read,nullptr,0,nullptr,&available,nullptr))break;
                if(available){char buffer[64];DWORD n=0;if(!ReadFile(read,buffer,min(available,63UL),&n,nullptr))break;line.append(buffer,n);}
                if(line.find('\n')!=std::string::npos||line.size()>64)break;
                Sleep(10);
            }
            // The worker has validated the queue and acquired the lifecycle lease.
            // It must receive this acknowledgement before it can install anything.
            if(line=="retry\r\n"||line=="retry\n")retry=SetEvent(accept)!=FALSE;
            CloseHandle(process.hProcess);
        }
    }
    if(initialized)DeleteProcThreadAttributeList(startup.lpAttributeList);
    for(HANDLE handle:{read,write,accept})if(handle)CloseHandle(handle);
    if(nullFile!=INVALID_HANDLE_VALUE)CloseHandle(nullFile);
    return retry;
}
