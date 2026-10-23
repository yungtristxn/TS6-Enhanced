#pragma once
#include <windows.h>
#include <string_view>
#include "include/capi/cef_client_capi.h"
#include "include/capi/cef_request_context_capi.h"
#include "include/capi/views/cef_browser_view_capi.h"

bool IsMainBrowserUrl(std::u16string_view url);

// Called on the browser UI thread before the supported main BrowserView exists.
// Unsupported handler layouts leave the renderer's normal CSS fallback intact.
bool AttachEarlyCss(HMODULE module, cef_client_t* client, cef_request_context_t* context,
    cef_browser_view_delegate_t* delegate);
// Retains the returned main view until its browser-created callback identifies
// the browser. Creation itself precedes the view joining the window hierarchy.
void BindEarlyCssView(cef_browser_view_t* view);
