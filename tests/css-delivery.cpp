// Exercise the real filter state machine and CEF incoming-reference ownership.
// No TeamSpeak processes or installed files are touched.
#include "../native/css_delivery.cpp"
#include <cassert>
#include <iostream>
#include <vector>

static Digest Hash(const std::string& text) {
    Digest result{};
    assert(BCryptHash(BCRYPT_SHA256_ALG_HANDLE, nullptr, 0,
        reinterpret_cast<PUCHAR>(const_cast<char*>(text.data())), static_cast<ULONG>(text.size()),
        result.data(), static_cast<ULONG>(result.size())) >= 0);
    return result;
}

static std::string FilterBody(const std::string& body, const Digest& expected,
    size_t inputSize, size_t outputSize, size_t limit = maxCssBytes) {
    const std::string suffix = "\n@media all{:root{--test:1}}\n";
    auto filter = new CssFilter(expected, suffix, limit);
    assert(filter->api.init_filter(&filter->api));
    std::vector<char> output(outputSize);
    size_t read = 99, written = 99;
    // A pre-input empty call must neither emit styles nor prevent later input.
    assert(filter->api.filter(&filter->api, nullptr, 0, &read, output.data(), output.size(), &written) == RESPONSE_FILTER_DONE);
    assert(!read && !written);
    size_t offset = 0;
    std::string result;
    while (offset < body.size()) {
        const size_t chunk = std::min(inputSize, body.size() - offset);
        size_t consumed = 0;
        do {
            auto status = filter->api.filter(&filter->api,
                const_cast<char*>(body.data() + offset + consumed), chunk - consumed,
                &read, output.data(), output.size(), &written);
            assert(status != RESPONSE_FILTER_ERROR && read <= chunk - consumed && written <= output.size());
            assert(written || read == chunk - consumed);
            consumed += read; result.append(output.data(), written);
            // Match CEF: after a full output buffer, drain with null input.
            while (consumed == chunk && status == RESPONSE_FILTER_NEED_MORE_DATA && written == output.size()) {
                status = filter->api.filter(&filter->api, nullptr, 0, &read, output.data(), output.size(), &written);
                assert(!read && written <= output.size()); result.append(output.data(), written);
            }
        } while (consumed < chunk);
        offset += chunk;
    }
    // Small, valid responses are held until EOF, so a valid prefix followed by
    // another chunk can never cause early CSS to be appended to a changed body.
    if (body.size() <= limit) assert(result.empty());
    cef_response_filter_status_t status;
    do {
        status = filter->api.filter(&filter->api, nullptr, 0, &read, output.data(), output.size(), &written);
        assert(!read && written <= output.size()); result.append(output.data(), written);
        assert(status == RESPONSE_FILTER_DONE || written == output.size());
    } while (status == RESPONSE_FILTER_NEED_MORE_DATA);
    assert(filter->api.base.has_one_ref(&filter->api.base));
    filter->api.base.add_ref(&filter->api.base);
    assert(!filter->api.base.has_one_ref(&filter->api.base));
    assert(!filter->api.base.release(&filter->api.base));
    assert(filter->api.base.release(&filter->api.base));
    return result;
}

template<class Api> struct Argument {
    Api api{};
    int releases = 0;
    Argument() { api.base.size = sizeof(Api); api.base.release = Release; }
    static int CEF_CALLBACK Release(cef_base_ref_counted_t* base) {
        ++reinterpret_cast<Argument*>(base)->releases; return 0;
    }
};

struct RequestArgument : Argument<cef_request_t> {
    std::u16string url = u"tsui://default/main.css", referrer = u"tsui://default/index.html", method = u"GET";
    cef_resource_type_t type = RT_STYLESHEET;
    static cef_string_userfree_t Text(std::u16string& text) { return new cef_string_t{text.data(), text.size(), nullptr}; }
    RequestArgument() {
        api.get_url = [](cef_request_t* self) { return Text(reinterpret_cast<RequestArgument*>(self)->url); };
        api.get_referrer_url = [](cef_request_t* self) { return Text(reinterpret_cast<RequestArgument*>(self)->referrer); };
        api.get_method = [](cef_request_t* self) { return Text(reinterpret_cast<RequestArgument*>(self)->method); };
        api.get_resource_type = [](cef_request_t* self) { return reinterpret_cast<RequestArgument*>(self)->type; };
    }
};

struct BrowserArgument : Argument<cef_browser_t> {
    int identifier;
    explicit BrowserArgument(int id) : identifier(id) {
        api.get_identifier = [](cef_browser_t* self) { return reinterpret_cast<BrowserArgument*>(self)->identifier; };
    }
};

// Two C wrappers for the same underlying view intentionally have distinct
// addresses. is_same consumes its second argument, exactly as CEF does.
struct ViewArgument {
    cef_browser_view_t api{};
    int identity, references = 1, additions = 0, releases = 0, comparisons = 0;
    explicit ViewArgument(int id) : identity(id) {
        api.base.base.size = sizeof(api);
        api.base.base.add_ref = [](cef_base_ref_counted_t* base) {
            auto self = reinterpret_cast<ViewArgument*>(base);
            assert(self->references > 0); ++self->references; ++self->additions;
        };
        api.base.base.release = [](cef_base_ref_counted_t* base) {
            auto self = reinterpret_cast<ViewArgument*>(base);
            assert(self->references > 0); ++self->releases; return static_cast<int>(--self->references == 0);
        };
        api.base.is_same = [](cef_view_t* self, cef_view_t* that) {
            auto first = reinterpret_cast<ViewArgument*>(self), second = reinterpret_cast<ViewArgument*>(that);
            ++first->comparisons;
            const bool same = first->identity == second->identity;
            that->base.release(&that->base);
            return static_cast<int>(same);
        };
    }
};
static int createdCalls = 0, destroyedCalls = 0;
static void CEF_CALLBACK NativeCreated(cef_browser_view_delegate_t*, cef_browser_view_t* view, cef_browser_t* browser) {
    ++createdCalls;
    view->base.base.release(&view->base.base);
    browser->base.release(&browser->base);
}
static void CEF_CALLBACK NativeDestroyed(cef_browser_view_delegate_t*, cef_browser_view_t* view, cef_browser_t* browser) {
    ++destroyedCalls;
    view->base.base.release(&view->base.base);
    browser->base.release(&browser->base);
}

static void BindMainBrowser() {
    cef_client_t client{};
    client.base.size = sizeof(client);
    client.get_request_handler = [](cef_client_t*) -> cef_request_handler_t* { return nullptr; };
    cef_request_context_t context{};
    context.base.base.size = sizeof(context);
    context.get_handler = [](cef_request_context_t*) -> cef_request_context_handler_t* { return nullptr; };
    cef_browser_view_delegate_t delegate{};
    delegate.base.base.size = sizeof(delegate);
    delegate.on_browser_created = NativeCreated;
    delegate.on_browser_destroyed = NativeDestroyed;
    enhancedCss = ":root{--test:1}";
    delegate.base.base.size -= 8;
    assert(!AttachEarlyCss(nullptr, &client, &context, &delegate));
    delegate.base.base.size = sizeof(delegate);
    assert(AttachEarlyCss(nullptr, &client, &context, &delegate));

    ViewArgument returned(10), sameView(10), popupView(20);
    BrowserArgument mainBrowser(41), popupBrowser(42);
    returned.api.base.base.size -= 8;
    BindEarlyCssView(&returned.api);
    assert(!pendingView && returned.additions == 0);
    returned.api.base.base.size = sizeof(returned.api);
    BindEarlyCssView(&returned.api);
    assert(pendingView == &returned.api && returned.references == 2);
    // Drop the caller's reference. The binding alone keeps this wrapper alive.
    returned.api.base.base.release(&returned.api.base.base);
    delegate.on_browser_created(&delegate, &popupView.api, &popupBrowser.api);
    assert(!mainBrowserId.load() && pendingView == &returned.api);
    assert(popupView.references == 0 && returned.references == 1 && popupBrowser.releases == 1);
    delegate.on_browser_created(&delegate, &sameView.api, &mainBrowser.api);
    assert(mainBrowserId.load() == 41 && !pendingView);
    assert(returned.references == 0 && returned.additions == 3 && returned.releases == 4);
    assert(sameView.references == 0 && mainBrowser.releases == 1 && createdCalls == 2);

    ViewArgument popupClosed(20);
    delegate.on_browser_destroyed(&delegate, &popupClosed.api, &popupBrowser.api);
    assert(mainBrowserId.load() == 41 && popupClosed.references == 0 && destroyedCalls == 1);
}

static cef_resource_request_handler_t existingHandler{};
static bool useExisting = false, changeDecision = false;
static cef_resource_request_handler_t* CEF_CALLBACK NativeResource(cef_request_handler_t*, cef_browser_t* browser,
    cef_frame_t* frame, cef_request_t* request, int, int, const cef_string_t*, int* disable) {
    CssRequestHandler::Consume(browser); CssRequestHandler::Consume(frame); CssRequestHandler::Consume(request);
    if (changeDecision) *disable = !*disable;
    return useExisting ? &existingHandler : nullptr;
}

int main() {
    assert(IsMainBrowserUrl(u"tsui://default/index.html"));
    assert(IsMainBrowserUrl(u"tsui://default/index.html#/loading"));
    for (const auto url : {u"tsui://default/index.html?popup=1", u"tsui://default/index.html?popup=1#/loading",
        u"tsui://default/index.html?anything=1", u"tsui://default/index.htmlx", u"tsui://other/index.html", u"https://default/index.html"})
        assert(!IsMainBrowserUrl(url));
    std::string original(731261, 'a'); original += "\n:root{color:blue}";
    const auto expected = Hash(original);
    const std::string suffix = "\n@media all{:root{--test:1}}\n";
    for (auto [input, output] : {std::pair<size_t,size_t>{1,1}, {4096,64}, {64,4096}, {16384,8192}, {original.size(),original.size()+suffix.size()}}) {
        assert(FilterBody(original, expected, input, output) == original + suffix);
        auto changed = original; changed[17] = 'b';
        assert(FilterBody(changed, expected, input, output) == changed);
        const auto truncated = original.substr(0, original.size() - 3);
        assert(FilterBody(truncated, expected, input, output) == truncated);
    }
    assert(FilterBody(original + "unexpected suffix", expected, original.size(), 64) == original + "unexpected suffix");
    assert(FilterBody(original, expected, 4000, 7, 4096) == original);
    assert(FilterBody(original, expected, original.size(), 4096, 32) == original);
    assert(FilterBody("", expected, 64, 64).empty());

    // A declined response still consumes exactly the incoming CEF references.
    // Null callbacks in this owned handler keep the native scheme factory.
    auto handler = new CssRequestHandler();
    assert(!handler->api.get_resource_handler && !handler->api.on_before_resource_load);
    Argument<cef_browser_t> browser; Argument<cef_frame_t> frame;
    Argument<cef_request_t> request; Argument<cef_response_t> response;
    assert(!handler->api.get_resource_response_filter(&handler->api,
        &browser.api, &frame.api, &request.api, &response.api));
    assert(browser.releases == 1 && frame.releases == 1 && request.releases == 1 && response.releases == 1);
    assert(handler->api.base.release(&handler->api.base));

    freeString = [](cef_string_userfree_t value) { delete value; };
    BindMainBrowser();
    originalResource.store(NativeResource);
    BrowserArgument mainBrowser(41), popupBrowser(42);
    auto select = [&mainBrowser](RequestArgument& argument, int handling = 0, int navigation = 0, int download = 0) {
        const int before = argument.releases;
        const int browserBefore = mainBrowser.releases;
        auto selected = Resource(nullptr, &mainBrowser.api, nullptr, &argument.api, navigation, download, nullptr, &handling);
        assert(mainBrowser.releases == browserBefore + 1);
        assert(argument.releases == before + 1); return selected;
    };
    RequestArgument main;
    for (int initial : {0,1}) {
        auto selected = select(main, initial);
        assert(selected && selected != &existingHandler); selected->base.release(&selected->base);
    }
    useExisting = true; assert(select(main) == &existingHandler); useExisting = false;
    changeDecision = true; assert(!select(main)); changeDecision = false;
    assert(!select(main, 0, 1) && !select(main, 0, 0, 1));
    // The real tsui stylesheet has no referrer. Browser identity carries scope.
    main.api.get_referrer_url = nullptr;
    auto noReferrer = select(main); assert(noReferrer); noReferrer->base.release(&noReferrer->base);
    int handling = 0;
    assert(!Resource(nullptr, &popupBrowser.api, nullptr, &main.api, 0, 0, nullptr, &handling));
    assert(popupBrowser.releases == 1);
    assert(!Resource(nullptr, nullptr, nullptr, &main.api, 0, 0, nullptr, &handling));
    mainBrowser.api.base.size -= 8; assert(!select(main)); mainBrowser.api.base.size = sizeof(cef_browser_t);
    main.url = u"https://example.test/main.css"; assert(!select(main));
    main.url = u"tsui://default/main.css?cache=1";
    auto selected = select(main); assert(selected); selected->base.release(&selected->base);
    main.type = RT_SCRIPT; assert(!select(main)); main.type = RT_STYLESHEET;
    main.method = u"POST"; assert(!select(main)); main.method = u"GET";
    main.api.base.size -= 8; assert(!select(main));
    main.api.base.size = sizeof(cef_request_t);

    // Recheck browser scope at response time, including teardown between the
    // request and response. Every incoming reference is still consumed once.
    auto filtered = new CssRequestHandler();
    Argument<cef_response_t> validResponse;
    validResponse.api.get_status = [](cef_response_t*) { return 200; };
    validResponse.api.get_mime_type = [](cef_response_t*) { return new cef_string_t{const_cast<char16_t*>(u"text/css"), 8, nullptr}; };
    auto responseFilter = filtered->api.get_resource_response_filter(&filtered->api,
        &mainBrowser.api, nullptr, &main.api, &validResponse.api);
    assert(responseFilter); responseFilter->base.release(&responseFilter->base);
    assert(!filtered->api.get_resource_response_filter(&filtered->api,
        &popupBrowser.api, nullptr, &main.api, &validResponse.api));
    assert(validResponse.releases == 2);
    ViewArgument mainClosed(10);
    ViewDestroyed(nullptr, &mainClosed.api, &mainBrowser.api);
    assert(!mainBrowserId.load() && mainClosed.references == 0 && destroyedCalls == 2);
    assert(!select(main));
    assert(!filtered->api.get_resource_response_filter(&filtered->api,
        &mainBrowser.api, nullptr, &main.api, &validResponse.api));
    filtered->api.base.release(&filtered->api.base);

    // An unsupported browser ABI must release a matching pending view without
    // enabling early styles. A view destroyed before binding also releases it.
    ViewArgument unsupportedReturned(30), unsupportedCreated(30);
    BindEarlyCssView(&unsupportedReturned.api);
    mainBrowser.api.base.size -= 8;
    ViewCreated(nullptr, &unsupportedCreated.api, &mainBrowser.api);
    assert(!mainBrowserId.load() && !pendingView && unsupportedReturned.references == 1);
    mainBrowser.api.base.size = sizeof(cef_browser_t);
    ViewArgument pendingReturned(40), pendingClosed(40);
    BindEarlyCssView(&pendingReturned.api);
    ViewDestroyed(nullptr, &pendingClosed.api, &mainBrowser.api);
    assert(!pendingView && pendingReturned.references == 1 && pendingClosed.references == 0);
    std::cout << "PASS: complete-body hash, arbitrary chunks, changed/oversized passthrough, wrapper ownership, main-browser binding without referrer, popup isolation, ABI refusal and teardown.\n";
}
