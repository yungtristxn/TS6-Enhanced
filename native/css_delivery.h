#pragma once
#include <windows.h>
#include "include/capi/cef_client_capi.h"
#include "include/capi/cef_request_context_capi.h"

// Called on the browser UI thread before the supported main BrowserView exists.
// Unsupported handler layouts leave the renderer's normal CSS fallback intact.
void AttachEarlyCss(HMODULE module, cef_client_t* client, cef_request_context_t* context);
