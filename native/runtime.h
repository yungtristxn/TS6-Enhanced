#pragma once
#include <windows.h>
#include <string>

// Called only after the native loader has returned, never from DllMain.
bool StartEnhancedHost(const std::wstring& directory);
std::u16string EnhancedScript(HMODULE module);
void SetEnhancedConnection(const char16_t* endpoint, size_t endpointLength, const char16_t* token, size_t tokenLength);
bool SupportedImage(HMODULE module, DWORD stamp, DWORD size);
