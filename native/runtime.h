#pragma once
#include <windows.h>
#include <string>

// Called only after the native loader has returned, never from DllMain.
bool StartEnhancedHost(const std::wstring& directory);
std::u16string EnhancedScript(HMODULE module);
void SetEnhancedConnection(const char16_t* endpoint, size_t endpointLength, const char16_t* token, size_t tokenLength, bool resumeSession);
// An x64 PE image that is mapped in this process.
bool NativeImage(HMODULE module);
// The exact image (link timestamp and image size) a release was verified with.
bool SupportedImage(HMODULE module, DWORD stamp, DWORD size);
// Recorded per process when the client DLL loads; read by EnhancedScript.
void SetClientVerified(bool verified);
