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
static cef_resource_request_handler_t existingHandler{};
static bool useExisting = false, changeDecision = false;
static cef_resource_request_handler_t* CEF_CALLBACK NativeResource(cef_request_handler_t*, cef_browser_t* browser,
    cef_frame_t* frame, cef_request_t* request, int, int, const cef_string_t*, int* disable) {
    CssRequestHandler::Consume(browser); CssRequestHandler::Consume(frame); CssRequestHandler::Consume(request);
    if (changeDecision) *disable = !*disable;
    return useExisting ? &existingHandler : nullptr;
}

int main() {
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
    originalResource.store(NativeResource);
    auto select = [](RequestArgument& argument, int handling = 0, int navigation = 0, int download = 0) {
        const int before = argument.releases;
        auto selected = Resource(nullptr, nullptr, nullptr, &argument.api, navigation, download, nullptr, &handling);
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
    main.referrer += u"?popup=1"; assert(!select(main));
    main.referrer.clear(); assert(!select(main));
    main.referrer = u"tsui://default/index.html";
    main.url = u"https://example.test/main.css"; assert(!select(main));
    main.url = u"tsui://default/main.css?cache=1";
    auto selected = select(main); assert(selected); selected->base.release(&selected->base);
    main.type = RT_SCRIPT; assert(!select(main)); main.type = RT_STYLESHEET;
    main.method = u"POST"; assert(!select(main)); main.method = u"GET";
    main.api.base.size -= 8; assert(!select(main));
    std::cout << "PASS: complete-body hash, arbitrary chunks, empty calls, changed/truncated/extended/oversized passthrough, CEF references, main-document scope and preserved native handlers.\n";
}
