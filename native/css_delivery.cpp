#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <bcrypt.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <cstring>
#include <new>
#include <string>
#include <string_view>
#include "css_delivery.h"
#include "include/capi/cef_request_context_handler_capi.h"
#include "compatibility.h"

namespace {
constexpr size_t maxCssBytes = 2 * 1024 * 1024;
using Digest = std::array<BYTE, 32>;
using ClientFactory = decltype(cef_client_t::get_request_handler);
using ResourceFactory = decltype(cef_request_handler_t::get_resource_request_handler);
using FreeString = void(*)(cef_string_userfree_t);
std::atomic<ClientFactory> originalFactory{nullptr};
std::atomic<ResourceFactory> originalResource{nullptr};
FreeString freeString = nullptr;
std::string enhancedCss;
SRWLOCK patchLock = SRWLOCK_INIT;

template<class Fn> bool Patch(Fn* slot, Fn replacement, std::atomic<Fn>& original) {
    AcquireSRWLockExclusive(&patchLock);
    bool ok = *slot == replacement;
    const auto saved = original.load(std::memory_order_acquire);
    if (!ok && *slot && (!saved || saved == *slot)) {
        DWORD protection;
        if (VirtualProtect(slot, sizeof(void*), PAGE_READWRITE, &protection)) {
            if (!saved) original.store(*slot, std::memory_order_release);
            InterlockedExchangePointer(reinterpret_cast<void**>(slot), reinterpret_cast<void*>(replacement));
            DWORD ignored;
            VirtualProtect(slot, sizeof(void*), protection, &ignored);
            ok = true;
        }
    }
    ReleaseSRWLockExclusive(&patchLock);
    return ok;
}

bool SameString(cef_string_userfree_t value, std::u16string_view expected, bool stripQuery = false) {
    if (!value) return false;
    std::u16string_view text(value->str ? value->str : u"", value->str ? value->length : 0);
    if (stripQuery) text = text.substr(0, text.find_first_of(u"?#"));
    const bool matches = text == expected;
    freeString(value);
    return matches;
}

bool MainCss(cef_request_t* request) {
    return request && request->base.size == sizeof(cef_request_t) &&
        request->get_resource_type && request->get_resource_type(request) == RT_STYLESHEET &&
        request->get_method && SameString(request->get_method(request), u"GET") &&
        // The client/request-handler can be shared with popup views. Require
        // the full main-document referrer; no referrer means JS fallback.
        request->get_referrer_url && SameString(request->get_referrer_url(request), u"tsui://default/index.html") &&
        request->get_url && SameString(request->get_url(request), u"tsui://default/main.css", true);
}

bool CssResponse(cef_response_t* response) {
    return response && response->base.size == sizeof(cef_response_t) &&
        response->get_status && response->get_status(response) == 200 &&
        response->get_mime_type && SameString(response->get_mime_type(response), u"text/css");
}

bool MatchesHash(std::string_view data, const Digest& expected) {
    Digest actual{};
    return BCryptHash(BCRYPT_SHA256_ALG_HANDLE, nullptr, 0,
        reinterpret_cast<PUCHAR>(const_cast<char*>(data.data())), static_cast<ULONG>(data.size()),
        actual.data(), static_cast<ULONG>(actual.size())) >= 0 && actual == expected;
}

// Buffer only this one small, pinned resource. No output is produced while input
// is arriving, so CEF cannot make an intermediate empty-input output-drain call.
// Its terminal Drain() supplies the empty call after the entire body is read.
// See CEF net_service/response_filter_wrapper.cc (Filter and Drain). This is
// essential: matching a prefix or an expected length does not validate a body.
struct CssFilter {
    cef_response_filter_t api{};
    volatile LONG references = 1;
    Digest expected;
    std::string_view suffix;
    size_t limit, originalOffset = 0, suffixOffset = 0;
    std::string original;
    bool passthrough = false, finished = false, append = false;

    CssFilter(const Digest& hash, std::string_view css, size_t bound = maxCssBytes)
        : expected(hash), suffix(css), limit(bound) {
        api.base.size = sizeof(api);
        api.base.add_ref = AddRef; api.base.release = Release;
        api.base.has_one_ref = HasOne; api.base.has_at_least_one_ref = HasAny;
        api.init_filter = Init; api.filter = Filter;
    }
    static CssFilter* Self(cef_base_ref_counted_t* base) { return reinterpret_cast<CssFilter*>(base); }
    static void CEF_CALLBACK AddRef(cef_base_ref_counted_t* base) { InterlockedIncrement(&Self(base)->references); }
    static int CEF_CALLBACK Release(cef_base_ref_counted_t* base) {
        auto self = Self(base);
        if (InterlockedDecrement(&self->references)) return 0;
        delete self; return 1;
    }
    static int CEF_CALLBACK HasOne(cef_base_ref_counted_t* base) { return InterlockedCompareExchange(&Self(base)->references, 0, 0) == 1; }
    static int CEF_CALLBACK HasAny(cef_base_ref_counted_t* base) { return InterlockedCompareExchange(&Self(base)->references, 0, 0) > 0; }
    static int CEF_CALLBACK Init(cef_response_filter_t* api) {
        auto self = reinterpret_cast<CssFilter*>(api);
        try { self->original.reserve(self->limit); return !self->suffix.empty(); }
        catch (...) { return 0; } // CEF keeps the unfiltered stream on init failure.
    }
    size_t WriteOriginal(char* output, size_t capacity) {
        const size_t count = std::min(original.size() - originalOffset, capacity);
        if (count) memcpy(output, original.data() + originalOffset, count);
        originalOffset += count;
        return count;
    }
    static cef_response_filter_status_t CEF_CALLBACK Filter(cef_response_filter_t* api,
        void* input, size_t size, size_t* read, void* output, size_t capacity, size_t* written) {
        auto self = reinterpret_cast<CssFilter*>(api);
        *read = 0; *written = 0;
        auto out = static_cast<char*>(output);
        if (!self->finished && !self->passthrough && size) {
            if (size <= self->limit - self->original.size()) {
                self->original.append(static_cast<char*>(input), size);
                *read = size;
                return RESPONSE_FILTER_NEED_MORE_DATA;
            }
            // A changed/oversized response stays byte-for-byte original, with
            // bounded storage, instead of truncating it or breaking native CSS.
            self->passthrough = true;
        }
        if (self->passthrough) {
            *written = self->WriteOriginal(out, capacity);
            const size_t count = std::min(size, capacity - *written);
            if (count) memcpy(out + *written, input, count);
            *read = count; *written += count;
            return self->originalOffset < self->original.size() || count < size ?
                RESPONSE_FILTER_NEED_MORE_DATA : RESPONSE_FILTER_DONE;
        }
        if (!self->finished) {
            // An empty response (or pre-input call) emits nothing. Do not seal
            // the filter: a later first input chunk may still arrive.
            if (self->original.empty()) return RESPONSE_FILTER_DONE;
            self->finished = true;
            self->append = MatchesHash(self->original, self->expected);
        }
        *written = self->WriteOriginal(out, capacity);
        if (self->append && self->originalOffset == self->original.size()) {
            const size_t count = std::min(self->suffix.size() - self->suffixOffset, capacity - *written);
            if (count) memcpy(out + *written, self->suffix.data() + self->suffixOffset, count);
            self->suffixOffset += count; *written += count;
        }
        return self->originalOffset < self->original.size() ||
            (self->append && self->suffixOffset < self->suffix.size()) ? RESPONSE_FILTER_NEED_MORE_DATA : RESPONSE_FILTER_DONE;
    }
};

// Only a response filter: null resource callbacks preserve CEF's registered
// tsui scheme factory and its normal request, cookie and resource handling.
struct CssRequestHandler {
    cef_resource_request_handler_t api{};
    volatile LONG references = 1;
    CssRequestHandler() {
        api.base.size = sizeof(api);
        api.base.add_ref = AddRef; api.base.release = Release;
        api.base.has_one_ref = HasOne; api.base.has_at_least_one_ref = HasAny;
        api.get_resource_response_filter = Filter;
    }
    static CssRequestHandler* Self(cef_base_ref_counted_t* base) { return reinterpret_cast<CssRequestHandler*>(base); }
    static void CEF_CALLBACK AddRef(cef_base_ref_counted_t* base) { InterlockedIncrement(&Self(base)->references); }
    static int CEF_CALLBACK Release(cef_base_ref_counted_t* base) {
        auto self = Self(base);
        if (InterlockedDecrement(&self->references)) return 0;
        delete self; return 1;
    }
    static int CEF_CALLBACK HasOne(cef_base_ref_counted_t* base) { return InterlockedCompareExchange(&Self(base)->references, 0, 0) == 1; }
    static int CEF_CALLBACK HasAny(cef_base_ref_counted_t* base) { return InterlockedCompareExchange(&Self(base)->references, 0, 0) > 0; }
    template<class T> static void Consume(T* value) { if (value) value->base.release(&value->base); }
    static cef_response_filter_t* CEF_CALLBACK Filter(cef_resource_request_handler_t*,
        cef_browser_t* browser, cef_frame_t* frame, cef_request_t* request, cef_response_t* response) {
        const bool target = MainCss(request) && CssResponse(response);
        // Incoming CEF references would normally be consumed by CToCpp::Wrap.
        // This directly implemented C callback takes that ownership instead.
        Consume(browser); Consume(frame); Consume(request); Consume(response);
        if (!target) return nullptr;
        auto filter = new(std::nothrow) CssFilter(TSIX_CSS_HASH, enhancedCss);
        return filter ? &filter->api : nullptr;
    }
};

cef_resource_request_handler_t* CEF_CALLBACK Resource(cef_request_handler_t* self,
    cef_browser_t* browser, cef_frame_t* frame, cef_request_t* request,
    int navigation, int download, const cef_string_t* initiator, int* disable) {
    // Inspect before forwarding; the native callback consumes its arguments.
    const bool target = !navigation && !download && MainCss(request);
    const int handling = disable ? *disable : 0;
    auto handler = originalResource.load(std::memory_order_acquire)(self, browser, frame, request, navigation, download, initiator, disable);
    // Custom schemes may initialize disable_default_handling=true even though
    // the registered scheme factory serves them. Preserve that value, and
    // decline if the native handler explicitly changed the handling decision.
    if (handler || !target || !disable || *disable != handling) return handler;
    auto owned = new(std::nothrow) CssRequestHandler();
    return owned ? &owned->api : nullptr;
}

cef_request_handler_t* CEF_CALLBACK GetRequest(cef_client_t* self) {
    auto handler = originalFactory.load(std::memory_order_acquire)(self);
    if (handler && handler->base.size == sizeof(cef_request_handler_t) && handler->get_resource_request_handler)
        Patch(&handler->get_resource_request_handler, &Resource, originalResource);
    return handler;
}
} // namespace

void AttachEarlyCss(HMODULE module, cef_client_t* client, cef_request_context_t* context) {
    // Do not override a request-context handler or a different ABI. The supported
    // client has no context handler; other layouts retain JS-delivered styling.
    if (!client || client->base.size != sizeof(cef_client_t) || !client->get_request_handler ||
        !context || context->base.base.size != sizeof(cef_request_context_t) || !context->get_handler) return;
    auto contextHandler = context->get_handler(context);
    if (contextHandler) { contextHandler->base.release(&contextHandler->base); return; }
    if (!freeString) freeString = reinterpret_cast<FreeString>(GetProcAddress(GetModuleHandleW(L"libcef.dll"), "cef_string_userfree_utf16_free"));
    if (!freeString) return;
    try {
        // Immutable after the first main BrowserView; resource/filter callbacks
        // run on CEF's IO thread and never mutate this shared string.
        if (enhancedCss.empty()) {
            auto resource = FindResourceW(module, MAKEINTRESOURCEW(102), RT_RCDATA);
            if (!resource) return;
            const DWORD size = SizeofResource(module, resource);
            auto raw = static_cast<const char*>(LockResource(LoadResource(module, resource)));
            if (!raw || !size || size > maxCssBytes) return;
            std::string complete = "\n@media all {\n:root{--tsix-css-delivery:resource-v1}\n";
            complete.append(raw, size);
            complete += "\n}\n";
            enhancedCss = std::move(complete);
        }
        Patch(&client->get_request_handler, &GetRequest, originalFactory);
    } catch (...) { /* Styling is optional; native startup must remain usable. */ }
}
