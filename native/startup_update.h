#pragma once
#include <string>
// Called only before creating the first main browser view, outside DllMain.
// True means a validated worker owns the retry; this startup must exit.
bool RetryStartupUpdate(const std::wstring& directory);
