#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <dwmapi.h>
#include <wrl.h>
#include <WebView2.h>
#include <jni.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cctype>
#include <cstdint>
#include <cstdio>
#include <cwctype>
#include <deque>
#include <functional>
#include <memory>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

extern "C" {
typedef struct mpv_handle mpv_handle;

typedef enum mpv_format {
    MPV_FORMAT_NONE = 0,
    MPV_FORMAT_STRING = 1,
    MPV_FORMAT_OSD_STRING = 2,
    MPV_FORMAT_FLAG = 3,
    MPV_FORMAT_INT64 = 4,
    MPV_FORMAT_DOUBLE = 5,
} mpv_format;

typedef enum mpv_event_id {
    MPV_EVENT_NONE = 0,
    MPV_EVENT_SHUTDOWN = 1,
} mpv_event_id;

typedef struct mpv_event {
    mpv_event_id event_id;
    int error;
    uint64_t reply_userdata;
    void *data;
} mpv_event;
}

namespace {

HMODULE gModule = nullptr;
constexpr UINT WM_NUVIO_TASK = WM_APP + 0x4E50;
constexpr UINT_PTR NUVIO_TIMER_ID = 0x4E50;
const wchar_t *kMessageWindowClass = L"NuvioPlayerBridgeMessageWindow";
const wchar_t *kContainerWindowClass = L"NuvioPlayerBridgeContainerWindow";
constexpr DWORD kDwmwaUseImmersiveDarkMode = 20;
constexpr DWORD kDwmwaUseImmersiveDarkModeLegacy = 19;
constexpr DWORD kDwmwaBorderColor = 34;
constexpr DWORD kDwmwaCaptionColor = 35;
constexpr DWORD kDwmwaTextColor = 36;

std::wstring toWide(const std::string &value) {
    if (value.empty()) return std::wstring();
    int size = MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0);
    if (size <= 0) return std::wstring();
    std::wstring result((size_t)size, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.data(), (int)value.size(), result.data(), size);
    return result;
}

std::string toUtf8(const std::wstring &value) {
    if (value.empty()) return std::string();
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0, nullptr, nullptr);
    if (size <= 0) return std::string();
    std::string result((size_t)size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), result.data(), size, nullptr, nullptr);
    return result;
}

std::string jstringToUtf8(JNIEnv *env, jstring value) {
    if (!value) return std::string();
    jsize length = env->GetStringLength(value);
    const jchar *chars = env->GetStringChars(value, nullptr);
    if (!chars) return std::string();
    std::wstring wide(reinterpret_cast<const wchar_t *>(chars), (size_t)length);
    env->ReleaseStringChars(value, chars);
    return toUtf8(wide);
}

jstring newJavaStringUtf8(JNIEnv *env, const std::string &value) {
    std::wstring wide = toWide(value);
    return env->NewString(reinterpret_cast<const jchar *>(wide.data()), (jsize)wide.size());
}

std::vector<std::string> jstringArrayToVector(JNIEnv *env, jobjectArray values) {
    std::vector<std::string> result;
    if (!values) return result;
    jsize count = env->GetArrayLength(values);
    result.reserve((size_t)count);
    for (jsize index = 0; index < count; index++) {
        jstring item = (jstring)env->GetObjectArrayElement(values, index);
        std::string value = jstringToUtf8(env, item);
        if (!value.empty()) {
            result.push_back(value);
        }
        env->DeleteLocalRef(item);
    }
    return result;
}

void throwJavaError(JNIEnv *env, const std::string &message) {
    jclass exceptionClass = env->FindClass("java/lang/IllegalStateException");
    if (exceptionClass) {
        env->ThrowNew(exceptionClass, message.c_str());
    }
}

std::string trim(const std::string &value) {
    const char *spaces = " \t\r\n";
    size_t start = value.find_first_not_of(spaces);
    if (start == std::string::npos) return std::string();
    size_t end = value.find_last_not_of(spaces);
    return value.substr(start, end - start + 1);
}

std::string lowerCopy(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return (char)std::tolower(ch);
    });
    return value;
}

COLORREF rgbIntToColorRef(jint rgb) {
    BYTE red = (BYTE)((rgb >> 16) & 0xFF);
    BYTE green = (BYTE)((rgb >> 8) & 0xFF);
    BYTE blue = (BYTE)(rgb & 0xFF);
    return RGB(red, green, blue);
}

void setDwmWindowAttribute(HWND hwnd, DWORD attribute, const void *value, DWORD valueSize) {
    (void)DwmSetWindowAttribute(hwnd, attribute, value, valueSize);
}

void applyDwmWindowChrome(HWND hwnd, bool darkMode, COLORREF captionColor, COLORREF borderColor, COLORREF textColor) {
    if (!hwnd || !IsWindow(hwnd)) return;

    BOOL enabled = darkMode ? TRUE : FALSE;
    HRESULT darkModeResult = DwmSetWindowAttribute(
        hwnd,
        kDwmwaUseImmersiveDarkMode,
        &enabled,
        sizeof(enabled)
    );
    if (FAILED(darkModeResult)) {
        setDwmWindowAttribute(hwnd, kDwmwaUseImmersiveDarkModeLegacy, &enabled, sizeof(enabled));
    }

    setDwmWindowAttribute(hwnd, kDwmwaCaptionColor, &captionColor, sizeof(captionColor));
    setDwmWindowAttribute(hwnd, kDwmwaBorderColor, &borderColor, sizeof(borderColor));
    setDwmWindowAttribute(hwnd, kDwmwaTextColor, &textColor, sizeof(textColor));
}

bool containsCaseInsensitive(const std::string &haystack, const std::string &needle) {
    return lowerCopy(haystack).find(lowerCopy(needle)) != std::string::npos;
}

std::string jsonEscape(const std::string &value) {
    std::string result;
    result.reserve(value.size() + 8);
    for (unsigned char ch : value) {
        switch (ch) {
            case '\\': result += "\\\\"; break;
            case '"': result += "\\\""; break;
            case '\b': result += "\\b"; break;
            case '\f': result += "\\f"; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default:
                if (ch < 0x20) {
                    char buffer[8];
                    std::snprintf(buffer, sizeof(buffer), "\\u%04x", ch);
                    result += buffer;
                } else {
                    result.push_back((char)ch);
                }
        }
    }
    return result;
}

std::wstring javaScriptStringLiteral(const std::string &value) {
    std::string escaped;
    escaped.reserve(value.size() + 8);
    escaped.push_back('"');
    escaped += jsonEscape(value);
    escaped.push_back('"');
    return toWide(escaped);
}

std::wstring moduleDirectory() {
    wchar_t buffer[MAX_PATH] = {};
    DWORD length = GetModuleFileNameW(gModule, buffer, MAX_PATH);
    if (length == 0 || length >= MAX_PATH) return std::wstring();
    std::wstring path(buffer, buffer + length);
    size_t separator = path.find_last_of(L"\\/");
    if (separator == std::wstring::npos) return std::wstring();
    return path.substr(0, separator);
}

std::wstring tempUserDataDirectory() {
    wchar_t tempPath[MAX_PATH] = {};
    DWORD length = GetTempPathW(MAX_PATH, tempPath);
    std::wstring result = length > 0 ? std::wstring(tempPath, tempPath + length) : L".\\";
    if (!result.empty() && result.back() != L'\\' && result.back() != L'/') {
        result.push_back(L'\\');
    }
    result += L"NuvioWebView2";
    CreateDirectoryW(result.c_str(), nullptr);
    return result;
}

std::string hresultMessage(const char *operation, HRESULT hr) {
    std::ostringstream builder;
    builder << operation << " failed: 0x" << std::hex << (unsigned long)hr;
    return builder.str();
}

struct MpvApi {
    using mpv_create_fn = mpv_handle *(*)();
    using mpv_initialize_fn = int (*)(mpv_handle *);
    using mpv_terminate_destroy_fn = void (*)(mpv_handle *);
    using mpv_set_option_fn = int (*)(mpv_handle *, const char *, mpv_format, void *);
    using mpv_set_option_string_fn = int (*)(mpv_handle *, const char *, const char *);
    using mpv_set_property_fn = int (*)(mpv_handle *, const char *, mpv_format, void *);
    using mpv_set_property_string_fn = int (*)(mpv_handle *, const char *, const char *);
    using mpv_get_property_fn = int (*)(mpv_handle *, const char *, mpv_format, void *);
    using mpv_command_fn = int (*)(mpv_handle *, const char **);
    using mpv_error_string_fn = const char *(*)(int);
    using mpv_free_fn = void (*)(void *);
    using mpv_wait_event_fn = mpv_event *(*)(mpv_handle *, double);
    using mpv_wakeup_fn = void (*)(mpv_handle *);

    HMODULE library = nullptr;
    std::once_flag loadOnce;
    std::string loadFailure;

    mpv_create_fn create = nullptr;
    mpv_initialize_fn initialize = nullptr;
    mpv_terminate_destroy_fn terminateDestroy = nullptr;
    mpv_set_option_fn setOption = nullptr;
    mpv_set_option_string_fn setOptionString = nullptr;
    mpv_set_property_fn setProperty = nullptr;
    mpv_set_property_string_fn setPropertyString = nullptr;
    mpv_get_property_fn getProperty = nullptr;
    mpv_command_fn command = nullptr;
    mpv_error_string_fn errorString = nullptr;
    mpv_free_fn freeValue = nullptr;
    mpv_wait_event_fn waitEvent = nullptr;
    mpv_wakeup_fn wakeup = nullptr;

    void ensureLoaded() {
        std::call_once(loadOnce, [this]() { load(); });
        if (!library) {
            throw std::runtime_error(loadFailure.empty() ? "Unable to load libmpv-2.dll." : loadFailure);
        }
    }

    std::string errorText(int error) {
        if (!errorString) return "unknown";
        const char *text = errorString(error);
        return text ? text : "unknown";
    }

    void load() {
        std::vector<std::wstring> candidates;

        wchar_t envPath[32768] = {};
        DWORD envCapacity = (DWORD)(sizeof(envPath) / sizeof(envPath[0]));
        DWORD envLength = GetEnvironmentVariableW(L"NUVIO_LIBMPV_PATH", envPath, envCapacity);
        if (envLength > 0 && envLength < envCapacity) {
            candidates.emplace_back(envPath, envPath + envLength);
        }

        std::wstring moduleDir = moduleDirectory();
        if (!moduleDir.empty()) {
            candidates.push_back(moduleDir + L"\\libmpv-2.dll");
        }
        candidates.push_back(L"libmpv-2.dll");
        candidates.push_back(L"C:\\Program Files (x86)\\Nuvio\\app\\native\\libmpv-2.dll");
        candidates.push_back(L"C:\\msys64\\ucrt64\\bin\\libmpv-2.dll");

        for (const std::wstring &candidate : candidates) {
            if (candidate.find(L'\\') != std::wstring::npos || candidate.find(L'/') != std::wstring::npos) {
                library = LoadLibraryExW(candidate.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
            } else {
                library = LoadLibraryW(candidate.c_str());
            }
            if (library) break;
        }

        if (!library) {
            loadFailure = "Unable to load libmpv-2.dll. Bundle it under native/windows or set NUVIO_LIBMPV_PATH.";
            return;
        }

        create = loadSymbol<mpv_create_fn>("mpv_create");
        initialize = loadSymbol<mpv_initialize_fn>("mpv_initialize");
        terminateDestroy = loadSymbol<mpv_terminate_destroy_fn>("mpv_terminate_destroy");
        setOption = loadSymbol<mpv_set_option_fn>("mpv_set_option");
        setOptionString = loadSymbol<mpv_set_option_string_fn>("mpv_set_option_string");
        setProperty = loadSymbol<mpv_set_property_fn>("mpv_set_property");
        setPropertyString = loadSymbol<mpv_set_property_string_fn>("mpv_set_property_string");
        getProperty = loadSymbol<mpv_get_property_fn>("mpv_get_property");
        command = loadSymbol<mpv_command_fn>("mpv_command");
        errorString = loadSymbol<mpv_error_string_fn>("mpv_error_string");
        freeValue = loadSymbol<mpv_free_fn>("mpv_free");
        waitEvent = loadSymbol<mpv_wait_event_fn>("mpv_wait_event");
        wakeup = loadSymbol<mpv_wakeup_fn>("mpv_wakeup");
    }

    template <typename T>
    T loadSymbol(const char *name) {
        FARPROC symbol = GetProcAddress(library, name);
        if (!symbol) {
            loadFailure = std::string("libmpv-2.dll is missing export ") + name + ".";
            FreeLibrary(library);
            library = nullptr;
            throw std::runtime_error(loadFailure);
        }
        return reinterpret_cast<T>(symbol);
    }
};

MpvApi &mpvApi() {
    static MpvApi api;
    api.ensureLoaded();
    return api;
}

class WindowsMpvWebPlayer;
LRESULT CALLBACK messageWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam);
LRESULT CALLBACK containerWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam);

void registerWindowClasses() {
    static std::once_flag once;
    std::call_once(once, []() {
        WNDCLASSEXW messageClass = {};
        messageClass.cbSize = sizeof(messageClass);
        messageClass.lpfnWndProc = messageWindowProc;
        messageClass.hInstance = gModule;
        messageClass.lpszClassName = kMessageWindowClass;
        RegisterClassExW(&messageClass);

        WNDCLASSEXW containerClass = {};
        containerClass.cbSize = sizeof(containerClass);
        containerClass.lpfnWndProc = containerWindowProc;
        containerClass.hInstance = gModule;
        containerClass.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
        containerClass.lpszClassName = kContainerWindowClass;
        RegisterClassExW(&containerClass);
    });
}

std::mutex gWebView2WarmupMutex;
std::condition_variable gWebView2WarmupCv;
std::thread gWebView2WarmupThread;
DWORD gWebView2WarmupThreadId = 0;
bool gWebView2WarmupStarted = false;
bool gWebView2WarmupReady = false;
bool gWebView2WarmupSucceeded = false;

void notifyWebView2WarmupReady(bool succeeded) {
    {
        std::lock_guard<std::mutex> lock(gWebView2WarmupMutex);
        if (!gWebView2WarmupReady) {
            gWebView2WarmupReady = true;
            gWebView2WarmupSucceeded = succeeded;
        }
    }
    gWebView2WarmupCv.notify_all();
}

void runWebView2WarmupThread(std::string controlsUrl) {
    {
        std::lock_guard<std::mutex> lock(gWebView2WarmupMutex);
        gWebView2WarmupThreadId = GetCurrentThreadId();
    }
    gWebView2WarmupCv.notify_all();

    MSG queueProbe = {};
    PeekMessageW(&queueProbe, nullptr, WM_USER, WM_USER, PM_NOREMOVE);

    bool didOleInitialize = false;
    ComPtr<ICoreWebView2Environment> environment;
    ComPtr<ICoreWebView2Controller> controller;
    ComPtr<ICoreWebView2> webView;
    EventRegistrationToken messageToken = {};
    EventRegistrationToken navigationToken = {};

    HRESULT oleResult = OleInitialize(nullptr);
    didOleInitialize = SUCCEEDED(oleResult);
    if (FAILED(oleResult)) {
        notifyWebView2WarmupReady(false);
        return;
    }

    std::wstring userDataDir = tempUserDataDirectory();
    HRESULT envCallResult = CreateCoreWebView2EnvironmentWithOptions(
        nullptr,
        userDataDir.c_str(),
        nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [&](HRESULT envResult, ICoreWebView2Environment *createdEnvironment) -> HRESULT {
                if (FAILED(envResult) || !createdEnvironment) {
                    notifyWebView2WarmupReady(false);
                    PostQuitMessage(0);
                    return S_OK;
                }

                environment = createdEnvironment;
                HRESULT controllerCallResult = createdEnvironment->CreateCoreWebView2Controller(
                    HWND_MESSAGE,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [&](HRESULT controllerResult, ICoreWebView2Controller *createdController) -> HRESULT {
                            if (FAILED(controllerResult) || !createdController) {
                                notifyWebView2WarmupReady(false);
                                PostQuitMessage(0);
                                return S_OK;
                            }

                            controller = createdController;
                            controller->put_IsVisible(FALSE);
                            createdController->get_CoreWebView2(&webView);
                            if (!webView) {
                                notifyWebView2WarmupReady(false);
                                PostQuitMessage(0);
                                return S_OK;
                            }

                            webView->add_WebMessageReceived(
                                Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                                    [&](ICoreWebView2 *, ICoreWebView2WebMessageReceivedEventArgs *args) -> HRESULT {
                                        if (!args) return S_OK;
                                        PWSTR messageJson = nullptr;
                                        if (SUCCEEDED(args->get_WebMessageAsJson(&messageJson)) && messageJson) {
                                            std::wstring message(messageJson);
                                            CoTaskMemFree(messageJson);
                                            if (message.find(L"controlsReady") != std::wstring::npos) {
                                                notifyWebView2WarmupReady(true);
                                            }
                                        }
                                        return S_OK;
                                    }
                                ).Get(),
                                &messageToken
                            );

                            webView->add_NavigationCompleted(
                                Callback<ICoreWebView2NavigationCompletedEventHandler>(
                                    [&](ICoreWebView2 *, ICoreWebView2NavigationCompletedEventArgs *args) -> HRESULT {
                                        BOOL navigationSucceeded = FALSE;
                                        if (args) {
                                            args->get_IsSuccess(&navigationSucceeded);
                                        }
                                        notifyWebView2WarmupReady(navigationSucceeded == TRUE);
                                        return S_OK;
                                    }
                                ).Get(),
                                &navigationToken
                            );

                            std::wstring url = toWide(controlsUrl);
                            HRESULT navigateResult = webView->Navigate(url.c_str());
                            if (FAILED(navigateResult)) {
                                notifyWebView2WarmupReady(false);
                                PostQuitMessage(0);
                            }
                            return S_OK;
                        }
                    ).Get()
                );
                if (FAILED(controllerCallResult)) {
                    notifyWebView2WarmupReady(false);
                    PostQuitMessage(0);
                }
                return S_OK;
            }
        ).Get()
    );
    if (FAILED(envCallResult)) {
        notifyWebView2WarmupReady(false);
    } else {
        MSG msg = {};
        while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    if (webView && messageToken.value != 0) {
        webView->remove_WebMessageReceived(messageToken);
    }
    if (webView && navigationToken.value != 0) {
        webView->remove_NavigationCompleted(navigationToken);
    }
    if (controller) {
        controller->Close();
        controller.Reset();
    }
    webView.Reset();
    environment.Reset();
    if (didOleInitialize) {
        OleUninitialize();
    }
}

bool startWebView2Warmup(const std::string &controlsUrl) {
    {
        std::lock_guard<std::mutex> lock(gWebView2WarmupMutex);
        if (!gWebView2WarmupStarted) {
            gWebView2WarmupStarted = true;
            gWebView2WarmupReady = false;
            gWebView2WarmupSucceeded = false;
            gWebView2WarmupThread = std::thread(runWebView2WarmupThread, controlsUrl);
        }
    }

    std::unique_lock<std::mutex> waitLock(gWebView2WarmupMutex);
    bool completed = gWebView2WarmupCv.wait_for(
        waitLock,
        std::chrono::seconds(5),
        []() { return gWebView2WarmupReady; }
    );
    if (!completed) return false;
    return gWebView2WarmupSucceeded;
}

void stopWebView2Warmup() {
    std::thread threadToJoin;
    DWORD threadId = 0;
    {
        std::unique_lock<std::mutex> lock(gWebView2WarmupMutex);
        if (!gWebView2WarmupStarted) return;
        gWebView2WarmupCv.wait_for(
            lock,
            std::chrono::seconds(1),
            []() { return gWebView2WarmupThreadId != 0; }
        );
        threadId = gWebView2WarmupThreadId;
    }

    if (threadId != 0) {
        PostThreadMessageW(threadId, WM_QUIT, 0, 0);
    }

    {
        std::lock_guard<std::mutex> lock(gWebView2WarmupMutex);
        if (gWebView2WarmupThread.joinable()) {
            threadToJoin = std::move(gWebView2WarmupThread);
        }
    }
    if (threadToJoin.joinable()) {
        threadToJoin.join();
    }

    {
        std::lock_guard<std::mutex> lock(gWebView2WarmupMutex);
        gWebView2WarmupStarted = false;
        gWebView2WarmupReady = false;
        gWebView2WarmupSucceeded = false;
        gWebView2WarmupThreadId = 0;
    }
}

class WindowsMpvWebPlayer : public std::enable_shared_from_this<WindowsMpvWebPlayer> {
    struct InitializationState {
        std::mutex mutex;
        std::condition_variable cv;
        bool complete = false;
        std::string failure;
    };

public:
    void initialize(
        HWND host,
        const std::string &sourceUrl,
        const std::vector<std::string> &headerLines,
        bool playWhenReady,
        long long initialPositionMs,
        const std::string &controlsUrl,
        JavaVM *vm,
        jobject sink,
        jmethodID method
    ) {
        if (!host || !IsWindow(host)) {
            throw std::runtime_error("Unable to resolve the AWT host HWND for native playback.");
        }

        javaVm = vm;
        eventSink = sink;
        eventMethod = method;
        hostHwnd = host;

        auto initState = std::make_shared<InitializationState>();
        auto self = shared_from_this();
        uiThread = std::thread(
            [self, sourceUrl, headerLines, playWhenReady, initialPositionMs, controlsUrl, initState]() {
                self->runNativeUiThread(sourceUrl, headerLines, playWhenReady, initialPositionMs, controlsUrl, initState);
            }
        );

        std::unique_lock<std::mutex> lock(initState->mutex);
        initState->cv.wait(lock, [&]() { return initState->complete; });
        if (!initState->failure.empty()) {
            lock.unlock();
            if (uiThread.joinable()) {
                uiThread.join();
            }
            throw std::runtime_error(initState->failure);
        }
    }

    void shutdown() {
        if (shuttingDown.exchange(true)) {
            return;
        }

        sendUiTask([self = shared_from_this()]() {
            self->cleanupUiResources();
            PostQuitMessage(0);
        });

        stopping.store(true);
        {
            std::lock_guard<std::mutex> lock(mpvMutex);
            if (mpv && mpvApi().wakeup) {
                mpvApi().wakeup(mpv);
            }
        }
        if (eventThread.joinable()) {
            eventThread.join();
        }
        {
            std::lock_guard<std::mutex> lock(mpvMutex);
            if (mpv) {
                mpvApi().terminateDestroy(mpv);
                mpv = nullptr;
            }
        }
        if (uiThread.joinable() && GetCurrentThreadId() != uiThreadId) {
            uiThread.join();
        }

        if (eventSink) {
            bool didAttach = false;
            JNIEnv *env = jniEnvDidAttach(&didAttach);
            if (env) {
                env->DeleteGlobalRef(eventSink);
            }
            if (didAttach) {
                javaVm->DetachCurrentThread();
            }
            eventSink = nullptr;
        }
        eventMethod = nullptr;
        javaVm = nullptr;
    }

    void processUiTasks() {
        std::deque<std::function<void()>> tasks;
        {
            std::lock_guard<std::mutex> lock(uiTaskMutex);
            tasks.swap(uiTasks);
        }
        for (auto &task : tasks) {
            task();
        }
    }

    void onTimer() {
        if (shuttingDown.load()) return;
        layoutNativeSubviews();
        syncControls();
    }

    void updateControlsJson(const std::string &controlsJson) {
        if (controlsJson.empty()) return;
        {
            std::lock_guard<std::mutex> lock(controlsMutex);
            pendingControlsJson = controlsJson;
        }
        postUiTask([self = shared_from_this()]() {
            self->flushPendingControlsJsonIfReady();
        });
    }

    void setPaused(bool paused) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        int flag = paused ? 1 : 0;
        mpvApi().setProperty(mpv, "pause", MPV_FORMAT_FLAG, &flag);
    }

    bool isPaused() {
        return flagProperty("pause", true);
    }

    void seekToMilliseconds(long long positionMs) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        std::string seconds = std::to_string((double)positionMs / 1000.0);
        const char *command[] = {"seek", seconds.c_str(), "absolute+keyframes", nullptr};
        mpvApi().command(mpv, command);
    }

    void seekByMilliseconds(long long offsetMs) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        std::string seconds = std::to_string((double)offsetMs / 1000.0);
        const char *command[] = {"seek", seconds.c_str(), "relative+keyframes", nullptr};
        mpvApi().command(mpv, command);
    }

    void setSpeed(double speed) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        double clamped = std::max(0.25, std::min(4.0, speed));
        mpvApi().setProperty(mpv, "speed", MPV_FORMAT_DOUBLE, &clamped);
    }

    double speed() {
        return doubleProperty("speed", 1.0);
    }

    void setResizeMode(int mode) {
        switch (mode) {
            case 1:
            case 2:
                setStringProperty("panscan", "1.0");
                setStringProperty("video-unscaled", "no");
                break;
            default:
                setStringProperty("panscan", "0.0");
                setStringProperty("video-unscaled", "no");
                break;
        }
    }

    long long durationMs() {
        return (long long)std::llround(doubleProperty("duration", 0.0) * 1000.0);
    }

    long long positionMs() {
        return (long long)std::llround(doubleProperty("time-pos", 0.0) * 1000.0);
    }

    long long bufferedPositionMs() {
        double buffered = rawPositionSeconds() + cacheAheadSeconds();
        return (long long)std::llround(std::max(buffered, 0.0) * 1000.0);
    }

    bool isLoading() {
        bool paused = isPaused();
        bool eofReached = isEnded();
        bool idle = flagProperty("core-idle", true);
        bool seeking = flagProperty("seeking", false);
        bool bufferingCache = flagProperty("paused-for-cache", false);
        bool fileReady = doubleProperty("duration", 0.0) > 0.0 || int64Property("track-list/count", 0) > 0;
        return !fileReady || (idle && !paused && !eofReached) || seeking || bufferingCache;
    }

    bool isEnded() {
        return flagProperty("eof-reached", false);
    }

    std::string audioTracksJson() {
        return tracksJsonForType("audio");
    }

    std::string subtitleTracksJson() {
        return tracksJsonForType("sub");
    }

    void selectAudioTrackId(int trackId) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        int64_t id = trackId;
        mpvApi().setProperty(mpv, "aid", MPV_FORMAT_INT64, &id);
    }

    void selectSubtitleTrackId(int trackId) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        if (trackId < 0) {
            mpvApi().setPropertyString(mpv, "sid", "no");
            return;
        }
        int64_t id = trackId;
        mpvApi().setProperty(mpv, "sid", MPV_FORMAT_INT64, &id);
    }

    void addSubtitleUrl(const std::string &url) {
        if (url.empty()) return;
        command({"sub-add", url, "select"});
    }

    void removeExternalSubtitles() {
        removeExternalSubtitleTracks();
        setStringProperty("sid", "no");
    }

    void removeExternalSubtitlesAndSelect(int trackId) {
        removeExternalSubtitleTracks();
        if (trackId >= 0) {
            selectSubtitleTrackId(trackId);
        } else {
            setStringProperty("sid", "no");
        }
    }

    void setSubtitleDelayMs(int delayMs) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        int clamped = std::max(-60000, std::min(60000, delayMs));
        double delaySeconds = (double)clamped / 1000.0;
        mpvApi().setProperty(mpv, "sub-delay", MPV_FORMAT_DOUBLE, &delaySeconds);
    }

    void applySubtitleStyle(
        const std::string &textColor,
        const std::string &backgroundColor,
        const std::string &outlineColor,
        double outlineSize,
        bool bold,
        double fontSize,
        int subPos
    ) {
        setStringProperty("sub-ass-override", "force");
        setStringProperty("sub-color", textColor.empty() ? "#FFFFFFFF" : textColor);
        setStringProperty("sub-back-color", backgroundColor.empty() ? "#00000000" : backgroundColor);
        setStringProperty("sub-outline-color", outlineColor.empty() ? "#FF000000" : outlineColor);
        setStringProperty(
            "sub-border-style",
            backgroundColor.rfind("#00", 0) == 0 ? "outline-and-shadow" : "opaque-box"
        );
        setStringProperty("sub-bold", bold ? "yes" : "no");

        {
            std::lock_guard<std::mutex> lock(mpvMutex);
            if (!mpv) return;
            double outline = std::max(0.0, std::min(8.0, outlineSize));
            double size = std::max(24.0, std::min(96.0, fontSize));
            int64_t position = std::max(0, std::min(150, subPos));
            mpvApi().setProperty(mpv, "sub-outline-size", MPV_FORMAT_DOUBLE, &outline);
            mpvApi().setProperty(mpv, "sub-font-size", MPV_FORMAT_DOUBLE, &size);
            mpvApi().setProperty(mpv, "sub-pos", MPV_FORMAT_INT64, &position);
        }
    }

private:
    HWND hostHwnd = nullptr;
    HWND containerHwnd = nullptr;
    HWND messageHwnd = nullptr;
    DWORD uiThreadId = 0;
    bool didOleInitialize = false;
    std::thread uiThread;

    ComPtr<ICoreWebView2Environment> environment;
    ComPtr<ICoreWebView2Controller> controller;
    ComPtr<ICoreWebView2> webView;
    EventRegistrationToken messageToken = {};

    std::mutex uiTaskMutex;
    std::deque<std::function<void()>> uiTasks;

    std::mutex mpvMutex;
    mpv_handle *mpv = nullptr;
    std::thread eventThread;
    std::atomic_bool stopping = false;
    std::atomic_bool shuttingDown = false;

    JavaVM *javaVm = nullptr;
    jobject eventSink = nullptr;
    jmethodID eventMethod = nullptr;

    std::atomic_bool controlsWebReady = false;
    std::mutex controlsMutex;
    std::string pendingControlsJson;
    double initialStartSeconds = 0.0;

    friend LRESULT CALLBACK messageWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam);
    friend LRESULT CALLBACK containerWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam);

    void runNativeUiThread(
        std::string sourceUrl,
        std::vector<std::string> headerLines,
        bool playWhenReady,
        long long initialPositionMs,
        std::string controlsUrl,
        std::shared_ptr<InitializationState> initState
    ) {
        std::string failure;
        try {
            initializeOnNativeUiThread(sourceUrl, headerLines, playWhenReady, initialPositionMs, controlsUrl);
        } catch (const std::exception &error) {
            failure = error.what();
            cleanupUiResources();
        }

        {
            std::lock_guard<std::mutex> lock(initState->mutex);
            initState->failure = failure;
            initState->complete = true;
        }
        initState->cv.notify_one();

        if (!failure.empty()) {
            return;
        }

        MSG msg = {};
        while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    void initializeOnNativeUiThread(
        const std::string &sourceUrl,
        const std::vector<std::string> &headerLines,
        bool playWhenReady,
        long long initialPositionMs,
        const std::string &controlsUrl
    ) {
        registerWindowClasses();
        uiThreadId = GetCurrentThreadId();
        HRESULT oleResult = OleInitialize(nullptr);
        didOleInitialize = SUCCEEDED(oleResult);
        if (FAILED(oleResult)) {
            throw std::runtime_error(hresultMessage("OleInitialize", oleResult));
        }

        messageHwnd = CreateWindowExW(
            0,
            kMessageWindowClass,
            L"",
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            nullptr,
            gModule,
            this
        );
        if (!messageHwnd) {
            throw std::runtime_error("Unable to create Windows player message window.");
        }

        RECT bounds = {};
        GetClientRect(hostHwnd, &bounds);
        LONG width = std::max<LONG>(1, bounds.right - bounds.left);
        LONG height = std::max<LONG>(1, bounds.bottom - bounds.top);
        containerHwnd = CreateWindowExW(
            0,
            kContainerWindowClass,
            L"",
            WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
            0,
            0,
            width,
            height,
            hostHwnd,
            nullptr,
            gModule,
            this
        );
        if (!containerHwnd) {
            throw std::runtime_error("Unable to create native player container window.");
        }

        startWebView(controlsUrl);
        startMpv(sourceUrl, headerLines, playWhenReady, initialPositionMs);
        layoutNativeSubviews();
        if (!SetTimer(messageHwnd, NUVIO_TIMER_ID, 500, nullptr)) {
            throw std::runtime_error("Unable to start native player timer.");
        }
    }

    void cleanupUiResources() {
        if (messageHwnd) {
            KillTimer(messageHwnd, NUVIO_TIMER_ID);
        }
        if (webView && messageToken.value != 0) {
            webView->remove_WebMessageReceived(messageToken);
            messageToken.value = 0;
        }
        if (controller) {
            controller->Close();
            controller.Reset();
        }
        webView.Reset();
        environment.Reset();
        if (containerHwnd) {
            DestroyWindow(containerHwnd);
            containerHwnd = nullptr;
        }
        if (messageHwnd) {
            HWND hwnd = messageHwnd;
            messageHwnd = nullptr;
            DestroyWindow(hwnd);
        }
        if (didOleInitialize) {
            OleUninitialize();
            didOleInitialize = false;
        }
    }

    void postUiTask(std::function<void()> task) {
        if (shuttingDown.load()) return;
        {
            std::lock_guard<std::mutex> lock(uiTaskMutex);
            uiTasks.push_back(std::move(task));
        }
        HWND target = messageHwnd;
        if (target) {
            PostMessageW(target, WM_NUVIO_TASK, 0, 0);
        }
    }

    void sendUiTask(std::function<void()> task) {
        if (GetCurrentThreadId() == uiThreadId || !messageHwnd) {
            task();
            return;
        }

        auto done = std::make_shared<bool>(false);
        auto doneMutex = std::make_shared<std::mutex>();
        auto doneCv = std::make_shared<std::condition_variable>();
        {
            std::lock_guard<std::mutex> lock(uiTaskMutex);
            uiTasks.push_back([task = std::move(task), done, doneMutex, doneCv]() mutable {
                task();
                {
                    std::lock_guard<std::mutex> doneLock(*doneMutex);
                    *done = true;
                }
                doneCv->notify_one();
            });
        }
        SendMessageW(messageHwnd, WM_NUVIO_TASK, 0, 0);

        std::unique_lock<std::mutex> waitLock(*doneMutex);
        doneCv->wait(waitLock, [&]() { return *done; });
    }

    void startWebView(const std::string &controlsUrl) {
        std::wstring userDataDir = tempUserDataDirectory();
        auto weakSelf = weak_from_this();
        HRESULT result = CreateCoreWebView2EnvironmentWithOptions(
            nullptr,
            userDataDir.c_str(),
            nullptr,
            Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                [weakSelf, controlsUrl](HRESULT envResult, ICoreWebView2Environment *createdEnvironment) -> HRESULT {
                    auto self = weakSelf.lock();
                    if (!self || self->shuttingDown.load()) return S_OK;
                    if (FAILED(envResult) || !createdEnvironment) {
                        return S_OK;
                    }
                    self->environment = createdEnvironment;
                    auto controllerWeakSelf = weakSelf;
                    HRESULT controllerResult = createdEnvironment->CreateCoreWebView2Controller(
                        self->containerHwnd,
                        Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                            [controllerWeakSelf, controlsUrl](HRESULT controllerResult, ICoreWebView2Controller *createdController) -> HRESULT {
                                auto controllerSelf = controllerWeakSelf.lock();
                                if (!controllerSelf || controllerSelf->shuttingDown.load()) return S_OK;
                                if (FAILED(controllerResult) || !createdController) {
                                    return S_OK;
                                }
                                controllerSelf->controller = createdController;
                                createdController->get_CoreWebView2(&controllerSelf->webView);

                                ComPtr<ICoreWebView2Controller2> controller2;
                                if (SUCCEEDED(createdController->QueryInterface(IID_PPV_ARGS(&controller2))) && controller2) {
                                    COREWEBVIEW2_COLOR transparent = {0, 0, 0, 0};
                                    controller2->put_DefaultBackgroundColor(transparent);
                                }

                                ComPtr<ICoreWebView2Settings> settings;
                                if (controllerSelf->webView && SUCCEEDED(controllerSelf->webView->get_Settings(&settings)) && settings) {
                                    settings->put_AreDefaultContextMenusEnabled(FALSE);
                                    settings->put_IsStatusBarEnabled(FALSE);
                                }

                                if (controllerSelf->webView) {
                                    auto messageWeakSelf = controllerWeakSelf;
                                    controllerSelf->webView->add_WebMessageReceived(
                                        Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                                            [messageWeakSelf](ICoreWebView2 *, ICoreWebView2WebMessageReceivedEventArgs *args) -> HRESULT {
                                                auto messageSelf = messageWeakSelf.lock();
                                                if (!messageSelf || messageSelf->shuttingDown.load() || !args) return S_OK;
                                                PWSTR messageJson = nullptr;
                                                if (SUCCEEDED(args->get_WebMessageAsJson(&messageJson)) && messageJson) {
                                                    messageSelf->handleWebMessage(std::wstring(messageJson));
                                                    CoTaskMemFree(messageJson);
                                                }
                                                return S_OK;
                                            }
                                        ).Get(),
                                        &controllerSelf->messageToken
                                    );
                                    controllerSelf->layoutNativeSubviews();
                                    std::wstring url = toWide(controlsUrl);
                                    controllerSelf->webView->Navigate(url.c_str());
                                    createdController->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
                                }
                                return S_OK;
                            }
                        ).Get()
                    );
                    (void)controllerResult;
                    return S_OK;
                }
            ).Get()
        );
        if (FAILED(result)) {
            throw std::runtime_error(hresultMessage("CreateCoreWebView2EnvironmentWithOptions", result));
        }
    }

    void startMpv(
        const std::string &sourceUrl,
        const std::vector<std::string> &headerLines,
        bool playWhenReady,
        long long initialPositionMs
    ) {
        MpvApi &api = mpvApi();
        {
            std::lock_guard<std::mutex> lock(mpvMutex);
            mpv = api.create();
            if (!mpv) {
                throw std::runtime_error("mpv_create failed.");
            }
            initialStartSeconds = initialPositionMs > 0 ? (double)initialPositionMs / 1000.0 : 0.0;

            setMpvOptionStringLocked("config", "no");
            setMpvOptionStringLocked("osc", "no");
            setMpvOptionStringLocked("input-default-bindings", "yes");
            setMpvOptionStringLocked("input-vo-keyboard", "no");
            setMpvOptionStringLocked("keep-open", "yes");
            setMpvOptionStringLocked("vo", "gpu-next");
            setMpvOptionStringLocked("gpu-api", "d3d11");
            setMpvOptionStringLocked("hwdec", "d3d11va");
            setMpvOptionStringLocked("hwdec-codecs", "all");
            setMpvOptionStringLocked("vd-lavc-software-fallback", "no");
            setMpvOptionStringLocked("vd-lavc-threads", "4");
            setMpvOptionStringLocked("target-colorspace-hint", "yes");
            setMpvOptionStringLocked("tone-mapping", "auto");
            setMpvOptionStringLocked("dither-depth", "auto");
            setMpvOptionStringLocked("deband", "yes");
            setMpvOptionStringLocked("scale", "spline36");
            setMpvOptionStringLocked("cscale", "spline36");
            setMpvOptionStringLocked("demuxer-max-bytes", "64MiB");
            setMpvOptionStringLocked("demuxer-max-back-bytes", "16MiB");
            setMpvOptionStringLocked("demuxer-seekable-cache", "no");
            setMpvOptionStringLocked("cache-secs", "30");
            setMpvOptionStringLocked("hr-seek", "no");

            int64_t wid = (int64_t)(intptr_t)containerHwnd;
            int widResult = api.setOption(mpv, "wid", MPV_FORMAT_INT64, &wid);
            if (widResult < 0) {
                throw std::runtime_error(std::string("mpv wid option failed: ") + api.errorText(widResult));
            }

            if (!headerLines.empty()) {
                std::string headers;
                for (size_t index = 0; index < headerLines.size(); index++) {
                    if (index > 0) headers.push_back(',');
                    headers += headerLines[index];
                }
                setMpvOptionStringLocked("http-header-fields", headers.c_str());
            }

            int initResult = api.initialize(mpv);
            if (initResult < 0) {
                throw std::runtime_error(std::string("mpv_initialize failed: ") + api.errorText(initResult));
            }

            std::vector<const char *> loadCommand = {"loadfile", sourceUrl.c_str()};
            std::string loadOptions;
            if (initialPositionMs > 0) {
                char startBuffer[64];
                std::snprintf(startBuffer, sizeof(startBuffer), "start=%.3f", (double)initialPositionMs / 1000.0);
                loadOptions = startBuffer;
                loadCommand.push_back("replace");
                loadCommand.push_back("-1");
                loadCommand.push_back(loadOptions.c_str());
            }
            loadCommand.push_back(nullptr);

            int commandResult = api.command(mpv, loadCommand.data());
            if (commandResult < 0) {
                throw std::runtime_error(std::string("mpv loadfile failed: ") + api.errorText(commandResult));
            }
        }

        setPaused(!playWhenReady);
        auto self = shared_from_this();
        eventThread = std::thread([self]() { self->drainMpvEvents(); });
    }

    void layoutNativeSubviews() {
        if (!hostHwnd || !IsWindow(hostHwnd)) {
            return;
        }
        RECT bounds = {};
        GetClientRect(hostHwnd, &bounds);
        LONG width = std::max<LONG>(1, bounds.right - bounds.left);
        LONG height = std::max<LONG>(1, bounds.bottom - bounds.top);
        if (containerHwnd) {
            SetWindowPos(containerHwnd, HWND_TOP, 0, 0, width, height, SWP_SHOWWINDOW | SWP_NOACTIVATE);
        }
        if (controller) {
            RECT webBounds = {0, 0, width, height};
            controller->put_Bounds(webBounds);
            controller->put_IsVisible(TRUE);
        }
    }

    void flushPendingControlsJsonIfReady() {
        if (!webView || !controlsWebReady.load()) {
            return;
        }
        std::string controlsJson;
        {
            std::lock_guard<std::mutex> lock(controlsMutex);
            controlsJson = pendingControlsJson;
            pendingControlsJson.clear();
        }
        if (controlsJson.empty()) return;
        std::wstring script =
            L"(function(){if(!window.playerControls)return 'missing';window.playerControls(JSON.parse(" +
            javaScriptStringLiteral(controlsJson) +
            L"));return 'applied';})()";
        webView->ExecuteScript(script.c_str(), nullptr);
    }

    void syncControls() {
        if (!webView) return;
        double duration = doubleProperty("duration", 0.0);
        double position = doubleProperty("time-pos", 0.0);
        bool paused = isPaused();
        bool loading = isLoading();
        std::string audioTracks = audioTracksJson();
        std::string subtitleTracks = subtitleTracksJson();

        std::ostringstream script;
        script << "window.playerUpdate({duration:" << duration
               << ",position:" << position
               << ",paused:" << (paused ? "true" : "false")
               << ",loading:" << (loading ? "true" : "false")
               << ",audioTracks:" << audioTracks
               << ",subtitleTracks:" << subtitleTracks
               << "})";
        std::wstring wideScript = toWide(script.str());
        webView->ExecuteScript(wideScript.c_str(), nullptr);
    }

    void handleWebMessage(const std::wstring &messageJson) {
        std::string type = extractJsonString(messageJson, L"type");
        if (type.empty()) return;
        double value = extractJsonNumber(messageJson, L"value", 0.0);

        if (type == "controlsReady") {
            controlsWebReady.store(true);
            flushPendingControlsJsonIfReady();
            syncControls();
            return;
        }
        if (type == "selectAudioTrack") {
            selectAudioTrackId((int)std::llround(value));
            syncControls();
            return;
        }
        if (type == "selectSubtitleTrack") {
            selectSubtitleTrackId((int)std::llround(value));
            syncControls();
            return;
        }
        sendPlayerEvent(type, value);
    }

    static std::string extractJsonString(const std::wstring &json, const std::wstring &field) {
        std::wstring key = L"\"" + field + L"\"";
        size_t keyIndex = json.find(key);
        if (keyIndex == std::wstring::npos) return std::string();
        size_t colon = json.find(L':', keyIndex + key.size());
        if (colon == std::wstring::npos) return std::string();
        size_t quote = json.find(L'"', colon + 1);
        if (quote == std::wstring::npos) return std::string();

        std::wstring result;
        bool escaping = false;
        for (size_t index = quote + 1; index < json.size(); index++) {
            wchar_t ch = json[index];
            if (escaping) {
                switch (ch) {
                    case L'"': result.push_back(L'"'); break;
                    case L'\\': result.push_back(L'\\'); break;
                    case L'/': result.push_back(L'/'); break;
                    case L'b': result.push_back(L'\b'); break;
                    case L'f': result.push_back(L'\f'); break;
                    case L'n': result.push_back(L'\n'); break;
                    case L'r': result.push_back(L'\r'); break;
                    case L't': result.push_back(L'\t'); break;
                    default: result.push_back(ch); break;
                }
                escaping = false;
                continue;
            }
            if (ch == L'\\') {
                escaping = true;
                continue;
            }
            if (ch == L'"') break;
            result.push_back(ch);
        }
        return toUtf8(result);
    }

    static double extractJsonNumber(const std::wstring &json, const std::wstring &field, double fallback) {
        std::wstring key = L"\"" + field + L"\"";
        size_t keyIndex = json.find(key);
        if (keyIndex == std::wstring::npos) return fallback;
        size_t colon = json.find(L':', keyIndex + key.size());
        if (colon == std::wstring::npos) return fallback;
        size_t start = json.find_first_not_of(L" \t\r\n", colon + 1);
        if (start == std::wstring::npos) return fallback;
        size_t end = start;
        while (end < json.size()) {
            wchar_t ch = json[end];
            if (!(std::iswdigit(ch) || ch == L'-' || ch == L'+' || ch == L'.' || ch == L'e' || ch == L'E')) {
                break;
            }
            end++;
        }
        if (end <= start) return fallback;
        try {
            return std::stod(json.substr(start, end - start));
        } catch (...) {
            return fallback;
        }
    }

    void drainMpvEvents() {
        while (!stopping.load()) {
            mpv_handle *current = nullptr;
            {
                std::lock_guard<std::mutex> lock(mpvMutex);
                current = mpv;
            }
            if (!current) {
                return;
            }

            mpv_event *event = mpvApi().waitEvent(current, 0.5);
            if (!event) continue;
            if (event->event_id == MPV_EVENT_SHUTDOWN) {
                return;
            }
        }
    }

    JNIEnv *jniEnvDidAttach(bool *didAttach) {
        if (didAttach) *didAttach = false;
        if (!javaVm) return nullptr;
        JNIEnv *env = nullptr;
        jint status = javaVm->GetEnv((void **)&env, JNI_VERSION_1_6);
        if (status == JNI_OK) return env;
        if (status != JNI_EDETACHED) return nullptr;
        if (javaVm->AttachCurrentThread((void **)&env, nullptr) != JNI_OK) {
            return nullptr;
        }
        if (didAttach) *didAttach = true;
        return env;
    }

    void sendPlayerEvent(const std::string &type, double value) {
        if (!eventSink || !eventMethod) return;
        bool didAttach = false;
        JNIEnv *env = jniEnvDidAttach(&didAttach);
        if (!env) return;

        jstring eventType = newJavaStringUtf8(env, type);
        env->CallVoidMethod(eventSink, eventMethod, eventType, (jdouble)value);
        if (env->ExceptionCheck()) {
            env->ExceptionClear();
        }
        if (eventType) {
            env->DeleteLocalRef(eventType);
        }
        if (didAttach) {
            javaVm->DetachCurrentThread();
        }
    }

    void setMpvOptionStringLocked(const char *name, const char *value) {
        (void)mpvApi().setOptionString(mpv, name, value);
    }

    double doubleProperty(const char *name, double fallback) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return fallback;
        double value = fallback;
        int result = mpvApi().getProperty(mpv, name, MPV_FORMAT_DOUBLE, &value);
        if (result < 0) {
            return fallback;
        }
        return value;
    }

    long long int64Property(const char *name, long long fallback) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return fallback;
        int64_t value = fallback;
        int result = mpvApi().getProperty(mpv, name, MPV_FORMAT_INT64, &value);
        if (result < 0) {
            return fallback;
        }
        return value;
    }

    bool flagProperty(const char *name, bool fallback) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return fallback;
        int flag = fallback ? 1 : 0;
        int result = mpvApi().getProperty(mpv, name, MPV_FORMAT_FLAG, &flag);
        if (result < 0) {
            return fallback;
        }
        return flag != 0;
    }

    std::string stringProperty(const char *name, const std::string &fallback) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return fallback;
        char *value = nullptr;
        int propertyResult = mpvApi().getProperty(mpv, name, MPV_FORMAT_STRING, &value);
        if (propertyResult < 0 || !value) {
            return fallback;
        }
        std::string result(value);
        mpvApi().freeValue(value);
        return result;
    }

    void setStringProperty(const char *name, const std::string &value) {
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        mpvApi().setPropertyString(mpv, name, value.c_str());
    }

    void command(const std::vector<std::string> &args) {
        if (args.empty()) return;
        std::lock_guard<std::mutex> lock(mpvMutex);
        if (!mpv) return;
        std::vector<const char *> cargs;
        cargs.reserve(args.size() + 1);
        for (const std::string &arg : args) {
            cargs.push_back(arg.c_str());
        }
        cargs.push_back(nullptr);
        mpvApi().command(mpv, cargs.data());
    }

    double rawPositionSeconds() {
        double position = doubleProperty("time-pos", 0.0);
        return std::isfinite(position) ? std::max(position, 0.0) : 0.0;
    }

    double effectiveCachePositionSeconds() {
        double position = rawPositionSeconds();
        if (initialStartSeconds > 0.0 && position + 5.0 < initialStartSeconds) {
            return initialStartSeconds;
        }
        return position;
    }

    double cacheAheadSeconds() {
        double effectivePosition = effectiveCachePositionSeconds();
        double cacheTime = doubleProperty("demuxer-cache-time", 0.0);
        if (std::isfinite(cacheTime) && cacheTime > 0.0) {
            if (cacheTime >= effectivePosition - 5.0) {
                return std::max(cacheTime - effectivePosition, 0.0);
            }
            return cacheTime;
        }

        double cacheDuration = doubleProperty("demuxer-cache-duration", 0.0);
        if (std::isfinite(cacheDuration) && cacheDuration > 0.0) {
            return cacheDuration;
        }
        return 0.0;
    }

    void removeExternalSubtitleTracks() {
        long long count = int64Property("track-list/count", 0);
        if (count <= 0) return;
        for (long long index = count - 1; index >= 0; index--) {
            std::string prefix = "track-list/" + std::to_string(index);
            std::string type = stringProperty((prefix + "/type").c_str(), "");
            bool external = flagProperty((prefix + "/external").c_str(), false);
            if (type == "sub" && external) {
                long long trackId = int64Property((prefix + "/id").c_str(), -1);
                if (trackId >= 0) {
                    command({"sub-remove", std::to_string(trackId)});
                }
            }
        }
    }

    std::string tracksJsonForType(const std::string &wantedType) {
        long long count = int64Property("track-list/count", 0);
        std::ostringstream json;
        json << "[";
        int logicalIndex = 0;
        bool first = true;
        for (long long index = 0; index < count; index++) {
            std::string prefix = "track-list/" + std::to_string(index);
            std::string type = stringProperty((prefix + "/type").c_str(), "");
            if (type != wantedType) continue;

            long long trackId = int64Property((prefix + "/id").c_str(), logicalIndex + 1);
            std::string title = trackStringAtIndex(index, "title");
            std::string language = trackStringAtIndex(index, "lang");
            std::string codec = trackStringAtIndex(index, "codec");
            std::string decoderDescription = trackStringAtIndex(index, "decoder-desc");
            std::string channels = trackStringAtIndex(index, "demux-channels");
            long long channelCount = int64Property((prefix + "/demux-channel-count").c_str(), 0);
            bool selected = flagProperty((prefix + "/selected").c_str(), false);
            bool forced = flagProperty((prefix + "/forced").c_str(), false);
            std::string label = formatTrackTitle(type, logicalIndex, title, language, codec, decoderDescription, channels, (int)channelCount);

            if (!first) json << ",";
            first = false;
            json << "{"
                 << "\"index\":" << logicalIndex << ","
                 << "\"id\":\"" << jsonEscape(std::to_string(trackId)) << "\","
                 << "\"label\":\"" << jsonEscape(label) << "\","
                 << "\"language\":\"" << jsonEscape(language) << "\","
                 << "\"selected\":" << (selected ? "true" : "false") << ","
                 << "\"forced\":" << (forced ? "true" : "false")
                 << "}";
            logicalIndex++;
        }
        json << "]";
        return json.str();
    }

    std::string trackStringAtIndex(long long index, const std::string &field) {
        return trim(stringProperty(("track-list/" + std::to_string(index) + "/" + field).c_str(), ""));
    }

    std::string formatTrackTitle(
        const std::string &type,
        int index,
        const std::string &title,
        const std::string &language,
        const std::string &codec,
        const std::string &decoderDescription,
        const std::string &channels,
        int channelCount
    ) {
        std::string base = !trim(title).empty()
            ? trim(title)
            : (!trim(language).empty()
                ? trim(language)
                : (type == "sub" ? "Subtitle " + std::to_string(index + 1) : "Track " + std::to_string(index + 1)));
        std::string codecName = codecDisplayName(codec);
        if (codecName.empty()) codecName = codecDisplayName(decoderDescription);
        std::string channelName = type == "audio" ? channelLayoutName(channels, channelCount) : "";

        std::vector<std::string> details;
        for (const std::string &detail : {channelName, codecName}) {
            if (!detail.empty() && !containsCaseInsensitive(base, detail)) {
                details.push_back(detail);
            }
        }
        if (details.empty()) return base;
        std::string suffix;
        for (size_t detailIndex = 0; detailIndex < details.size(); detailIndex++) {
            if (detailIndex > 0) suffix += ", ";
            suffix += details[detailIndex];
        }
        return base + " (" + suffix + ")";
    }

    std::string channelLayoutName(const std::string &channels, int channelCount) {
        std::string normalized = trim(channels);
        if (!normalized.empty() && lowerCopy(normalized) != "unknown") {
            std::string lower = lowerCopy(normalized);
            if (lower == "mono") return "Mono";
            if (lower == "stereo") return "Stereo";
            return normalized;
        }
        switch (channelCount) {
            case 1: return "Mono";
            case 2: return "Stereo";
            case 6: return "5.1";
            case 8: return "7.1";
            default: return channelCount > 0 ? std::to_string(channelCount) + "ch" : "";
        }
    }

    std::string codecDisplayName(const std::string &value) {
        std::string raw = trim(value);
        if (raw.empty()) return "";
        std::string codec = lowerCopy(raw);
        if (codec.find("eac3") != std::string::npos || codec.find("e-ac-3") != std::string::npos || codec.find("e ac-3") != std::string::npos) {
            return codec.find("joc") != std::string::npos || codec.find("atmos") != std::string::npos ? "E-AC-3-JOC" : "E-AC-3";
        }
        if (codec.find("truehd") != std::string::npos || codec.find("true hd") != std::string::npos) return "TrueHD";
        if (codec.find("ac3") != std::string::npos || codec.find("ac-3") != std::string::npos) return "AC-3";
        if (codec.find("dts-hd") != std::string::npos || codec.find("dtshd") != std::string::npos || codec.find("dts hd") != std::string::npos) return "DTS-HD";
        if (codec.find("dts") != std::string::npos || codec == "dca") return "DTS";
        if (codec.find("aac") != std::string::npos) return "AAC";
        if (codec.find("mp3") != std::string::npos || codec.find("mpeg audio") != std::string::npos) return "MP3";
        if (codec.find("mp2") != std::string::npos) return "MP2";
        if (codec.find("opus") != std::string::npos) return "Opus";
        if (codec.find("vorbis") != std::string::npos) return "Vorbis";
        if (codec.find("flac") != std::string::npos) return "FLAC";
        if (codec.find("alac") != std::string::npos) return "ALAC";
        if (codec.find("pcm") != std::string::npos || codec.find("wav") != std::string::npos) return "WAV";
        if (codec.find("pgs") != std::string::npos || codec.find("hdmv") != std::string::npos) return "PGS";
        if (codec.find("subrip") != std::string::npos || codec == "srt") return "SRT";
        if (codec.find("ass") != std::string::npos || codec.find("ssa") != std::string::npos) return "SSA";
        if (codec.find("webvtt") != std::string::npos || codec == "vtt") return "VTT";
        if (codec.find("ttml") != std::string::npos) return "TTML";
        if (codec.find("mov_text") != std::string::npos || codec.find("tx3g") != std::string::npos) return "TX3G";
        if (codec.find("dvb") != std::string::npos) return "DVB";
        return raw;
    }
};

LRESULT CALLBACK messageWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    if (message == WM_NCCREATE) {
        auto *create = reinterpret_cast<CREATESTRUCTW *>(lParam);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(create->lpCreateParams));
        return TRUE;
    }
    auto *player = reinterpret_cast<WindowsMpvWebPlayer *>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
    switch (message) {
        case WM_NUVIO_TASK:
            if (player) player->processUiTasks();
            return 0;
        case WM_TIMER:
            if (player && wParam == NUVIO_TIMER_ID) player->onTimer();
            return 0;
        case WM_NCDESTROY:
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            return 0;
        default:
            return DefWindowProcW(hwnd, message, wParam, lParam);
    }
}

LRESULT CALLBACK containerWindowProc(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam) {
    if (message == WM_NCCREATE) {
        auto *create = reinterpret_cast<CREATESTRUCTW *>(lParam);
        SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(create->lpCreateParams));
        return TRUE;
    }
    switch (message) {
        case WM_SIZE:
            return 0;
        case WM_ERASEBKGND: {
            RECT rect = {};
            GetClientRect(hwnd, &rect);
            FillRect((HDC)wParam, &rect, (HBRUSH)GetStockObject(BLACK_BRUSH));
            return 1;
        }
        case WM_NCDESTROY:
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0);
            return 0;
        default:
            return DefWindowProcW(hwnd, message, wParam, lParam);
    }
}

std::shared_ptr<WindowsMpvWebPlayer> playerFromHandle(jlong handle) {
    if (handle == 0) return nullptr;
    auto *holder = reinterpret_cast<std::shared_ptr<WindowsMpvWebPlayer> *>(handle);
    return holder ? *holder : nullptr;
}

} // namespace

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        gModule = module;
        DisableThreadLibraryCalls(module);
    }
    return TRUE;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_create(
    JNIEnv *env,
    jobject,
    jlong hostViewPtr,
    jstring sourceUrl,
    jobjectArray headerLines,
    jboolean playWhenReady,
    jlong initialPositionMs,
    jstring controlsPageUrl,
    jobject eventSink
) {
    HWND hostHwnd = (HWND)(intptr_t)hostViewPtr;
    std::string sourceUrlText = jstringToUtf8(env, sourceUrl);
    std::vector<std::string> headerLineValues = jstringArrayToVector(env, headerLines);
    std::string controlsPageUrlText = jstringToUtf8(env, controlsPageUrl);
    JavaVM *javaVm = nullptr;
    env->GetJavaVM(&javaVm);

    jobject eventSinkRef = nullptr;
    jmethodID eventMethod = nullptr;
    if (eventSink) {
        eventSinkRef = env->NewGlobalRef(eventSink);
        jclass eventSinkClass = env->GetObjectClass(eventSink);
        eventMethod = env->GetMethodID(eventSinkClass, "onPlayerEvent", "(Ljava/lang/String;D)V");
        env->DeleteLocalRef(eventSinkClass);
        if (!eventMethod) {
            if (eventSinkRef) env->DeleteGlobalRef(eventSinkRef);
            throwJavaError(env, "Native player event sink is missing onPlayerEvent(String, Double).");
            return 0;
        }
    }

    auto player = std::make_shared<WindowsMpvWebPlayer>();
    try {
        player->initialize(
            hostHwnd,
            sourceUrlText,
            headerLineValues,
            playWhenReady == JNI_TRUE,
            initialPositionMs,
            controlsPageUrlText,
            javaVm,
            eventSinkRef,
            eventMethod
        );
    } catch (const std::exception &error) {
        player->shutdown();
        throwJavaError(env, error.what());
        return 0;
    }

    auto *holder = new std::shared_ptr<WindowsMpvWebPlayer>(player);
    jlong handle = (jlong)(intptr_t)holder;
    return handle;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_warmupWebView2(JNIEnv *env, jobject, jstring controlsPageUrl) {
    std::string controlsPageUrlText = jstringToUtf8(env, controlsPageUrl);
    return startWebView2Warmup(controlsPageUrlText) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_shutdownWebView2Warmup(JNIEnv *, jobject) {
    stopWebView2Warmup();
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_dispose(JNIEnv *, jobject, jlong handle) {
    if (handle == 0) return;
    auto *holder = reinterpret_cast<std::shared_ptr<WindowsMpvWebPlayer> *>(handle);
    std::shared_ptr<WindowsMpvWebPlayer> player = *holder;
    delete holder;
    if (player) player->shutdown();
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_updateControls(JNIEnv *env, jobject, jlong handle, jstring controlsJson) {
    auto player = playerFromHandle(handle);
    std::string controlsJsonText = jstringToUtf8(env, controlsJson);
    if (player) player->updateControlsJson(controlsJsonText);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setPaused(JNIEnv *, jobject, jlong handle, jboolean paused) {
    auto player = playerFromHandle(handle);
    if (player) player->setPaused(paused == JNI_TRUE);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_seekTo(JNIEnv *, jobject, jlong handle, jlong positionMs) {
    auto player = playerFromHandle(handle);
    if (player) player->seekToMilliseconds(positionMs);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_seekBy(JNIEnv *, jobject, jlong handle, jlong offsetMs) {
    auto player = playerFromHandle(handle);
    if (player) player->seekByMilliseconds(offsetMs);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setSpeed(JNIEnv *, jobject, jlong handle, jfloat speed) {
    auto player = playerFromHandle(handle);
    if (player) player->setSpeed(speed);
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_durationMs(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return player ? player->durationMs() : 0;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_positionMs(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return player ? player->positionMs() : 0;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_bufferedPositionMs(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return player ? player->bufferedPositionMs() : 0;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_isLoading(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return player && player->isLoading() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_isEnded(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return player && player->isEnded() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_isPaused(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return !player || player->isPaused() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jfloat JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_speed(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return player ? (jfloat)player->speed() : 1.0f;
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setResizeMode(JNIEnv *, jobject, jlong handle, jint mode) {
    auto player = playerFromHandle(handle);
    if (player) player->setResizeMode(mode);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_audioTracksJson(JNIEnv *env, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return newJavaStringUtf8(env, player ? player->audioTracksJson() : "[]");
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_subtitleTracksJson(JNIEnv *env, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    return newJavaStringUtf8(env, player ? player->subtitleTracksJson() : "[]");
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_selectAudioTrack(JNIEnv *, jobject, jlong handle, jint trackId) {
    auto player = playerFromHandle(handle);
    if (player) player->selectAudioTrackId(trackId);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_selectSubtitleTrack(JNIEnv *, jobject, jlong handle, jint trackId) {
    auto player = playerFromHandle(handle);
    if (player) player->selectSubtitleTrackId(trackId);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_addSubtitleUrl(JNIEnv *env, jobject, jlong handle, jstring url) {
    auto player = playerFromHandle(handle);
    if (player) player->addSubtitleUrl(jstringToUtf8(env, url));
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_clearExternalSubtitles(JNIEnv *, jobject, jlong handle) {
    auto player = playerFromHandle(handle);
    if (player) player->removeExternalSubtitles();
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_clearExternalSubtitlesAndSelect(JNIEnv *, jobject, jlong handle, jint trackId) {
    auto player = playerFromHandle(handle);
    if (player) player->removeExternalSubtitlesAndSelect(trackId);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_applyWindowChrome(
    JNIEnv *,
    jobject,
    jlong windowHwnd,
    jboolean darkMode,
    jint captionColorRgb,
    jint borderColorRgb,
    jint textColorRgb
) {
    applyDwmWindowChrome(
        (HWND)(intptr_t)windowHwnd,
        darkMode == JNI_TRUE,
        rgbIntToColorRef(captionColorRgb),
        rgbIntToColorRef(borderColorRgb),
        rgbIntToColorRef(textColorRgb)
    );
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setSubtitleDelayMs(JNIEnv *, jobject, jlong handle, jint delayMs) {
    auto player = playerFromHandle(handle);
    if (player) player->setSubtitleDelayMs(delayMs);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_applySubtitleStyle(
    JNIEnv *env,
    jobject,
    jlong handle,
    jstring textColor,
    jstring backgroundColor,
    jstring outlineColor,
    jfloat outlineSize,
    jboolean bold,
    jfloat fontSize,
    jint subPos
) {
    auto player = playerFromHandle(handle);
    if (!player) return;
    player->applySubtitleStyle(
        jstringToUtf8(env, textColor),
        jstringToUtf8(env, backgroundColor),
        jstringToUtf8(env, outlineColor),
        outlineSize,
        bold == JNI_TRUE,
        fontSize,
        subPos
    );
}
