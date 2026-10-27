// Native startup adapter for the supported TeamSpeak build. Vendor files stay
// unchanged; CEF callbacks are chained with their original ownership contract.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stddef.h>
#include <string_view>
#include "include/capi/cef_app_capi.h"
#include "include/capi/views/cef_browser_view_capi.h"
#include "runtime.h"
#include "startup_update.h"
#include "css_delivery.h"
#include "compatibility.h"
static HMODULE ownModule=nullptr;
static wchar_t clientDllPath[1024]{};

using LoadFn=HMODULE(WINAPI*)(LPCWSTR,HANDLE,DWORD);
using ExecuteFn=int(*)(const cef_main_args_t*,cef_app_t*,void*);
using HandlerFn=cef_render_process_handler_t*(CEF_CALLBACK*)(cef_app_t*);
using ContextFn=void(CEF_CALLBACK*)(cef_render_process_handler_t*,cef_browser_t*,cef_frame_t*,cef_v8_context_t*);
using BrowserCreatedFn=void(CEF_CALLBACK*)(cef_render_process_handler_t*,cef_browser_t*,cef_dictionary_value_t*);
using BrowserViewFn=decltype(&cef_browser_view_create);
static LoadFn originalLoad=nullptr;
static ExecuteFn originalExecute=nullptr;
static HandlerFn originalHandler=nullptr;
static ContextFn originalContext=nullptr;
static BrowserCreatedFn originalBrowserCreated=nullptr;
static BrowserViewFn originalBrowserView=nullptr;
static LONG patchedClient=0;
static LONG hostStarted=0;
struct NativeStatus { volatile LONG pid,attached,loadHook,loadCalls,clientSeen,cefHook,executeCalls,appSize,handlerCalls,handlerSize,contextCalls,frameSize,scripts,protectError,contextSize,apiVersion,evalResult,extraInfoSize,connectionReady,browserViews; };
extern "C" __declspec(dllexport) NativeStatus TSIX_NATIVE_STATUS={};

static bool Same(const char* a,const char* b) {
    for(unsigned i=0;i<128;i++){
        char x=a[i],y=b[i];if(x>='A'&&x<='Z')x+='a'-'A';if(y>='A'&&y<='Z')y+='a'-'A';
        if(x!=y)return false;if(!x)return true;
    }return false;
}
static bool SamePath(const wchar_t* a,const wchar_t* b) {
    for(unsigned i=0;i<1024;i++){
        wchar_t x=a[i],y=b[i];if(x>=L'A'&&x<=L'Z')x+=L'a'-L'A';if(y>=L'A'&&y<=L'Z')y+=L'a'-L'A';
        if(x!=y)return false;if(!x)return true;
    }return false;
}
static bool Replace(void** slot,void* replacement,void** original) {
    if(*slot==replacement)return true;
    if(*original&&*original!=*slot)return false;
    DWORD protection;
    if(!VirtualProtect(slot,sizeof(void*),PAGE_READWRITE,&protection)){TSIX_NATIVE_STATUS.protectError=GetLastError();return false;}
    *original=*slot;InterlockedExchangePointer(slot,replacement);
    DWORD ignored;VirtualProtect(slot,sizeof(void*),protection,&ignored);return true;
}
static bool Import(HMODULE image,const char* library,const char* name,void* replacement,void** original) {
    auto base=reinterpret_cast<BYTE*>(image);auto dos=reinterpret_cast<IMAGE_DOS_HEADER*>(base);
    if(dos->e_magic!=IMAGE_DOS_SIGNATURE||dos->e_lfanew<=0||dos->e_lfanew>4096)return false;
    auto nt=reinterpret_cast<IMAGE_NT_HEADERS64*>(base+dos->e_lfanew);
    if(nt->Signature!=IMAGE_NT_SIGNATURE||nt->FileHeader.Machine!=IMAGE_FILE_MACHINE_AMD64)return false;
    DWORD size=nt->OptionalHeader.SizeOfImage;
    auto directory=nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
    if(!directory.VirtualAddress||directory.VirtualAddress+directory.Size>size)return false;
    auto descriptor=reinterpret_cast<IMAGE_IMPORT_DESCRIPTOR*>(base+directory.VirtualAddress);
    for(unsigned i=0;i<directory.Size/sizeof(*descriptor)&&descriptor[i].Name;i++){
        auto& d=descriptor[i];if(d.Name+128>size||!Same(reinterpret_cast<char*>(base+d.Name),library))continue;
        if(!d.OriginalFirstThunk||d.OriginalFirstThunk>=size||d.FirstThunk>=size)return false;
        auto names=reinterpret_cast<IMAGE_THUNK_DATA64*>(base+d.OriginalFirstThunk);
        auto addresses=reinterpret_cast<IMAGE_THUNK_DATA64*>(base+d.FirstThunk);
        for(unsigned j=0;j<4096&&d.OriginalFirstThunk+(j+1)*sizeof(*names)<=size&&d.FirstThunk+(j+1)*sizeof(*addresses)<=size;j++){
            if(!names[j].u1.AddressOfData)break;
            if(IMAGE_SNAP_BY_ORDINAL64(names[j].u1.Ordinal))continue;
            if(names[j].u1.AddressOfData+sizeof(WORD)+128>size)return false;
            auto imported=reinterpret_cast<IMAGE_IMPORT_BY_NAME*>(base+names[j].u1.AddressOfData);
            if(Same(imported->Name,name))return Replace(reinterpret_cast<void**>(&addresses[j].u1.Function),replacement,original);
        }
    }return false;
}

static const char16_t scriptUrl[]=u"ts6-enhanced://native/runtime";
static char16_t endpointKey[]=u"tsix.native.endpoint",tokenKey[]=u"tsix.native.token",resumeKey[]=u"tsix.native.resume";

static cef_dictionary_value_t* ConnectionInfo(cef_dictionary_value_t* original) {
    wchar_t endpoint[96]{},token[65]{};
    DWORD endpointLength=GetEnvironmentVariableW(L"TSIX_NATIVE_ENDPOINT",endpoint,96);
    DWORD tokenLength=GetEnvironmentVariableW(L"TSIX_NATIVE_TOKEN",token,65);
    if(!endpointLength||endpointLength>=96||tokenLength!=64)return original;
    if(original&&original->base.size!=sizeof(cef_dictionary_value_t))return original;
    auto create=reinterpret_cast<decltype(&cef_dictionary_value_create)>(GetProcAddress(GetModuleHandleW(L"libcef.dll"),"cef_dictionary_value_create"));
    if(!create)return original;
    auto copy=original?original->copy(original,0):create();
    if(!copy)return original;
    TSIX_NATIVE_STATUS.extraInfoSize=static_cast<LONG>(copy->base.size);
    cef_string_t endpointName{endpointKey,ARRAYSIZE(endpointKey)-1,nullptr},tokenName{tokenKey,ARRAYSIZE(tokenKey)-1,nullptr};
    cef_string_t endpointValue{reinterpret_cast<char16_t*>(endpoint),endpointLength,nullptr},tokenValue{reinterpret_cast<char16_t*>(token),tokenLength,nullptr};
    wchar_t resume[2]{};GetEnvironmentVariableW(L"TSIX_SESSION_RESUME",resume,2);
    cef_string_t resumeName{resumeKey,ARRAYSIZE(resumeKey)-1,nullptr};
    if(copy->base.size!=sizeof(cef_dictionary_value_t)||!copy->set_string||!copy->set_bool||!copy->set_string(copy,&endpointName,&endpointValue)||!copy->set_string(copy,&tokenName,&tokenValue)||!copy->set_bool(copy,&resumeName,resume[0]==L'1')){
        copy->base.release(&copy->base);return original;
    }
    // The C API takes an incoming reference. Transfer the copied dictionary
    // instead and release the reference that the original callee would consume.
    if(original)original->base.release(&original->base);
    return copy;
}

static cef_browser_view_t* BrowserView(cef_client_t* client,const cef_string_t* url,const cef_browser_settings_t* settings,cef_dictionary_value_t* info,cef_request_context_t* request,cef_browser_view_delegate_t* delegate) {
    InterlockedIncrement(&TSIX_NATIVE_STATUS.browserViews);
    const std::u16string_view target=url&&url->str?std::u16string_view(url->str,url->length):std::u16string_view();
    const bool main=IsMainBrowserUrl(target);
    // Start maintenance only when this process creates the actual main UI.
    // Duplicate launches that redirect to an existing client need no helper.
    if(main&&InterlockedCompareExchange(&hostStarted,1,0)==0){
        try{std::wstring directory(clientDllPath);directory.resize(directory.find_last_of(L"\\"));
            if(RetryStartupUpdate(directory))ExitProcess(0);
            TSIX_NATIVE_STATUS.connectionReady=StartEnhancedHost(directory);}
        catch(...){TSIX_NATIVE_STATUS.protectError=ERROR_NOT_ENOUGH_MEMORY;}
    }
    const bool early=main&&AttachEarlyCss(ownModule,client,request,delegate);
    auto view=originalBrowserView(client,url,settings,main?ConnectionInfo(info):info,request,delegate);
    if(early)BindEarlyCssView(view);
    return view;
}

static void CEF_CALLBACK OnBrowserCreated(cef_render_process_handler_t* self,cef_browser_t* browser,cef_dictionary_value_t* info) {
    TSIX_NATIVE_STATUS.extraInfoSize=info?static_cast<LONG>(info->base.size):0;
    auto freeString=reinterpret_cast<void(*)(cef_string_userfree_t)>(GetProcAddress(GetModuleHandleW(L"libcef.dll"),"cef_string_userfree_utf16_free"));
    if(info&&info->base.size==sizeof(cef_dictionary_value_t)&&info->get_string&&freeString){
        cef_string_t endpointName{endpointKey,ARRAYSIZE(endpointKey)-1,nullptr},tokenName{tokenKey,ARRAYSIZE(tokenKey)-1,nullptr};
        auto endpoint=info->get_string(info,&endpointName);auto token=info->get_string(info,&tokenName);
        cef_string_t resumeName{resumeKey,ARRAYSIZE(resumeKey)-1,nullptr};
        if(endpoint&&token){SetEnhancedConnection(endpoint->str,endpoint->length,token->str,token->length,info->get_bool&&info->get_bool(info,&resumeName));TSIX_NATIVE_STATUS.connectionReady=token->length==64;}
        if(endpoint)freeString(endpoint);if(token)freeString(token);
    }
    // Inspect before forwarding: the native callback consumes its arguments.
    if(originalBrowserCreated)originalBrowserCreated(self,browser,info);
}

static void EvaluateEnhanced(cef_v8_context_t* context) {
    TSIX_NATIVE_STATUS.evalResult=-2;
    if(!context->is_valid||!context->is_valid(context)||!context->enter||!context->exit||!context->eval)return;
    auto script=EnhancedScript(ownModule);if(script.empty())return;
    cef_string_t code{script.data(),script.size(),nullptr};
    cef_string_t url{const_cast<char16_t*>(scriptUrl),ARRAYSIZE(scriptUrl)-1,nullptr};
    if(!context->enter(context))return;
    cef_v8_value_t* value=nullptr;cef_v8_exception_t* exception=nullptr;
    int result=context->eval(context,&code,&url,1,&value,&exception);
    TSIX_NATIVE_STATUS.evalResult=result;
    if(value&&value->base.release)value->base.release(&value->base);
    if(exception&&exception->base.release)exception->base.release(&exception->base);
    context->exit(context);
    if(result)InterlockedIncrement(&TSIX_NATIVE_STATUS.scripts);
}
static void CEF_CALLBACK OnContext(cef_render_process_handler_t* self,cef_browser_t* browser,cef_frame_t* frame,cef_v8_context_t* context) {
    InterlockedIncrement(&TSIX_NATIVE_STATUS.contextCalls);TSIX_NATIVE_STATUS.frameSize=frame?static_cast<LONG>(frame->base.size):0;
    TSIX_NATIVE_STATUS.contextSize=context?static_cast<LONG>(context->base.size):0;
    // The original CToCpp callback consumes the incoming context reference.
    // Retain our own reference before forwarding, and release it after use.
    // See CefCToCppRefCounted::Wrap in the matching SDK wrapper source.
    bool retained=context&&context->base.size==sizeof(cef_v8_context_t)&&context->base.add_ref&&context->base.release;
    if(retained){context->base.add_ref(&context->base);TSIX_NATIVE_STATUS.evalResult=-1;}
    if(originalContext)originalContext(self,browser,frame,context);
    if(retained){try{EvaluateEnhanced(context);}catch(...){TSIX_NATIVE_STATUS.evalResult=-3;}context->base.release(&context->base);}
}
static cef_render_process_handler_t* CEF_CALLBACK GetHandler(cef_app_t* self) {
    InterlockedIncrement(&TSIX_NATIVE_STATUS.handlerCalls);
    auto handler=originalHandler?originalHandler(self):nullptr;
    TSIX_NATIVE_STATUS.handlerSize=handler?static_cast<LONG>(handler->base.size):0;
    if(handler&&handler->base.size==sizeof(cef_render_process_handler_t)&&handler->on_context_created){
        if(handler->on_browser_created)Replace(reinterpret_cast<void**>(&handler->on_browser_created),reinterpret_cast<void*>(&OnBrowserCreated),reinterpret_cast<void**>(&originalBrowserCreated));
        Replace(reinterpret_cast<void**>(&handler->on_context_created),reinterpret_cast<void*>(&OnContext),reinterpret_cast<void**>(&originalContext));
    }return handler;
}
static int Execute(const cef_main_args_t* args,cef_app_t* app,void* sandbox) {
    InterlockedIncrement(&TSIX_NATIVE_STATUS.executeCalls);TSIX_NATIVE_STATUS.appSize=app?static_cast<LONG>(app->base.size):0;
    auto apiVersion=reinterpret_cast<int(*)()>(GetProcAddress(GetModuleHandleW(L"libcef.dll"),"cef_api_version"));
    if(apiVersion)TSIX_NATIVE_STATUS.apiVersion=apiVersion();
    if(app&&app->base.size==sizeof(cef_app_t)&&app->get_render_process_handler){
        Replace(reinterpret_cast<void**>(&app->get_render_process_handler),reinterpret_cast<void*>(&GetHandler),reinterpret_cast<void**>(&originalHandler));
    }
    return originalExecute(args,app,sandbox);
}
static HMODULE WINAPI Load(LPCWSTR path,HANDLE file,DWORD flags) {
    InterlockedIncrement(&TSIX_NATIVE_STATUS.loadCalls);
    HMODULE module=originalLoad(path,file,flags);DWORD error=GetLastError();
    if(module&&!(flags&DONT_RESOLVE_DLL_REFERENCES)){
        wchar_t actual[1024];DWORD length=GetModuleFileNameW(module,actual,ARRAYSIZE(actual));
        if(length&&length<ARRAYSIZE(actual)&&SamePath(actual,clientDllPath)&&InterlockedCompareExchange(&patchedClient,1,0)==0){
            TSIX_NATIVE_STATUS.clientSeen=1;
            HMODULE cef=GetModuleHandleW(L"libcef.dll");
            auto version=reinterpret_cast<int(*)(int)>(GetProcAddress(cef,"cef_version_info"));
            if(SupportedImage(module,TSIX_CLIENT_STAMP,TSIX_CLIENT_SIZE)&&SupportedImage(cef,TSIX_CEF_STAMP,TSIX_CEF_SIZE)&&version&&version(0)==151&&Import(module,"libcef.dll","cef_execute_process",reinterpret_cast<void*>(&Execute),reinterpret_cast<void**>(&originalExecute))){
                TSIX_NATIVE_STATUS.cefHook=1;
                Import(module,"libcef.dll","cef_browser_view_create",reinterpret_cast<void*>(&BrowserView),reinterpret_cast<void**>(&originalBrowserView));
            }
        }
    }SetLastError(error);return module;
}
BOOL WINAPI DllMain(HINSTANCE instance,DWORD reason,LPVOID) {
    if(reason==DLL_PROCESS_ATTACH){
        TSIX_NATIVE_STATUS.pid=GetCurrentProcessId();TSIX_NATIVE_STATUS.attached=1;
        ownModule=instance;
        wchar_t executable[1024]{};DWORD length=GetModuleFileNameW(nullptr,executable,ARRAYSIZE(executable));
        wchar_t dll[1024]{};DWORD dllLength=GetModuleFileNameW(instance,dll,ARRAYSIZE(dll));
        auto slash=wcsrchr(executable,L'\\');auto dllSlash=wcsrchr(dll,L'\\');
        if(length&&length<ARRAYSIZE(executable)&&dllLength&&dllLength<ARRAYSIZE(dll)&&slash&&dllSlash&&SamePath(slash+1,L"TeamSpeak.exe")&&SupportedImage(GetModuleHandleW(nullptr),TSIX_EXE_STAMP,TSIX_EXE_SIZE)){
            *slash=0;*dllSlash=0;
            if(SamePath(executable,dll)){
                wcscpy_s(clientDllPath,executable);wcscat_s(clientDllPath,L"\\TeamSpeak.dll");
                wchar_t disabled[1024];wcscpy_s(disabled,executable);wcscat_s(disabled,L"\\TS6-Enhanced.disabled");
                if(GetFileAttributesW(disabled)==INVALID_FILE_ATTRIBUTES)
                    TSIX_NATIVE_STATUS.loadHook=Import(GetModuleHandleW(nullptr),"KERNEL32.dll","LoadLibraryExW",reinterpret_cast<void*>(&Load),reinterpret_cast<void**>(&originalLoad));
            }
        }
    }return TRUE;
}
