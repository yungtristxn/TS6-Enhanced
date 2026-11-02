// Harmless stand-in for TeamSpeak. Calls the production startup gate, then
// records the arguments of the launch that would have opened the main UI.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <fstream>
#include <filesystem>
#include <string>
#include "../native/startup_update.h"
static std::string Utf8(const std::wstring& value){
    const int size=WideCharToMultiByte(CP_UTF8,0,value.data(),static_cast<int>(value.size()),nullptr,0,nullptr,nullptr);
    std::string result(size,'\0');WideCharToMultiByte(CP_UTF8,0,value.data(),static_cast<int>(value.size()),result.data(),size,nullptr,nullptr);return result;
}
int wmain(int count,wchar_t** args){
    wchar_t path[32768]{};GetModuleFileNameW(nullptr,path,ARRAYSIZE(path));
    const auto directory=std::filesystem::path(path).parent_path();
    if(RetryStartupUpdate(directory.wstring())){
        // "hang": agreed to exit for the update but never finishes exiting.
        wchar_t root[32768]{};GetEnvironmentVariableW(L"TSIX_STARTUP_TEST_ROOT",root,ARRAYSIZE(root));
        std::ifstream mode(std::filesystem::path(root)/L"client-mode.txt");std::string value;std::getline(mode,value);
        if(value=="hang")Sleep(INFINITE);
        return 0;
    }
    wchar_t record[32768]{};GetEnvironmentVariableW(L"TSIX_STARTUP_TEST_RECORD",record,ARRAYSIZE(record));
    if(!record[0])return 3;
    std::ofstream output(std::filesystem::path(record),std::ios::app);
    output<<"opened\n";
    for(int i=1;i<count;++i)output<<Utf8(args[i])<<'\n';
    wchar_t skip[8]{};GetEnvironmentVariableW(L"TSIX_SKIP_STARTUP_RETRY",skip,ARRAYSIZE(skip));
    output<<"skip="<<Utf8(skip)<<"\n";
    return output.good()?0:4;
}
