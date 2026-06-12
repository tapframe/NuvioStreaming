#import <Cocoa/Cocoa.h>
#import <IOKit/IOKitLib.h>
#define GL_SILENCE_DEPRECATION
#import <OpenGL/OpenGL.h>
#import <OpenGL/gl3.h>
#import <QuartzCore/QuartzCore.h>
#import <WebKit/WebKit.h>

#include <jni.h>
#include <mpv/client.h>
#include <mpv/render.h>
#include <mpv/render_gl.h>

#include <atomic>
#include <cmath>
#include <dlfcn.h>
#include <string>
#include <vector>

@class PlayerMetalView;
@class MpvWebPlayer;
@class NuvioPlayerOpenGLLayer;

@interface PlayerMetalView : NSView
- (double)edrMax;
- (double)hdrTargetPeakNits;
- (CGSize)drawableSize;
- (void)updateMetalLayerLayout;
- (void)refreshMetalLayerEdrState;
- (void)configureExtendedDynamicRange:(BOOL)enabled primaries:(NSString *)primaries targetPeakNits:(double)targetPeakNits;
- (BOOL)createMpvRenderContext:(mpv_handle *)mpv error:(NSString **)error;
- (void)destroyMpvRenderContext;
- (void)scheduleRenderUpdate;
- (void)setFullscreenTransitionActive:(BOOL)active;
@end

@interface NuvioMainThreadPriorityLock : NSObject
- (void)beforeLocking;
- (void)afterLocked;
@end

@interface NuvioPlayerOpenGLLayer : CAOpenGLLayer
@property(nonatomic, assign, getter=isNuvioLiveResize) BOOL nuvioLiveResize;
@property(nonatomic, assign, readonly) GLint bufferDepth;
- (instancetype)initWithOwner:(PlayerMetalView *)owner;
- (void)setMpvRenderContext:(mpv_render_context *)renderContext;
- (void)clearMpvRenderContext;
- (void)requestRender;
- (void)requestRenderForced:(BOOL)force;
- (void)lockAndSetContext;
- (void)unlockContext;
@end

@interface PlayerScriptHandler : NSObject <WKScriptMessageHandler>
@property(nonatomic, weak) MpvWebPlayer *player;
@end

@interface MpvWebPlayer : NSObject
- (instancetype)initWithHostView:(NSView *)hostView
                       sourceUrl:(NSString *)sourceUrl
                    headerLines:(NSArray<NSString *> *)headerLines
                   playWhenReady:(BOOL)playWhenReady
                initialPositionMs:(long long)initialPositionMs
                      controlsUrl:(NSString *)controlsUrl
                           javaVm:(JavaVM *)javaVm
                        eventSink:(jobject)eventSink
                      eventMethod:(jmethodID)eventMethod;
- (void)shutdown;
- (void)updateControlsJson:(NSString *)controlsJson;
- (void)setPaused:(BOOL)paused;
- (BOOL)isPaused;
- (void)seekToMilliseconds:(long long)positionMs;
- (void)seekByMilliseconds:(long long)offsetMs;
- (void)setSpeed:(double)speed;
- (double)speed;
- (void)setResizeMode:(int)mode;
- (long long)durationMs;
- (long long)positionMs;
- (long long)bufferedPositionMs;
- (BOOL)isLoading;
- (BOOL)isEnded;
- (NSString *)audioTracksJson;
- (NSString *)subtitleTracksJson;
- (void)selectAudioTrackId:(int)trackId;
- (void)selectSubtitleTrackId:(int)trackId;
- (void)addSubtitleUrl:(NSString *)url;
- (void)removeExternalSubtitles;
- (void)removeExternalSubtitlesAndSelect:(int)trackId;
- (void)setSubtitleDelayMs:(int)delayMs;
- (void)applySubtitleStyleWithTextColor:(NSString *)textColor
                        backgroundColor:(NSString *)backgroundColor
                            outlineColor:(NSString *)outlineColor
                             outlineSize:(double)outlineSize
                                    bold:(BOOL)bold
                                fontSize:(double)fontSize
                                  subPos:(int)subPos;
- (void)handleScriptMessage:(NSDictionary *)message;
- (void)focusControlsWebViewIfNeeded;
- (void)layoutNativeSubviews;
- (void)layoutControlsWebViewToBounds:(NSRect)bounds immediate:(BOOL)immediate;
- (void)hostViewBoundsDidChange:(NSNotification *)notification;
- (void)hostViewFrameDidChange:(NSNotification *)notification;
- (void)windowWillEnterFullScreen:(NSNotification *)notification;
- (void)windowDidEnterFullScreen:(NSNotification *)notification;
- (void)windowWillExitFullScreen:(NSNotification *)notification;
- (void)windowDidExitFullScreen:(NSNotification *)notification;
- (void)activateFullscreenTransitionWithReason:(NSString *)reason;
- (void)beginFullscreenTransitionWithReason:(NSString *)reason;
- (void)finishFullscreenTransitionWithReason:(NSString *)reason;
- (void)handleFullscreenTransitionTimer:(NSTimer *)timer;
- (void)schedulePostResizeRefreshWithReason:(NSString *)reason;
- (void)handleResizeSettleTimer:(NSTimer *)timer;
- (void)configureHdrForCurrentScreenWithReason:(NSString *)reason force:(BOOL)force;
- (void)applyHdrForPolledGamma:(NSString *)gamma primaries:(NSString *)primaries reason:(NSString *)reason force:(BOOL)force;
@end

typedef CFDictionaryRef (*CoreDisplayCreateInfoDictionaryFn)(CGDirectDisplayID displayId);

static void setBoolWithSelector(id target, NSString *selectorName, BOOL value) {
    SEL selector = NSSelectorFromString(selectorName);
    if (!target || !selector || ![target respondsToSelector:selector]) {
        return;
    }
    typedef void (*Setter)(id, SEL, BOOL);
    Setter setter = (Setter)[target methodForSelector:selector];
    setter(target, selector, value);
}

static double doubleWithSelector(id target, NSString *selectorName, double fallback) {
    SEL selector = NSSelectorFromString(selectorName);
    if (!target || !selector || ![target respondsToSelector:selector]) {
        return fallback;
    }
    typedef double (*Getter)(id, SEL);
    Getter getter = (Getter)[target methodForSelector:selector];
    return getter(target, selector);
}

static BOOL setLayerColorSpace(CALayer *layer, CGColorSpaceRef colorSpace) {
    SEL selector = NSSelectorFromString(@"setColorspace:");
    if (!layer || !colorSpace || ![layer respondsToSelector:selector]) {
        return NO;
    }
    typedef void (*Setter)(id, SEL, CGColorSpaceRef);
    Setter setter = (Setter)[layer methodForSelector:selector];
    setter(layer, selector, colorSpace);
    return YES;
}

static BOOL setLayerEdrMetadata(CALayer *layer, double minNits, double maxNits, double opticalOutputScale) {
    if (!layer || maxNits <= 0.0) {
        return NO;
    }

    Class edrMetadataClass = NSClassFromString(@"CAEDRMetadata");
    SEL selector = NSSelectorFromString(@"HDR10MetadataWithMinLuminance:maxLuminance:opticalOutputScale:");
    if (!edrMetadataClass || ![edrMetadataClass respondsToSelector:selector]) {
        return NO;
    }

    typedef id (*Factory)(id, SEL, float, float, float);
    Factory factory = (Factory)[edrMetadataClass methodForSelector:selector];
    id metadata = factory(edrMetadataClass, selector, (float)minNits, (float)maxNits, (float)opticalOutputScale);
    if (!metadata) {
        return NO;
    }

    SEL setterSelector = NSSelectorFromString(@"setEDRMetadata:");
    if (![layer respondsToSelector:setterSelector]) {
        return NO;
    }
    typedef void (*Setter)(id, SEL, id);
    Setter setter = (Setter)[layer methodForSelector:setterSelector];
    setter(layer, setterSelector, metadata);
    return YES;
}

static void clearLayerEdrMetadata(CALayer *layer) {
    SEL selector = NSSelectorFromString(@"setEDRMetadata:");
    if (!layer || ![layer respondsToSelector:selector]) {
        return;
    }
    typedef void (*Setter)(id, SEL, id);
    Setter setter = (Setter)[layer methodForSelector:selector];
    setter(layer, selector, nil);
}

static CGColorSpaceRef copyPqColorSpaceForPrimaries(NSString *primaries) {
    NSString *normalized = [[primaries ?: @"" lowercaseString] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    CFStringRef name = [normalized isEqualToString:@"display-p3"]
        ? kCGColorSpaceDisplayP3_PQ
        : kCGColorSpaceITUR_2100_PQ;
    return CGColorSpaceCreateWithName(name);
}

static NSString *diagnosticSize(CGSize size) {
    return [NSString stringWithFormat:@"%0.0fx%0.0f", size.width, size.height];
}

static NSString *diagnosticRect(NSRect rect) {
    return [NSString stringWithFormat:
        @"%0.0fx%0.0f@%0.0f,%0.0f",
        rect.size.width,
        rect.size.height,
        rect.origin.x,
        rect.origin.y
    ];
}

static CGDirectDisplayID displayIdForScreen(NSScreen *screen) {
    NSNumber *screenNumber = screen.deviceDescription[@"NSScreenNumber"];
    return screenNumber ? (CGDirectDisplayID)screenNumber.unsignedIntValue : CGMainDisplayID();
}

static double edrMaxForScreen(NSScreen *screen) {
    NSScreen *targetScreen = screen ?: NSScreen.mainScreen;
    double maxValue = doubleWithSelector(
        targetScreen,
        @"maximumPotentialExtendedDynamicRangeColorComponentValue",
        1.0
    );
    if (!std::isfinite(maxValue) || maxValue <= 0.0) {
        return 1.0;
    }
    return maxValue;
}

static CoreDisplayCreateInfoDictionaryFn coreDisplayInfoDictionaryFn(void) {
    static BOOL didLookup = NO;
    static CoreDisplayCreateInfoDictionaryFn fn = nullptr;
    if (!didLookup) {
        didLookup = YES;
        void *handle = dlopen(
            "/System/Library/Frameworks/CoreDisplay.framework/CoreDisplay",
            RTLD_LAZY | RTLD_LOCAL
        );
        fn = (CoreDisplayCreateInfoDictionaryFn)dlsym(
            handle ?: RTLD_DEFAULT,
            "CoreDisplay_DisplayCreateInfoDictionary"
        );
    }
    return fn;
}

static double doubleFromCoreDisplayValue(CFTypeRef value) {
    if (!value) {
        return 0.0;
    }
    CFTypeID typeId = CFGetTypeID(value);
    if (typeId == CFNumberGetTypeID()) {
        double result = 0.0;
        if (CFNumberGetValue((CFNumberRef)value, kCFNumberDoubleType, &result)) {
            return result;
        }
        return 0.0;
    }
    if (typeId == CFDictionaryGetTypeID()) {
        CFDictionaryRef dictionary = (CFDictionaryRef)value;
        double directPeak = doubleFromCoreDisplayValue(
            CFDictionaryGetValue(dictionary, CFSTR("NonReferencePeakHDRLuminance"))
        );
        if (directPeak > 0.0) {
            return directPeak;
        }
        return doubleFromCoreDisplayValue(
            CFDictionaryGetValue(dictionary, CFSTR("DisplayBacklight"))
        );
    }
    return 0.0;
}

static double coreDisplayPeakNitsForScreen(NSScreen *screen) {
    CoreDisplayCreateInfoDictionaryFn fn = coreDisplayInfoDictionaryFn();
    if (!fn) {
        return 0.0;
    }
    CFDictionaryRef info = fn(displayIdForScreen(screen ?: NSScreen.mainScreen));
    if (!info) {
        return 0.0;
    }
    double peak = doubleFromCoreDisplayValue(info);
    CFRelease(info);
    if (!std::isfinite(peak) || peak < 100.0 || peak > 10000.0) {
        return 0.0;
    }
    return peak;
}

static double fixedPointNitsFromRegistryValue(CFTypeRef value) {
    if (!value || CFGetTypeID(value) != CFNumberGetTypeID()) {
        return 0.0;
    }
    double raw = 0.0;
    if (!CFNumberGetValue((CFNumberRef)value, kCFNumberDoubleType, &raw) || raw <= 0.0) {
        return 0.0;
    }
    double nits = raw / 65536.0;
    if (!std::isfinite(nits) || nits < 100.0 || nits > 10000.0) {
        return 0.0;
    }
    return nits;
}

static double ioRegistryPeakNits(void) {
    CFMutableDictionaryRef matching = IOServiceMatching("IOMobileFramebufferShim");
    if (!matching) {
        return 0.0;
    }

    io_iterator_t iterator = IO_OBJECT_NULL;
    kern_return_t result = IOServiceGetMatchingServices(MACH_PORT_NULL, matching, &iterator);
    if (result != KERN_SUCCESS || iterator == IO_OBJECT_NULL) {
        return 0.0;
    }

    double peak = 0.0;
    io_object_t service = IO_OBJECT_NULL;
    while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
        CFTypeRef indicatorCap = IORegistryEntryCreateCFProperty(
            service,
            CFSTR("IOMFBIndicatorNitsCap"),
            kCFAllocatorDefault,
            0
        );
        peak = fmax(peak, fixedPointNitsFromRegistryValue(indicatorCap));
        if (indicatorCap) {
            CFRelease(indicatorCap);
        }

        CFTypeRef rtplcCap = IORegistryEntryCreateCFProperty(
            service,
            CFSTR("RTPLCBLNitsCap"),
            kCFAllocatorDefault,
            0
        );
        peak = fmax(peak, fixedPointNitsFromRegistryValue(rtplcCap));
        if (rtplcCap) {
            CFRelease(rtplcCap);
        }

        CFTypeRef backlightCap = IORegistryEntryCreateCFProperty(
            service,
            CFSTR("BLNitsCap"),
            kCFAllocatorDefault,
            0
        );
        peak = fmax(peak, fixedPointNitsFromRegistryValue(backlightCap));
        if (backlightCap) {
            CFRelease(backlightCap);
        }

        IOObjectRelease(service);
    }
    IOObjectRelease(iterator);
    return peak;
}

static double hdrTargetPeakNitsForScreen(NSScreen *screen) {
    double coreDisplayPeak = coreDisplayPeakNitsForScreen(screen);
    if (coreDisplayPeak > 0.0) {
        return coreDisplayPeak;
    }
    double registryPeak = ioRegistryPeakNits();
    if (registryPeak > 0.0) {
        return registryPeak;
    }
    double edrMax = edrMaxForScreen(screen);
    if (edrMax > 1.0) {
        return fmin(fmax(edrMax * 100.0, 100.0), 10000.0);
    }
    return 100.0;
}

static double hdrMetadataMaxNits(void) {
    return 1000.0;
}

static double normalizedHdrMetadataMaxNits(double targetPeakNits) {
    if (std::isfinite(targetPeakNits) && targetPeakNits >= 100.0 && targetPeakNits <= 10000.0) {
        return targetPeakNits;
    }
    return hdrMetadataMaxNits();
}

static CGLPixelFormatObj createPlayerOpenGLPixelFormat(GLint *bufferDepth) {
    CGLPixelFormatObj pixelFormat = nullptr;
    GLint pixelCount = 0;
    CGLPixelFormatAttribute hdrAttributes[] = {
        kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,
        kCGLPFAAccelerated,
        kCGLPFADoubleBuffer,
        kCGLPFAColorSize, (CGLPixelFormatAttribute)64,
        kCGLPFAColorFloat,
        kCGLPFANoRecovery,
        kCGLPFAAllowOfflineRenderers,
        (CGLPixelFormatAttribute)0
    };
    CGLError error = CGLChoosePixelFormat(hdrAttributes, &pixelFormat, &pixelCount);
    if (error == kCGLNoError && pixelFormat) {
        if (bufferDepth) {
            *bufferDepth = 16;
        }
        return pixelFormat;
    }

    CGLPixelFormatAttribute fallbackAttributes[] = {
        kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,
        kCGLPFAAccelerated,
        kCGLPFADoubleBuffer,
        kCGLPFAColorSize, (CGLPixelFormatAttribute)32,
        kCGLPFANoRecovery,
        kCGLPFAAllowOfflineRenderers,
        (CGLPixelFormatAttribute)0
    };
    pixelFormat = nullptr;
    pixelCount = 0;
    error = CGLChoosePixelFormat(fallbackAttributes, &pixelFormat, &pixelCount);
    if (error == kCGLNoError && pixelFormat) {
        if (bufferDepth) {
            *bufferDepth = 8;
        }
        return pixelFormat;
    }
    return nullptr;
}

static CGLContextObj createPlayerOpenGLContext(CGLPixelFormatObj pixelFormat) {
    CGLContextObj context = nullptr;
    if (!pixelFormat || CGLCreateContext(pixelFormat, nullptr, &context) != kCGLNoError || !context) {
        return nullptr;
    }
    GLint swapInterval = 1;
    CGLSetParameter(context, kCGLCPSwapInterval, &swapInterval);
    CGLEnable(context, kCGLCEMPEngine);
    return context;
}

static void *mpvOpenGLGetProcAddress(void *ctx, const char *name) {
    if (!name) {
        return nullptr;
    }
    CFBundleRef framework = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.opengl"));
    if (!framework) {
        return nullptr;
    }
    CFStringRef symbol = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingASCII);
    if (!symbol) {
        return nullptr;
    }
    void *address = CFBundleGetFunctionPointerForName(framework, symbol);
    CFRelease(symbol);
    return address;
}

@implementation NuvioMainThreadPriorityLock {
    NSCondition *_condition;
    BOOL _mainThreadNeedsLock;
}

- (instancetype)init {
    self = [super init];
    if (!self) {
        return nil;
    }
    _condition = [NSCondition new];
    return self;
}

- (void)beforeLocking {
    [_condition lock];
    if ([NSThread isMainThread]) {
        _mainThreadNeedsLock = YES;
    } else {
        while (_mainThreadNeedsLock) {
            [_condition wait];
        }
    }
    [_condition unlock];
}

- (void)afterLocked {
    if (![NSThread isMainThread]) {
        return;
    }
    [_condition lock];
    _mainThreadNeedsLock = NO;
    [_condition broadcast];
    [_condition unlock];
}

@end

@implementation NuvioPlayerOpenGLLayer {
    __weak PlayerMetalView *_owner;
    CGLPixelFormatObj _pixelFormat;
    CGLContextObj _glContext;
    dispatch_queue_t _renderQueue;
    NSRecursiveLock *_displayLock;
    NuvioMainThreadPriorityLock *_mainThreadPriorityLock;
    NSRecursiveLock *_renderLock;
    mpv_render_context *_renderContext;
    std::atomic_bool _needsFlip;
    std::atomic_bool _forceDraw;
    std::atomic_bool _renderQueued;
}

@synthesize nuvioLiveResize = _nuvioLiveResize;
@synthesize bufferDepth = _bufferDepth;

- (instancetype)initWithOwner:(PlayerMetalView *)owner {
    self = [super init];
    if (!self) {
        return nil;
    }
    _owner = owner;
    _renderQueue = dispatch_queue_create("com.nuvio.player.mpvgl", DISPATCH_QUEUE_SERIAL);
    dispatch_set_target_queue(_renderQueue, dispatch_get_global_queue(QOS_CLASS_USER_INTERACTIVE, 0));
    _displayLock = [NSRecursiveLock new];
    _mainThreadPriorityLock = [NuvioMainThreadPriorityLock new];
    _renderLock = [NSRecursiveLock new];
    _needsFlip.store(false);
    _forceDraw.store(false);
    _renderQueued.store(false);
    _pixelFormat = createPlayerOpenGLPixelFormat(&_bufferDepth);
    _glContext = createPlayerOpenGLContext(_pixelFormat);
    self.autoresizingMask = kCALayerWidthSizable | kCALayerHeightSizable;
    self.backgroundColor = NSColor.blackColor.CGColor;
    self.opaque = YES;
    self.asynchronous = NO;
    self.needsDisplayOnBoundsChange = YES;
    if (_bufferDepth > 8) {
        self.contentsFormat = kCAContentsFormatRGBA16Float;
    }
    return self;
}

- (void)dealloc {
    if (_glContext) {
        CGLReleaseContext(_glContext);
        _glContext = nullptr;
    }
    if (_pixelFormat) {
        CGLReleasePixelFormat(_pixelFormat);
        _pixelFormat = nullptr;
    }
}

- (void)setNuvioLiveResize:(BOOL)nuvioLiveResize {
    if (_nuvioLiveResize == nuvioLiveResize) {
        return;
    }
    _nuvioLiveResize = nuvioLiveResize;
    if (nuvioLiveResize) {
        self.asynchronous = YES;
        [self requestRenderForced:YES];
    } else {
        self.asynchronous = NO;
    }
}

- (CGLPixelFormatObj)copyCGLPixelFormatForDisplayMask:(uint32_t)mask {
    return _pixelFormat ? CGLRetainPixelFormat(_pixelFormat) : nullptr;
}

- (CGLContextObj)copyCGLContextForPixelFormat:(CGLPixelFormatObj)pixelFormat {
    return _glContext ? CGLRetainContext(_glContext) : nullptr;
}

- (BOOL)canDrawInCGLContext:(CGLContextObj)ctx
                pixelFormat:(CGLPixelFormatObj)pf
               forLayerTime:(CFTimeInterval)t
                displayTime:(const CVTimeStamp *)ts {
    if (_nuvioLiveResize && [NSThread isMainThread]) {
        return NO;
    }
    if (!_nuvioLiveResize) {
        self.asynchronous = NO;
    }

    return _forceDraw.load() || _needsFlip.load();
}

- (void)drawInCGLContext:(CGLContextObj)ctx
             pixelFormat:(CGLPixelFormatObj)pf
            forLayerTime:(CFTimeInterval)t
             displayTime:(const CVTimeStamp *)ts {
    [_renderLock lock];
    mpv_render_context *renderContext = _renderContext;
    _needsFlip.store(false);
    _forceDraw.store(false);
    if (!renderContext) {
        glClearColor(0.0, 0.0, 0.0, 1.0);
        glClear(GL_COLOR_BUFFER_BIT);
        glFlush();
        [_renderLock unlock];
        return;
    }

    GLint framebuffer = 0;
    glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &framebuffer);
    CGFloat scale = self.contentsScale > 0.0 ? self.contentsScale : 1.0;
    CGSize drawableSize = CGSizeMake(
        llround(self.bounds.size.width * scale),
        llround(self.bounds.size.height * scale)
    );
    if (drawableSize.width <= 1.0 || drawableSize.height <= 1.0) {
        glClearColor(0.0, 0.0, 0.0, 1.0);
        glClear(GL_COLOR_BUFFER_BIT);
        glFlush();
        [_renderLock unlock];
        return;
    }
    glViewport(0, 0, (GLsizei)drawableSize.width, (GLsizei)drawableSize.height);
    mpv_opengl_fbo fbo = {
        (int)framebuffer,
        (int)drawableSize.width,
        (int)drawableSize.height,
        0
    };
    int flipY = 1;
    int depth = (int)_bufferDepth;
    mpv_render_param params[] = {
        { MPV_RENDER_PARAM_OPENGL_FBO, &fbo },
        { MPV_RENDER_PARAM_FLIP_Y, &flipY },
        { MPV_RENDER_PARAM_DEPTH, &depth },
        { MPV_RENDER_PARAM_INVALID, nullptr }
    };
    mpv_render_context_render(renderContext, params);
    mpv_render_context_report_swap(renderContext);
    glFlush();
    [_renderLock unlock];
}

- (void)display {
    [_mainThreadPriorityLock beforeLocking];
    [_displayLock lock];
    [_mainThreadPriorityLock afterLocked];
    if ([NSThread isMainThread]) {
        [super display];
    } else {
        [CATransaction begin];
        [super display];
        [CATransaction commit];
    }
    [CATransaction flush];
    [_displayLock unlock];
}

- (void)setMpvRenderContext:(mpv_render_context *)renderContext {
    [_renderLock lock];
    _renderContext = renderContext;
    _forceDraw.store(true);
    [_renderLock unlock];
    [self requestRenderForced:YES];
}

- (void)clearMpvRenderContext {
    [_renderLock lock];
    _renderContext = nullptr;
    _needsFlip.store(false);
    _forceDraw.store(true);
    [_renderLock unlock];
}

- (void)requestRender {
    [self requestRenderForced:NO];
}

- (void)requestRenderForced:(BOOL)force {
    if (force) {
        _forceDraw.store(true);
    }
    _needsFlip.store(true);
    bool expected = false;
    if (!_renderQueued.compare_exchange_strong(expected, true)) {
        return;
    }

    dispatch_async(_renderQueue, ^{
        self->_renderQueued.store(false);
        [self display];
    });
}

- (void)lockAndSetContext {
    if (!_glContext) {
        return;
    }
    CGLLockContext(_glContext);
    CGLSetCurrentContext(_glContext);
}

- (void)unlockContext {
    if (!_glContext) {
        return;
    }
    CGLUnlockContext(_glContext);
}

@end

static void mpvRenderUpdateCallback(void *callbackContext) {
    PlayerMetalView *view = (__bridge PlayerMetalView *)callbackContext;
    [view scheduleRenderUpdate];
}

@implementation PlayerMetalView {
    NuvioPlayerOpenGLLayer *_openGLLayer;
    mpv_render_context *_mpvRenderContext;
    BOOL _hasConfiguredEdr;
    BOOL _edrEnabled;
    BOOL _fullscreenTransitionActive;
    NSString *_edrPrimaries;
    NSString *_lastAppliedEdrLayerKey;
    double _edrMetadataMaxNits;
}

- (instancetype)initWithFrame:(NSRect)frameRect {
    self = [super initWithFrame:frameRect];
    if (!self) {
        return nil;
    }

    self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.wantsLayer = YES;
    _openGLLayer = [[NuvioPlayerOpenGLLayer alloc] initWithOwner:self];
    _openGLLayer.frame = self.bounds;
    _openGLLayer.contentsGravity = kCAGravityResize;
    self.layer = _openGLLayer;
    [self updateMetalLayerLayout];
    return self;
}

- (BOOL)isOpaque {
    return YES;
}

- (CALayer *)makeBackingLayer {
    return _openGLLayer ?: [[NuvioPlayerOpenGLLayer alloc] initWithOwner:self];
}

- (void)layout {
    [super layout];
    [self updateMetalLayerLayout];
}

- (void)setFrameSize:(NSSize)newSize {
    [super setFrameSize:newSize];
    [self updateMetalLayerLayout];
}

- (void)setBoundsSize:(NSSize)newSize {
    [super setBoundsSize:newSize];
    [self updateMetalLayerLayout];
}

- (void)viewDidMoveToWindow {
    [super viewDidMoveToWindow];
    [self updateMetalLayerLayout];
    setBoolWithSelector(self, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(self.window, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(self.window.contentView, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(_openGLLayer, @"setWantsExtendedDynamicRangeContent:", YES);
}

- (void)viewWillStartLiveResize {
    [super viewWillStartLiveResize];
    _openGLLayer.nuvioLiveResize = YES;
}

- (void)viewDidEndLiveResize {
    [super viewDidEndLiveResize];
    // The bridge clears resize mode on its settle timer, after AppKit has
    // finished the release/fullscreen layout burst.
}

- (void)setFullscreenTransitionActive:(BOOL)active {
    _fullscreenTransitionActive = active;
    BOOL transitionLike = active || self.inLiveResize || self.window.inLiveResize;
    _openGLLayer.nuvioLiveResize = transitionLike;
    if (!transitionLike) {
        [self updateMetalLayerLayout];
        [_openGLLayer requestRenderForced:YES];
    }
}

- (void)updateMetalLayerLayout {
    if (!_openGLLayer) {
        return;
    }

    NSSize boundsSize = self.bounds.size;
    if (boundsSize.width <= 1.0 || boundsSize.height <= 1.0) {
        return;
    }

    CGFloat scale = self.window.backingScaleFactor > 0.0
        ? self.window.backingScaleFactor
        : NSScreen.mainScreen.backingScaleFactor;
    BOOL liveResize = self.inLiveResize || self.window.inLiveResize || _fullscreenTransitionActive;
    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    _openGLLayer.nuvioLiveResize = liveResize;
    _openGLLayer.contentsScale = scale;
    _openGLLayer.frame = self.bounds;
    if (!liveResize) {
        [self refreshMetalLayerEdrState];
        [_openGLLayer requestRenderForced:NO];
    }
    [CATransaction commit];
}

- (void)refreshMetalLayerEdrState {
    if (!_hasConfiguredEdr || !_openGLLayer) {
        return;
    }
    NSString *stateKey = [NSString stringWithFormat:
        @"%@:%@:%0.0f",
        _edrEnabled ? @"hdr" : @"sdr",
        _edrPrimaries ?: @"auto",
        normalizedHdrMetadataMaxNits(_edrMetadataMaxNits)
    ];
    if (_lastAppliedEdrLayerKey && [_lastAppliedEdrLayerKey isEqualToString:stateKey]) {
        return;
    }

    setBoolWithSelector(self, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(self.window, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(self.window.contentView, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(_openGLLayer, @"setWantsExtendedDynamicRangeContent:", YES);

    CGColorSpaceRef colorSpace = _edrEnabled
        ? copyPqColorSpaceForPrimaries(_edrPrimaries)
        : CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    if (colorSpace) {
        setLayerColorSpace(_openGLLayer, colorSpace);
        CGColorSpaceRelease(colorSpace);
    }

    if (_edrEnabled) {
        setLayerEdrMetadata(_openGLLayer, 0.0, normalizedHdrMetadataMaxNits(_edrMetadataMaxNits), 1.0);
    } else {
        clearLayerEdrMetadata(_openGLLayer);
    }
    _lastAppliedEdrLayerKey = [stateKey copy];
    [_openGLLayer requestRender];
}

- (void)configureExtendedDynamicRange:(BOOL)enabled primaries:(NSString *)primaries targetPeakNits:(double)targetPeakNits {
    _hasConfiguredEdr = YES;
    _edrEnabled = enabled;
    _edrPrimaries = [primaries copy];
    _edrMetadataMaxNits = enabled ? normalizedHdrMetadataMaxNits(targetPeakNits) : hdrMetadataMaxNits();
    _lastAppliedEdrLayerKey = nil;

    setBoolWithSelector(self, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(self.window, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(self.window.contentView, @"setWantsExtendedDynamicRangeContent:", YES);
    setBoolWithSelector(_openGLLayer, @"setWantsExtendedDynamicRangeContent:", YES);

    CGColorSpaceRef colorSpace = enabled
        ? copyPqColorSpaceForPrimaries(primaries)
        : CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    if (colorSpace) {
        setLayerColorSpace(_openGLLayer, colorSpace);
    }
    if (colorSpace) {
        CGColorSpaceRelease(colorSpace);
    }

    if (enabled) {
        setLayerEdrMetadata(_openGLLayer, 0.0, _edrMetadataMaxNits, 1.0);
    } else {
        clearLayerEdrMetadata(_openGLLayer);
    }
    _lastAppliedEdrLayerKey = [[NSString stringWithFormat:
        @"%@:%@:%0.0f",
        enabled ? @"hdr" : @"sdr",
        primaries ?: @"auto",
        _edrMetadataMaxNits
    ] copy];
    [_openGLLayer requestRender];
}

- (BOOL)createMpvRenderContext:(mpv_handle *)mpv error:(NSString **)error {
    if (_mpvRenderContext) {
        return YES;
    }
    if (!_openGLLayer) {
        if (error) {
            *error = @"OpenGL layer unavailable";
        }
        return NO;
    }

    [_openGLLayer lockAndSetContext];
    const char *apiType = MPV_RENDER_API_TYPE_OPENGL;
    mpv_opengl_init_params initParams = {
        mpvOpenGLGetProcAddress,
        nullptr
    };
    mpv_render_param params[] = {
        { MPV_RENDER_PARAM_API_TYPE, (void *)apiType },
        { MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &initParams },
        { MPV_RENDER_PARAM_INVALID, nullptr }
    };
    int result = mpv_render_context_create(&_mpvRenderContext, mpv, params);
    [_openGLLayer unlockContext];
    if (result < 0) {
        if (error) {
            *error = [NSString stringWithFormat:@"mpv_render_context_create failed: %s", mpv_error_string(result)];
        }
        return NO;
    }

    [_openGLLayer setMpvRenderContext:_mpvRenderContext];
    mpv_render_context_set_update_callback(
        _mpvRenderContext,
        mpvRenderUpdateCallback,
        (__bridge void *)self
    );
    return YES;
}

- (void)destroyMpvRenderContext {
    if (!_mpvRenderContext) {
        return;
    }
    mpv_render_context *renderContext = _mpvRenderContext;
    _mpvRenderContext = nullptr;
    mpv_render_context_set_update_callback(renderContext, nullptr, nullptr);
    [_openGLLayer clearMpvRenderContext];
    [_openGLLayer lockAndSetContext];
    mpv_render_context_free(renderContext);
    [_openGLLayer unlockContext];
}

- (void)scheduleRenderUpdate {
    [_openGLLayer requestRender];
}

- (double)edrMax {
    return edrMaxForScreen(self.window.screen ?: NSScreen.mainScreen);
}

- (double)hdrTargetPeakNits {
    return hdrTargetPeakNitsForScreen(self.window.screen ?: NSScreen.mainScreen);
}

- (CGSize)drawableSize {
    if (!_openGLLayer) {
        return CGSizeZero;
    }
    CGFloat scale = _openGLLayer.contentsScale > 0.0 ? _openGLLayer.contentsScale : 1.0;
    return CGSizeMake(
        llround(_openGLLayer.bounds.size.width * scale),
        llround(_openGLLayer.bounds.size.height * scale)
    );
}

@end

@implementation PlayerScriptHandler
- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    if ([message.body isKindOfClass:[NSDictionary class]]) {
        [self.player handleScriptMessage:(NSDictionary *)message.body];
    }
}
@end

static NSString *javaScriptStringLiteral(NSString *value) {
    NSArray *array = @[value ?: @""];
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:array options:0 error:&error];
    if (!data) {
        return @"\"\"";
    }
    NSString *jsonArray = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (jsonArray.length < 2) {
        return @"\"\"";
    }
    return [jsonArray substringWithRange:NSMakeRange(1, jsonArray.length - 2)];
}

static void setMpvOptionString(mpv_handle *mpv, const char *name, const char *value) {
    mpv_set_option_string(mpv, name, value);
}

@implementation MpvWebPlayer {
    NSView *_hostView;
    PlayerMetalView *_videoView;
    WKWebView *_webView;
    PlayerScriptHandler *_scriptHandler;
    mpv_handle *_mpv;
    NSTimer *_timer;
    NSTimer *_resizeSettleTimer;
    NSTimer *_fullscreenTransitionTimer;
    JavaVM *_javaVm;
    jobject _eventSink;
    jmethodID _eventMethod;
    NSString *_lastConfiguredHdrKey;
    NSString *_lastResizeRefreshKey;
    dispatch_queue_t _mpvEventQueue;
    BOOL _didFocusControlsWebView;
    BOOL _controlsWebReady;
    BOOL _fullscreenTransitionActive;
    NSString *_pendingControlsJson;
    double _initialStartSeconds;
    BOOL _controlsSyncInFlight;
    NSRect _lastAppliedNativeLayoutBounds;
    BOOL _lastAppliedNativeLayoutWasLiveResize;
    NSTimeInterval _lightweightResizeSettleUntil;
    NSSize _lastControlsViewportNudgeSize;
    NSTimeInterval _lastControlsViewportNudgeAt;
    std::atomic<double> _cachedDurationSeconds;
    std::atomic<double> _cachedPositionSeconds;
    std::atomic<double> _cachedCacheAheadSeconds;
    std::atomic<double> _cachedSpeed;
    std::atomic_bool _cachedPaused;
    std::atomic_bool _cachedLoading;
    std::atomic_bool _cachedEnded;
}

- (instancetype)initWithHostView:(NSView *)hostView
                       sourceUrl:(NSString *)sourceUrl
                    headerLines:(NSArray<NSString *> *)headerLines
                   playWhenReady:(BOOL)playWhenReady
                initialPositionMs:(long long)initialPositionMs
                      controlsUrl:(NSString *)controlsUrl
                           javaVm:(JavaVM *)javaVm
                        eventSink:(jobject)eventSink
                      eventMethod:(jmethodID)eventMethod {
    self = [super init];
    if (!self) {
        return nil;
    }

    _cachedDurationSeconds.store(0.0);
    _cachedPositionSeconds.store(initialPositionMs > 0 ? (double)initialPositionMs / 1000.0 : 0.0);
    _cachedCacheAheadSeconds.store(0.0);
    _cachedSpeed.store(1.0);
    _cachedPaused.store(!playWhenReady);
    _cachedLoading.store(true);
    _cachedEnded.store(false);
    _mpvEventQueue = dispatch_queue_create("com.nuvio.desktop.mpv-events", DISPATCH_QUEUE_SERIAL);
    _javaVm = javaVm;
    _eventSink = eventSink;
    _eventMethod = eventMethod;

    _hostView = hostView;
    _hostView.wantsLayer = YES;
    _hostView.layer.backgroundColor = NSColor.blackColor.CGColor;
    [_hostView setPostsFrameChangedNotifications:YES];
    [_hostView setPostsBoundsChangedNotifications:YES];

    _videoView = [[PlayerMetalView alloc] initWithFrame:_hostView.bounds];
    [_hostView addSubview:_videoView];

    _scriptHandler = [PlayerScriptHandler new];
    _scriptHandler.player = self;
    WKUserContentController *contentController = [WKUserContentController new];
    [contentController addScriptMessageHandler:_scriptHandler name:@"player"];

    WKWebViewConfiguration *configuration = [WKWebViewConfiguration new];
    configuration.userContentController = contentController;
    _webView = [[WKWebView alloc] initWithFrame:_hostView.bounds configuration:configuration];
    _webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _webView.wantsLayer = YES;
    [_webView setValue:@NO forKey:@"drawsBackground"];
    [_hostView addSubview:_webView positioned:NSWindowAbove relativeTo:_videoView];
    NSURL *controlsURL = [NSURL URLWithString:controlsUrl ?: @""];
    if (!controlsURL) {
        @throw [NSException exceptionWithName:@"PlayerBridgeError"
                                       reason:@"Invalid native player controls URL."
                                     userInfo:nil];
    }
    if (controlsURL.isFileURL) {
        [_webView loadFileURL:controlsURL allowingReadAccessToURL:[controlsURL URLByDeletingLastPathComponent]];
    } else {
        [_webView loadRequest:[NSURLRequest requestWithURL:controlsURL]];
    }
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(hostViewFrameDidChange:)
                                                 name:NSViewFrameDidChangeNotification
                                               object:_hostView];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(hostViewBoundsDidChange:)
                                                 name:NSViewBoundsDidChangeNotification
                                               object:_hostView];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowWillEnterFullScreen:)
                                                 name:NSWindowWillEnterFullScreenNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowDidEnterFullScreen:)
                                                 name:NSWindowDidEnterFullScreenNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowWillExitFullScreen:)
                                                 name:NSWindowWillExitFullScreenNotification
                                               object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowDidExitFullScreen:)
                                                 name:NSWindowDidExitFullScreenNotification
                                               object:nil];
    [self layoutNativeSubviews];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self focusControlsWebViewIfNeeded];
    });

    [self startMpvWithSource:sourceUrl
                 headerLines:headerLines
                playWhenReady:playWhenReady
             initialPositionMs:initialPositionMs];
    _timer = [NSTimer scheduledTimerWithTimeInterval:0.5
                                             target:self
                                           selector:@selector(syncControls)
                                           userInfo:nil
                                            repeats:YES];
    return self;
}

- (void)focusControlsWebViewIfNeeded {
    if (_didFocusControlsWebView || !_webView || !_webView.window) {
        return;
    }
    _didFocusControlsWebView = YES;
    [_webView.window makeFirstResponder:_webView];
}

- (void)layoutControlsWebViewToBounds:(NSRect)bounds immediate:(BOOL)immediate {
    if (!_webView) {
        return;
    }

    if (!NSEqualRects(_webView.frame, bounds)) {
        _webView.frame = bounds;
    }
    if (!immediate) {
        return;
    }

    [_webView setNeedsLayout:YES];
    [_webView layoutSubtreeIfNeeded];
    [_webView setNeedsDisplay:YES];

    NSTimeInterval now = NSDate.timeIntervalSinceReferenceDate;
    BOOL sizeChanged = !NSEqualSizes(_lastControlsViewportNudgeSize, bounds.size);
    if (!_controlsWebReady || !sizeChanged || now - _lastControlsViewportNudgeAt < 0.05) {
        return;
    }

    _lastControlsViewportNudgeSize = bounds.size;
    _lastControlsViewportNudgeAt = now;
    NSString *script = @"window.nuvioNativeViewportChanged ? window.nuvioNativeViewportChanged() : window.dispatchEvent(new Event('resize'));";
    [_webView evaluateJavaScript:script completionHandler:nil];
}

- (void)layoutNativeSubviews {
    if (!_hostView) {
        return;
    }
    NSRect bounds = _hostView.bounds;
    if (bounds.size.width <= 0.0 || bounds.size.height <= 0.0) {
        return;
    }

    NSTimeInterval now = NSDate.timeIntervalSinceReferenceDate;
    BOOL nativeLiveResize = _hostView.inLiveResize || _hostView.window.inLiveResize;
    BOOL wasResizeLikeLayout = _lastAppliedNativeLayoutWasLiveResize
        || _fullscreenTransitionActive
        || (_lightweightResizeSettleUntil > now);
    BOOL hasPreviousBounds = _lastAppliedNativeLayoutBounds.size.width > 1.0
        && _lastAppliedNativeLayoutBounds.size.height > 1.0;
    if (!_fullscreenTransitionActive && !nativeLiveResize && hasPreviousBounds && !NSEqualRects(bounds, _lastAppliedNativeLayoutBounds)) {
        double previousArea = _lastAppliedNativeLayoutBounds.size.width * _lastAppliedNativeLayoutBounds.size.height;
        double currentArea = bounds.size.width * bounds.size.height;
        double areaRatio = previousArea > 1.0 ? currentArea / previousArea : 1.0;
        CGFloat widthDelta = fabs(bounds.size.width - _lastAppliedNativeLayoutBounds.size.width);
        CGFloat heightDelta = fabs(bounds.size.height - _lastAppliedNativeLayoutBounds.size.height);
        if (areaRatio > 1.75 || areaRatio < 0.60 || widthDelta > 480.0 || heightDelta > 320.0) {
            [self activateFullscreenTransitionWithReason:@"layout-jump"];
        }
    }

    BOOL liveResize = nativeLiveResize || _fullscreenTransitionActive;
    BOOL settlingFromResize = !liveResize && wasResizeLikeLayout;
    if (liveResize
        && _lastAppliedNativeLayoutWasLiveResize
        && NSEqualRects(bounds, _lastAppliedNativeLayoutBounds)) {
        return;
    }
    if (liveResize || settlingFromResize) {
        _lightweightResizeSettleUntil = now + 0.45;
    }
    _lastAppliedNativeLayoutBounds = bounds;
    _lastAppliedNativeLayoutWasLiveResize = liveResize;

    [CATransaction begin];
    [CATransaction setDisableActions:YES];
    if (_videoView) {
        if (liveResize || settlingFromResize) {
            [_videoView setFullscreenTransitionActive:YES];
        }
        if (!NSEqualRects(_videoView.frame, bounds)) {
            _videoView.frame = bounds;
        }
        if (!liveResize && !settlingFromResize) {
            [_videoView setNeedsLayout:YES];
            [_videoView layoutSubtreeIfNeeded];
            [_videoView updateMetalLayerLayout];
        }
    }
    if (_webView) {
        BOOL immediateControlsLayout = _fullscreenTransitionActive || settlingFromResize || (!liveResize && !settlingFromResize);
        [self layoutControlsWebViewToBounds:bounds immediate:immediateControlsLayout];
    }
    [CATransaction commit];

    if (liveResize || settlingFromResize) {
        if (_mpv) {
            [self schedulePostResizeRefreshWithReason:liveResize ? @"live-layout" : @"settle-layout"];
        }
        return;
    }

    CGSize currentDrawableSize = _videoView ? [_videoView drawableSize] : CGSizeZero;
    NSString *resizeKey = [NSString stringWithFormat:
        @"%@:%@:%@:%@",
        diagnosticRect(bounds),
        _videoView ? diagnosticRect(_videoView.frame) : @"none",
        _webView ? diagnosticRect(_webView.frame) : @"none",
        diagnosticSize(currentDrawableSize)
    ];
    if (!_lastResizeRefreshKey || ![_lastResizeRefreshKey isEqualToString:resizeKey]) {
        _lastResizeRefreshKey = resizeKey;
        if (_mpv) {
            [self schedulePostResizeRefreshWithReason:@"layout"];
        }
    }
}

- (void)hostViewFrameDidChange:(NSNotification *)notification {
    [self layoutNativeSubviews];
}

- (void)hostViewBoundsDidChange:(NSNotification *)notification {
    [self layoutNativeSubviews];
}

- (BOOL)notificationBelongsToHostWindow:(NSNotification *)notification {
    NSWindow *window = [notification.object isKindOfClass:[NSWindow class]] ? (NSWindow *)notification.object : nil;
    return window && _hostView.window && window == _hostView.window;
}

- (void)windowWillEnterFullScreen:(NSNotification *)notification {
    if (![self notificationBelongsToHostWindow:notification]) {
        return;
    }
    [self beginFullscreenTransitionWithReason:@"will-enter-fullscreen"];
}

- (void)windowDidEnterFullScreen:(NSNotification *)notification {
    if (![self notificationBelongsToHostWindow:notification]) {
        return;
    }
    [self finishFullscreenTransitionWithReason:@"did-enter-fullscreen"];
}

- (void)windowWillExitFullScreen:(NSNotification *)notification {
    if (![self notificationBelongsToHostWindow:notification]) {
        return;
    }
    [self beginFullscreenTransitionWithReason:@"will-exit-fullscreen"];
}

- (void)windowDidExitFullScreen:(NSNotification *)notification {
    if (![self notificationBelongsToHostWindow:notification]) {
        return;
    }
    [self finishFullscreenTransitionWithReason:@"did-exit-fullscreen"];
}

- (void)activateFullscreenTransitionWithReason:(NSString *)reason {
    _fullscreenTransitionActive = YES;
    [_fullscreenTransitionTimer invalidate];
    [_videoView setFullscreenTransitionActive:YES];
    _fullscreenTransitionTimer = [NSTimer scheduledTimerWithTimeInterval:1.25
                                                                  target:self
                                                                selector:@selector(handleFullscreenTransitionTimer:)
                                                                userInfo:reason ?: @"unknown"
                                                                 repeats:NO];
}

- (void)beginFullscreenTransitionWithReason:(NSString *)reason {
    [self activateFullscreenTransitionWithReason:reason];
    [self layoutNativeSubviews];
}

- (void)finishFullscreenTransitionWithReason:(NSString *)reason {
    if (!_fullscreenTransitionActive && !_fullscreenTransitionTimer) {
        return;
    }
    [_fullscreenTransitionTimer invalidate];
    _fullscreenTransitionTimer = nil;
    _fullscreenTransitionActive = NO;
    [self layoutNativeSubviews];
    [_resizeSettleTimer invalidate];
    _resizeSettleTimer = nil;
    if (_mpv) {
        NSString *refreshReason = [NSString stringWithFormat:@"fullscreen/%@", reason ?: @"unknown"];
        [self schedulePostResizeRefreshWithReason:refreshReason];
    }
}

- (void)handleFullscreenTransitionTimer:(NSTimer *)timer {
    [self finishFullscreenTransitionWithReason:[NSString stringWithFormat:@"timer/%@", timer.userInfo ?: @"unknown"]];
}

- (void)schedulePostResizeRefreshWithReason:(NSString *)reason {
    if (!_mpv || !_videoView) {
        return;
    }
    [_resizeSettleTimer invalidate];
    _resizeSettleTimer = [NSTimer scheduledTimerWithTimeInterval:0.35
                                                          target:self
                                                        selector:@selector(handleResizeSettleTimer:)
                                                        userInfo:reason ?: @"unknown"
                                                         repeats:NO];
}

- (void)handleResizeSettleTimer:(NSTimer *)timer {
    _resizeSettleTimer = nil;
    if (!_mpv || !_videoView) {
        return;
    }
    if (_hostView.inLiveResize || _hostView.window.inLiveResize || _fullscreenTransitionActive) {
        [self schedulePostResizeRefreshWithReason:timer.userInfo ?: @"unknown"];
        return;
    }
    _lightweightResizeSettleUntil = 0.0;
    [self layoutControlsWebViewToBounds:_hostView.bounds immediate:YES];
    [_videoView setFullscreenTransitionActive:NO];
    [_videoView updateMetalLayerLayout];
    NSString *reason = [NSString stringWithFormat:@"resize-settled/%@", timer.userInfo ?: @"unknown"];
    [self configureHdrForCurrentScreenWithReason:reason force:NO];
}

- (void)startMpvWithSource:(NSString *)sourceUrl
               headerLines:(NSArray<NSString *> *)headerLines
              playWhenReady:(BOOL)playWhenReady
           initialPositionMs:(long long)initialPositionMs {
    _mpv = mpv_create();
    if (!_mpv) {
        @throw [NSException exceptionWithName:@"PlayerBridgeError"
                                       reason:@"mpv_create failed"
                                     userInfo:nil];
    }
    _initialStartSeconds = initialPositionMs > 0 ? (double)initialPositionMs / 1000.0 : 0.0;

    setMpvOptionString(_mpv, "config", "no");
    setMpvOptionString(_mpv, "osc", "no");
    setMpvOptionString(_mpv, "input-default-bindings", "yes");
    setMpvOptionString(_mpv, "input-vo-keyboard", "no");
    setMpvOptionString(_mpv, "keep-open", "yes");
    setMpvOptionString(_mpv, "vo", "libmpv");
    setMpvOptionString(_mpv, "hwdec", "auto");
    setMpvOptionString(_mpv, "gpu-hwdec-interop", "auto");
    setMpvOptionString(_mpv, "hwdec-codecs", "all");
    setMpvOptionString(_mpv, "vd-lavc-software-fallback", "yes");
    setMpvOptionString(_mpv, "vd-lavc-threads", "4");
    setMpvOptionString(_mpv, "target-colorspace-hint", "yes");
    setMpvOptionString(_mpv, "target-colorspace-hint-mode", "source");
    setMpvOptionString(_mpv, "target-colorspace-hint-strict", "no");
    setMpvOptionString(_mpv, "tone-mapping", "auto");
    setMpvOptionString(_mpv, "hdr-compute-peak", "no");
    setMpvOptionString(_mpv, "dither-depth", "auto");
    setMpvOptionString(_mpv, "deband", "yes");
    setMpvOptionString(_mpv, "scale", "spline36");
    setMpvOptionString(_mpv, "cscale", "spline36");
    setMpvOptionString(_mpv, "demuxer-max-bytes", "64MiB");
    setMpvOptionString(_mpv, "demuxer-max-back-bytes", "16MiB");
    setMpvOptionString(_mpv, "demuxer-seekable-cache", "no");
    setMpvOptionString(_mpv, "cache-secs", "30");
    setMpvOptionString(_mpv, "hr-seek", "no");

    if (headerLines.count > 0) {
        NSString *headers = [headerLines componentsJoinedByString:@","];
        setMpvOptionString(_mpv, "http-header-fields", headers.UTF8String);
    }

    int initResult = mpv_initialize(_mpv);
    if (initResult < 0) {
        NSString *reason = [NSString stringWithFormat:@"mpv_initialize failed: %s", mpv_error_string(initResult)];
        @throw [NSException exceptionWithName:@"PlayerBridgeError" reason:reason userInfo:nil];
    }

    NSString *renderError = nil;
    if (![_videoView createMpvRenderContext:_mpv error:&renderError]) {
        NSString *reason = renderError ?: @"mpv render context failed";
        @throw [NSException exceptionWithName:@"PlayerBridgeError" reason:reason userInfo:nil];
    }

    std::vector<const char *> command = {"loadfile", sourceUrl.UTF8String};
    std::string loadOptions;
    if (initialPositionMs > 0) {
        char startBuffer[64];
        snprintf(startBuffer, sizeof(startBuffer), "start=%.3f", (double)initialPositionMs / 1000.0);
        loadOptions = startBuffer;
        command.push_back("replace");
        command.push_back("-1");
        command.push_back(loadOptions.c_str());
    }
    command.push_back(NULL);
    int commandResult = mpv_command(_mpv, command.data());
    if (commandResult < 0) {
        NSString *reason = [NSString stringWithFormat:@"mpv loadfile failed: %s", mpv_error_string(commandResult)];
        @throw [NSException exceptionWithName:@"PlayerBridgeError" reason:reason userInfo:nil];
    }

    [self setPaused:!playWhenReady];
}

- (void)syncControls {
    if (!_webView || !_mpv) {
        return;
    }
    [self layoutNativeSubviews];
    [self focusControlsWebViewIfNeeded];
    if (_controlsSyncInFlight || !_mpvEventQueue) {
        return;
    }
    _controlsSyncInFlight = YES;

    mpv_handle *mpv = _mpv;
    dispatch_async(_mpvEventQueue, ^{
        @autoreleasepool {
            if (self->_mpv != mpv) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    self->_controlsSyncInFlight = NO;
                });
                return;
            }

            double duration = [self doubleProperty:"duration" fallback:0.0];
            double position = [self doubleProperty:"time-pos" fallback:0.0];
            double cacheAhead = [self cacheAheadSecondsForPosition:position];
            BOOL paused = [self rawIsPaused];
            BOOL ended = [self rawIsEnded];
            BOOL loading = [self rawLoadingWithPaused:paused ended:ended duration:duration];
            double speed = [self rawSpeed];
            NSString *audioTracks = [self audioTracksJson] ?: @"[]";
            NSString *subtitleTracks = [self subtitleTracksJson] ?: @"[]";
            NSString *gamma = [[self stringProperty:"video-params/gamma" fallback:@""] lowercaseString];
            NSString *primaries = [[self stringProperty:"video-params/primaries" fallback:@""] lowercaseString];
            [self updateCachedDuration:duration
                              position:position
                            cacheAhead:cacheAhead
                                paused:paused
                                 loading:loading
                                   ended:ended
                                   speed:speed];

            dispatch_async(dispatch_get_main_queue(), ^{
                self->_controlsSyncInFlight = NO;
                if (!self->_webView || self->_mpv != mpv) {
                    return;
                }
                [self applyHdrForPolledGamma:gamma primaries:primaries reason:@"sync" force:NO];
                NSString *script = [NSString stringWithFormat:
                    @"window.playerUpdate({duration:%0.3f,position:%0.3f,paused:%@,loading:%@,audioTracks:%@,subtitleTracks:%@})",
                    duration,
                    position,
                    paused ? @"true" : @"false",
                    loading ? @"true" : @"false",
                    audioTracks,
                    subtitleTracks];
                [self->_webView evaluateJavaScript:script completionHandler:nil];
            });
        }
    });
}

- (void)configureHdrForCurrentScreenIfNeeded {
    [self configureHdrForCurrentScreenWithReason:@"legacy" force:NO];
}

- (void)configureHdrForCurrentScreenWithReason:(NSString *)reason force:(BOOL)force {
    if (!_mpv || !_videoView) {
        return;
    }
    NSString *gamma = [[self stringProperty:"video-params/gamma" fallback:@""] lowercaseString];
    NSString *primaries = [[self stringProperty:"video-params/primaries" fallback:@""] lowercaseString];
    if (gamma.length == 0 && primaries.length == 0) {
        return;
    }

    BOOL isPq = [gamma containsString:@"pq"]
        || [gamma containsString:@"2084"]
        || [gamma containsString:@"st2084"];
    BOOL isHlg = [gamma containsString:@"hlg"];
    double edrMax = [_videoView edrMax];
    double screenPeak = [_videoView hdrTargetPeakNits];
    BOOL hdrDetected = (isPq || isHlg) && edrMax > 1.0;
    NSString *targetPrimaries = hdrDetected && primaries.length > 0 ? primaries : @"auto";
    NSString *stateKey = [NSString stringWithFormat:
        @"%@:%@:%@:%0.2f:%0.0f",
        hdrDetected ? @"native-opengl-edr" : @"sdr",
        gamma ?: @"",
        targetPrimaries,
        edrMax,
        screenPeak
    ];
    if (!force && _lastConfiguredHdrKey && [_lastConfiguredHdrKey isEqualToString:stateKey]) {
        return;
    }
    _lastConfiguredHdrKey = stateKey;

    double targetPeakNits = normalizedHdrMetadataMaxNits(screenPeak);
    [_videoView configureExtendedDynamicRange:hdrDetected primaries:targetPrimaries targetPeakNits:targetPeakNits];
    NSString *targetTransfer = hdrDetected ? @"pq" : @"auto";
    NSString *toneMapping = hdrDetected ? @"" : @"auto";
    NSString *targetPeak = hdrDetected ? [NSString stringWithFormat:@"%.0f", targetPeakNits] : @"auto";
    [self setStringProperty:"target-colorspace-hint" value:@"yes"];
    [self setStringProperty:"target-colorspace-hint-mode" value:hdrDetected ? @"source" : @"target"];
    [self setStringProperty:"target-colorspace-hint-strict" value:@"no"];
    [self setStringProperty:"tone-mapping" value:toneMapping];
    [self setStringProperty:"hdr-compute-peak" value:@"no"];
    [self setStringProperty:"target-prim" value:targetPrimaries];
    [self setStringProperty:"target-trc" value:targetTransfer];
    [self setStringProperty:"target-peak" value:targetPeak];
}

- (void)applyHdrForPolledGamma:(NSString *)gamma primaries:(NSString *)primaries reason:(NSString *)reason force:(BOOL)force {
    if (!_mpv || !_videoView) {
        return;
    }
    NSString *normalizedGamma = [[gamma ?: @"" lowercaseString] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    NSString *normalizedPrimaries = [[primaries ?: @"" lowercaseString] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (normalizedGamma.length == 0 && normalizedPrimaries.length == 0) {
        return;
    }

    BOOL isPq = [normalizedGamma containsString:@"pq"]
        || [normalizedGamma containsString:@"2084"]
        || [normalizedGamma containsString:@"st2084"];
    BOOL isHlg = [normalizedGamma containsString:@"hlg"];
    double edrMax = [_videoView edrMax];
    double screenPeak = [_videoView hdrTargetPeakNits];
    BOOL hdrDetected = (isPq || isHlg) && edrMax > 1.0;
    NSString *targetPrimaries = hdrDetected && normalizedPrimaries.length > 0 ? normalizedPrimaries : @"auto";
    NSString *stateKey = [NSString stringWithFormat:
        @"%@:%@:%@:%0.2f:%0.0f",
        hdrDetected ? @"native-opengl-edr" : @"sdr",
        normalizedGamma ?: @"",
        targetPrimaries,
        edrMax,
        screenPeak
    ];
    if (!force && _lastConfiguredHdrKey && [_lastConfiguredHdrKey isEqualToString:stateKey]) {
        return;
    }
    _lastConfiguredHdrKey = stateKey;

    double targetPeakNits = normalizedHdrMetadataMaxNits(screenPeak);
    [_videoView configureExtendedDynamicRange:hdrDetected primaries:targetPrimaries targetPeakNits:targetPeakNits];

    NSString *targetTransfer = hdrDetected ? @"pq" : @"auto";
    NSString *toneMapping = hdrDetected ? @"" : @"auto";
    NSString *targetPeak = hdrDetected ? [NSString stringWithFormat:@"%.0f", targetPeakNits] : @"auto";
    mpv_handle *mpv = _mpv;
    dispatch_queue_t queue = _mpvEventQueue;
    if (queue) {
        dispatch_async(queue, ^{
            if (self->_mpv != mpv) {
                return;
            }
            mpv_set_property_string(mpv, "target-colorspace-hint", "yes");
            mpv_set_property_string(mpv, "target-colorspace-hint-mode", hdrDetected ? "source" : "target");
            mpv_set_property_string(mpv, "target-colorspace-hint-strict", "no");
            mpv_set_property_string(mpv, "tone-mapping", toneMapping.UTF8String);
            mpv_set_property_string(mpv, "hdr-compute-peak", "no");
            mpv_set_property_string(mpv, "target-prim", targetPrimaries.UTF8String);
            mpv_set_property_string(mpv, "target-trc", targetTransfer.UTF8String);
            mpv_set_property_string(mpv, "target-peak", targetPeak.UTF8String);
        });
    }
}

- (JNIEnv *)jniEnvDidAttach:(BOOL *)didAttach {
    if (didAttach) {
        *didAttach = NO;
    }
    if (!_javaVm) {
        return nullptr;
    }

    JNIEnv *env = nullptr;
    jint status = _javaVm->GetEnv((void **)&env, JNI_VERSION_1_6);
    if (status == JNI_OK) {
        return env;
    }
    if (status != JNI_EDETACHED) {
        return nullptr;
    }
    if (_javaVm->AttachCurrentThread((void **)&env, nullptr) != JNI_OK) {
        return nullptr;
    }
    if (didAttach) {
        *didAttach = YES;
    }
    return env;
}

- (void)sendPlayerEvent:(NSString *)type value:(double)value {
    if (!_eventSink || !_eventMethod) {
        return;
    }

    BOOL didAttach = NO;
    JNIEnv *env = [self jniEnvDidAttach:&didAttach];
    if (!env) {
        return;
    }

    jstring eventType = env->NewStringUTF(type.UTF8String);
    env->CallVoidMethod(_eventSink, _eventMethod, eventType, (jdouble)value);
    if (env->ExceptionCheck()) {
        env->ExceptionClear();
    }
    if (eventType) {
        env->DeleteLocalRef(eventType);
    }
    if (didAttach) {
        _javaVm->DetachCurrentThread();
    }
}

- (void)updateControlsJson:(NSString *)controlsJson {
    if (!_webView) {
        return;
    }
    if (!controlsJson) {
        return;
    }
    _pendingControlsJson = [controlsJson copy];
    [self flushPendingControlsJsonIfReady];
}

- (void)flushPendingControlsJsonIfReady {
    if (!_webView || !_pendingControlsJson) {
        return;
    }
    if (!_controlsWebReady) {
        return;
    }
    NSString *controlsJson = [_pendingControlsJson copy];
    NSString *jsonString = javaScriptStringLiteral(controlsJson);
    NSString *script = [NSString stringWithFormat:
        @"(function(){if(!window.playerControls)return 'missing';window.playerControls(JSON.parse(%@));return 'applied';})()",
        jsonString];
    [_webView evaluateJavaScript:script completionHandler:^(id _Nullable jsResult, NSError * _Nullable error) {
        if (error) {
            return;
        }
        NSString *resultText = [jsResult isKindOfClass:[NSString class]] ? (NSString *)jsResult : @"unknown";
        if ([resultText isEqualToString:@"missing"]) {
            _controlsWebReady = NO;
            return;
        }
        if (_pendingControlsJson && [_pendingControlsJson isEqualToString:controlsJson]) {
            _pendingControlsJson = nil;
        }
    }];
}

- (void)shutdown {
    [[NSNotificationCenter defaultCenter] removeObserver:self];
    [_timer invalidate];
    _timer = nil;
    [_resizeSettleTimer invalidate];
    _resizeSettleTimer = nil;
    [_fullscreenTransitionTimer invalidate];
    _fullscreenTransitionTimer = nil;
    _controlsWebReady = NO;
    _pendingControlsJson = nil;
    if (_mpvEventQueue) {
        dispatch_sync(_mpvEventQueue, ^{});
    }
    [_videoView destroyMpvRenderContext];
    if (_mpv) {
        mpv_terminate_destroy(_mpv);
        _mpv = NULL;
    }
    [_webView.configuration.userContentController removeScriptMessageHandlerForName:@"player"];
    [_webView removeFromSuperview];
    [_videoView removeFromSuperview];
    _webView = nil;
    _videoView = nil;
    _scriptHandler = nil;
    if (_eventSink) {
        BOOL didAttach = NO;
        JNIEnv *env = [self jniEnvDidAttach:&didAttach];
        if (env) {
            env->DeleteGlobalRef(_eventSink);
        }
        if (didAttach) {
            _javaVm->DetachCurrentThread();
        }
        _eventSink = nullptr;
    }
    _eventMethod = nullptr;
    _javaVm = nullptr;
}

- (void)setPaused:(BOOL)paused {
    if (!_mpv) return;
    int flag = paused ? 1 : 0;
    mpv_set_property(_mpv, "pause", MPV_FORMAT_FLAG, &flag);
    _cachedPaused.store(paused);
}

- (BOOL)isPaused {
    return _cachedPaused.load();
}

- (BOOL)rawIsPaused {
    if (!_mpv) return _cachedPaused.load();
    int flag = 1;
    mpv_get_property(_mpv, "pause", MPV_FORMAT_FLAG, &flag);
    return flag != 0;
}

- (void)seekToMilliseconds:(long long)positionMs {
    if (!_mpv) return;
    std::string seconds = std::to_string((double)positionMs / 1000.0);
    const char *command[] = {"seek", seconds.c_str(), "absolute+keyframes", NULL};
    mpv_command(_mpv, command);
    _cachedPositionSeconds.store(fmax((double)positionMs / 1000.0, 0.0));
}

- (void)seekByMilliseconds:(long long)offsetMs {
    if (!_mpv) return;
    std::string seconds = std::to_string((double)offsetMs / 1000.0);
    const char *command[] = {"seek", seconds.c_str(), "relative+keyframes", NULL};
    mpv_command(_mpv, command);
    double nextPosition = fmax(_cachedPositionSeconds.load() + ((double)offsetMs / 1000.0), 0.0);
    _cachedPositionSeconds.store(nextPosition);
}

- (void)setSpeed:(double)speed {
    if (!_mpv) return;
    double clamped = fmax(0.25, fmin(4.0, speed));
    mpv_set_property(_mpv, "speed", MPV_FORMAT_DOUBLE, &clamped);
    _cachedSpeed.store(clamped);
}

- (double)speed {
    return _cachedSpeed.load();
}

- (double)rawSpeed {
    return [self doubleProperty:"speed" fallback:_cachedSpeed.load()];
}

- (void)setResizeMode:(int)mode {
    if (!_mpv) return;
    NSString *panscan = @"0.0";
    switch (mode) {
        case 1:
        case 2:
            panscan = @"1.0";
            break;
        default:
            break;
    }

    dispatch_queue_t queue = _mpvEventQueue;
    if (!queue) {
        [self setStringProperty:"panscan" value:panscan];
        [self setStringProperty:"video-unscaled" value:@"no"];
        return;
    }

    dispatch_async(queue, ^{
        mpv_handle *mpv = self->_mpv;
        if (!mpv) {
            return;
        }
        mpv_set_property_string(mpv, "panscan", panscan.UTF8String);
        mpv_set_property_string(mpv, "video-unscaled", "no");
    });
}

- (long long)durationMs {
    return (long long)llround(fmax(_cachedDurationSeconds.load(), 0.0) * 1000.0);
}

- (long long)positionMs {
    return (long long)llround(fmax(_cachedPositionSeconds.load(), 0.0) * 1000.0);
}

- (double)rawPositionSeconds {
    double position = [self doubleProperty:"time-pos" fallback:0.0];
    return std::isfinite(position) ? fmax(position, 0.0) : 0.0;
}

- (double)effectiveCachePositionSeconds {
    double position = [self rawPositionSeconds];
    if (_initialStartSeconds > 0.0 && position + 5.0 < _initialStartSeconds) {
        return _initialStartSeconds;
    }
    return position;
}

- (double)cacheAheadSeconds {
    return [self cacheAheadSecondsForPosition:[self rawPositionSeconds]];
}

- (double)cacheAheadSecondsForPosition:(double)position {
    double safePosition = std::isfinite(position) ? fmax(position, 0.0) : 0.0;
    double effectivePosition = safePosition;
    if (_initialStartSeconds > 0.0 && safePosition + 5.0 < _initialStartSeconds) {
        effectivePosition = _initialStartSeconds;
    }
    double cacheTime = [self doubleProperty:"demuxer-cache-time" fallback:0.0];
    if (std::isfinite(cacheTime) && cacheTime > 0.0) {
        if (cacheTime >= effectivePosition - 5.0) {
            return fmax(cacheTime - effectivePosition, 0.0);
        }
        return cacheTime;
    }

    double cacheDuration = [self doubleProperty:"demuxer-cache-duration" fallback:0.0];
    if (std::isfinite(cacheDuration) && cacheDuration > 0.0) {
        return cacheDuration;
    }

    return 0.0;
}

- (long long)bufferedPositionMs {
    double bufferedPosition = _cachedPositionSeconds.load() + _cachedCacheAheadSeconds.load();
    return (long long)llround(fmax(bufferedPosition, 0.0) * 1000.0);
}

- (BOOL)isLoading {
    return _cachedLoading.load();
}

- (BOOL)rawLoadingWithPaused:(BOOL)paused ended:(BOOL)eofReached duration:(double)duration {
    BOOL idle = [self flagProperty:"core-idle" fallback:YES];
    BOOL seeking = [self flagProperty:"seeking" fallback:NO];
    BOOL bufferingCache = [self flagProperty:"paused-for-cache" fallback:NO];
    BOOL fileReady = duration > 0.0
        || [self int64Property:"track-list/count" fallback:0] > 0;
    return !fileReady || (idle && !paused && !eofReached) || seeking || bufferingCache;
}

- (BOOL)isEnded {
    return _cachedEnded.load();
}

- (BOOL)rawIsEnded {
    return [self flagProperty:"eof-reached" fallback:_cachedEnded.load()];
}

- (void)updateCachedDuration:(double)duration
                    position:(double)position
                  cacheAhead:(double)cacheAhead
                      paused:(BOOL)paused
                     loading:(BOOL)loading
                       ended:(BOOL)ended
                       speed:(double)speed {
    _cachedDurationSeconds.store(std::isfinite(duration) ? fmax(duration, 0.0) : 0.0);
    _cachedPositionSeconds.store(std::isfinite(position) ? fmax(position, 0.0) : 0.0);
    _cachedCacheAheadSeconds.store(std::isfinite(cacheAhead) ? fmax(cacheAhead, 0.0) : 0.0);
    _cachedSpeed.store(std::isfinite(speed) ? fmax(0.25, fmin(4.0, speed)) : 1.0);
    _cachedPaused.store(paused);
    _cachedLoading.store(loading);
    _cachedEnded.store(ended);
}

- (NSString *)audioTracksJson {
    return [self tracksJsonForType:@"audio"];
}

- (NSString *)subtitleTracksJson {
    return [self tracksJsonForType:@"sub"];
}

- (void)selectAudioTrackId:(int)trackId {
    if (!_mpv) return;
    int64_t id = trackId;
    mpv_set_property(_mpv, "aid", MPV_FORMAT_INT64, &id);
}

- (void)selectSubtitleTrackId:(int)trackId {
    if (!_mpv) return;
    if (trackId < 0) {
        [self setStringProperty:"sid" value:@"no"];
        return;
    }
    int64_t id = trackId;
    mpv_set_property(_mpv, "sid", MPV_FORMAT_INT64, &id);
}

- (void)addSubtitleUrl:(NSString *)url {
    if (!_mpv || url.length == 0) return;
    [self command:@[@"sub-add", url, @"select"]];
}

- (void)removeExternalSubtitles {
    if (!_mpv) return;
    [self removeExternalSubtitleTracks];
    [self setStringProperty:"sid" value:@"no"];
}

- (void)removeExternalSubtitlesAndSelect:(int)trackId {
    if (!_mpv) return;
    [self removeExternalSubtitleTracks];
    if (trackId >= 0) {
        [self selectSubtitleTrackId:trackId];
    } else {
        [self setStringProperty:"sid" value:@"no"];
    }
}

- (void)setSubtitleDelayMs:(int)delayMs {
    if (!_mpv) return;
    int clamped = MAX(-60000, MIN(60000, delayMs));
    double delaySeconds = (double)clamped / 1000.0;
    mpv_set_property(_mpv, "sub-delay", MPV_FORMAT_DOUBLE, &delaySeconds);
}

- (void)applySubtitleStyleWithTextColor:(NSString *)textColor
                        backgroundColor:(NSString *)backgroundColor
                            outlineColor:(NSString *)outlineColor
                             outlineSize:(double)outlineSize
                                    bold:(BOOL)bold
                                fontSize:(double)fontSize
                                  subPos:(int)subPos {
    if (!_mpv) return;
    [self setStringProperty:"sub-ass-override" value:@"force"];
    [self setStringProperty:"sub-color" value:textColor ?: @"#FFFFFFFF"];
    [self setStringProperty:"sub-back-color" value:backgroundColor ?: @"#00000000"];
    [self setStringProperty:"sub-outline-color" value:outlineColor ?: @"#FF000000"];
    [self setStringProperty:"sub-border-style"
                      value:[(backgroundColor ?: @"") hasPrefix:@"#00"] ? @"outline-and-shadow" : @"opaque-box"];
    [self setStringProperty:"sub-bold" value:bold ? @"yes" : @"no"];

    double outline = MAX(0.0, MIN(8.0, outlineSize));
    mpv_set_property(_mpv, "sub-outline-size", MPV_FORMAT_DOUBLE, &outline);

    double size = MAX(24.0, MIN(96.0, fontSize));
    mpv_set_property(_mpv, "sub-font-size", MPV_FORMAT_DOUBLE, &size);

    int64_t position = MAX(0, MIN(150, subPos));
    mpv_set_property(_mpv, "sub-pos", MPV_FORMAT_INT64, &position);
}

- (double)doubleProperty:(const char *)name fallback:(double)fallback {
    if (!_mpv) return fallback;
    double value = fallback;
    if (mpv_get_property(_mpv, name, MPV_FORMAT_DOUBLE, &value) < 0) {
        return fallback;
    }
    return value;
}

- (long long)int64Property:(const char *)name fallback:(long long)fallback {
    if (!_mpv) return fallback;
    int64_t value = fallback;
    if (mpv_get_property(_mpv, name, MPV_FORMAT_INT64, &value) < 0) {
        return fallback;
    }
    return value;
}

- (BOOL)flagProperty:(const char *)name fallback:(BOOL)fallback {
    if (!_mpv) return fallback;
    int flag = fallback ? 1 : 0;
    if (mpv_get_property(_mpv, name, MPV_FORMAT_FLAG, &flag) < 0) {
        return fallback;
    }
    return flag != 0;
}

- (NSString *)stringProperty:(const char *)name fallback:(NSString *)fallback {
    if (!_mpv) return fallback ?: @"";
    char *value = nullptr;
    if (mpv_get_property(_mpv, name, MPV_FORMAT_STRING, &value) < 0 || !value) {
        return fallback ?: @"";
    }
    NSString *result = [NSString stringWithUTF8String:value] ?: (fallback ?: @"");
    mpv_free(value);
    return result;
}

- (void)setStringProperty:(const char *)name value:(NSString *)value {
    if (!_mpv) return;
    mpv_set_property_string(_mpv, name, (value ?: @"").UTF8String);
}

- (void)command:(NSArray<NSString *> *)args {
    if (!_mpv || args.count == 0) return;
    std::vector<const char *> cargs;
    cargs.reserve(args.count + 1);
    for (NSString *arg in args) {
        cargs.push_back((arg ?: @"").UTF8String);
    }
    cargs.push_back(nullptr);
    mpv_command(_mpv, cargs.data());
}

- (void)removeExternalSubtitleTracks {
    long long count = [self int64Property:"track-list/count" fallback:0];
    if (count <= 0) return;
    for (long long index = count - 1; index >= 0; index--) {
        NSString *typeKey = [NSString stringWithFormat:@"track-list/%lld/type", index];
        NSString *externalKey = [NSString stringWithFormat:@"track-list/%lld/external", index];
        NSString *idKey = [NSString stringWithFormat:@"track-list/%lld/id", index];
        NSString *type = [self stringProperty:typeKey.UTF8String fallback:@""];
        BOOL external = [self flagProperty:externalKey.UTF8String fallback:NO];
        if ([type isEqualToString:@"sub"] && external) {
            long long trackId = [self int64Property:idKey.UTF8String fallback:-1];
            if (trackId >= 0) {
                [self command:@[@"sub-remove", [NSString stringWithFormat:@"%lld", trackId]]];
            }
        }
    }
}

- (NSString *)tracksJsonForType:(NSString *)wantedType {
    if (!_mpv) return @"[]";
    NSMutableArray<NSDictionary *> *tracks = [NSMutableArray array];
    long long count = [self int64Property:"track-list/count" fallback:0];
    int logicalIndex = 0;

    for (long long index = 0; index < count; index++) {
        NSString *prefix = [NSString stringWithFormat:@"track-list/%lld", index];
        NSString *type = [self stringProperty:[[prefix stringByAppendingString:@"/type"] UTF8String] fallback:@""];
        if (![type isEqualToString:wantedType]) {
            continue;
        }

        long long trackId = [self int64Property:[[prefix stringByAppendingString:@"/id"] UTF8String] fallback:logicalIndex + 1];
        NSString *title = [self trackStringAtIndex:index field:@"title"];
        NSString *language = [self trackStringAtIndex:index field:@"lang"];
        NSString *codec = [self trackStringAtIndex:index field:@"codec"];
        NSString *decoderDescription = [self trackStringAtIndex:index field:@"decoder-desc"];
        NSString *channels = [self trackStringAtIndex:index field:@"demux-channels"];
        long long channelCount = [self int64Property:[[prefix stringByAppendingString:@"/demux-channel-count"] UTF8String] fallback:0];
        BOOL selected = [self flagProperty:[[prefix stringByAppendingString:@"/selected"] UTF8String] fallback:NO];
        BOOL forced = [self flagProperty:[[prefix stringByAppendingString:@"/forced"] UTF8String] fallback:NO];
        NSString *label = [self formatTrackTitleWithType:type
                                                   index:logicalIndex
                                                   title:title
                                                language:language
                                                   codec:codec
                                      decoderDescription:decoderDescription
                                                channels:channels
                                            channelCount:(int)channelCount];
        [tracks addObject:@{
            @"index": @(logicalIndex),
            @"id": [NSString stringWithFormat:@"%lld", trackId],
            @"label": label ?: @"",
            @"language": language ?: @"",
            @"selected": @(selected),
            @"forced": @(forced),
        }];
        logicalIndex += 1;
    }

    NSData *data = [NSJSONSerialization dataWithJSONObject:tracks options:0 error:nil];
    if (!data) return @"[]";
    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"[]";
}

- (NSString *)trackStringAtIndex:(long long)index field:(NSString *)field {
    NSString *key = [NSString stringWithFormat:@"track-list/%lld/%@", index, field];
    return [[self stringProperty:key.UTF8String fallback:@""] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
}

- (NSString *)formatTrackTitleWithType:(NSString *)type
                                 index:(int)index
                                 title:(NSString *)title
                              language:(NSString *)language
                                 codec:(NSString *)codec
                    decoderDescription:(NSString *)decoderDescription
                              channels:(NSString *)channels
                          channelCount:(int)channelCount {
    NSString *base = [self ifNotBlank:title]
        ?: [self localizedLanguageName:language]
        ?: ([type isEqualToString:@"sub"]
            ? [NSString stringWithFormat:@"Subtitle %d", index + 1]
            : [NSString stringWithFormat:@"Track %d", index + 1]);
    NSString *codecName = [self codecDisplayName:codec] ?: [self codecDisplayName:decoderDescription];
    NSString *channelName = [type isEqualToString:@"audio"]
        ? [self channelLayoutNameWithChannels:channels channelCount:channelCount]
        : nil;
    NSMutableArray<NSString *> *details = [NSMutableArray array];
    for (NSString *detail in @[channelName ?: @"", codecName ?: @""]) {
        if (detail.length == 0) continue;
        if ([base rangeOfString:detail options:NSCaseInsensitiveSearch].location == NSNotFound) {
            [details addObject:detail];
        }
    }
    return details.count == 0
        ? base
        : [NSString stringWithFormat:@"%@ (%@)", base, [details componentsJoinedByString:@", "]];
}

- (NSString *)ifNotBlank:(NSString *)value {
    NSString *trimmed = [(value ?: @"") stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    return trimmed.length == 0 ? nil : trimmed;
}

- (NSString *)localizedLanguageName:(NSString *)languageCode {
    NSString *code = [self ifNotBlank:languageCode];
    if (!code) return nil;
    return [[NSLocale currentLocale] displayNameForKey:NSLocaleLanguageCode value:code] ?: code;
}

- (NSString *)channelLayoutNameWithChannels:(NSString *)channels channelCount:(int)channelCount {
    NSString *normalized = [self ifNotBlank:channels];
    if (normalized && ![normalized isEqualToString:@"unknown"]) {
        NSString *lower = normalized.lowercaseString;
        if ([lower isEqualToString:@"mono"]) return @"Mono";
        if ([lower isEqualToString:@"stereo"]) return @"Stereo";
        return normalized;
    }
    switch (channelCount) {
        case 1: return @"Mono";
        case 2: return @"Stereo";
        case 6: return @"5.1";
        case 8: return @"7.1";
        default:
            return channelCount > 0 ? [NSString stringWithFormat:@"%dch", channelCount] : nil;
    }
}

- (NSString *)codecDisplayName:(NSString *)value {
    NSString *raw = [self ifNotBlank:value];
    if (!raw) return nil;
    NSString *codec = raw.lowercaseString;
    if ([codec containsString:@"eac3"] || [codec containsString:@"e-ac-3"] || [codec containsString:@"e ac-3"]) {
        return ([codec containsString:@"joc"] || [codec containsString:@"atmos"]) ? @"E-AC-3-JOC" : @"E-AC-3";
    }
    if ([codec containsString:@"truehd"] || [codec containsString:@"true hd"]) return @"TrueHD";
    if ([codec containsString:@"ac3"] || [codec containsString:@"ac-3"]) return @"AC-3";
    if ([codec containsString:@"dts-hd"] || [codec containsString:@"dtshd"] || [codec containsString:@"dts hd"]) return @"DTS-HD";
    if ([codec containsString:@"dts"] || [codec isEqualToString:@"dca"]) return @"DTS";
    if ([codec containsString:@"aac"]) return @"AAC";
    if ([codec containsString:@"mp3"] || [codec containsString:@"mpeg audio"]) return @"MP3";
    if ([codec containsString:@"mp2"]) return @"MP2";
    if ([codec containsString:@"opus"]) return @"Opus";
    if ([codec containsString:@"vorbis"]) return @"Vorbis";
    if ([codec containsString:@"flac"]) return @"FLAC";
    if ([codec containsString:@"alac"]) return @"ALAC";
    if ([codec containsString:@"pcm"] || [codec containsString:@"wav"]) return @"WAV";
    if ([codec containsString:@"amr_wb"] || [codec containsString:@"amr-wb"]) return @"AMR-WB";
    if ([codec containsString:@"amr_nb"] || [codec containsString:@"amr-nb"]) return @"AMR-NB";
    if ([codec containsString:@"amr"]) return @"AMR";
    if ([codec containsString:@"iamf"]) return @"IAMF";
    if ([codec containsString:@"mpegh"] || [codec containsString:@"mpeg-h"]) return @"MPEG-H";
    if ([codec containsString:@"pgs"] || [codec containsString:@"hdmv"]) return @"PGS";
    if ([codec containsString:@"subrip"] || [codec isEqualToString:@"srt"]) return @"SRT";
    if ([codec containsString:@"ass"] || [codec containsString:@"ssa"]) return @"SSA";
    if ([codec containsString:@"webvtt"] || [codec isEqualToString:@"vtt"]) return @"VTT";
    if ([codec containsString:@"ttml"]) return @"TTML";
    if ([codec containsString:@"mov_text"] || [codec containsString:@"tx3g"]) return @"TX3G";
    if ([codec containsString:@"dvb"]) return @"DVB";
    return raw;
}

- (void)handleScriptMessage:(NSDictionary *)message {
    NSString *type = message[@"type"];
    if (![type isKindOfClass:[NSString class]]) {
        return;
    }

    id rawValue = message[@"value"];
    NSNumber *value = [rawValue isKindOfClass:[NSNumber class]] ? rawValue : nil;
    if ([type isEqualToString:@"controlsReady"]) {
        _controlsWebReady = YES;
        [self flushPendingControlsJsonIfReady];
        [self syncControls];
        return;
    }
    if ([type isEqualToString:@"selectAudioTrack"] && value) {
        [self selectAudioTrackId:(int)llround(value.doubleValue)];
        [self syncControls];
        return;
    }
    if ([type isEqualToString:@"selectSubtitleTrack"] && value) {
        [self selectSubtitleTrackId:(int)llround(value.doubleValue)];
        [self syncControls];
        return;
    }
    if ([type isEqualToString:@"toggleFullscreen"]) {
        [self beginFullscreenTransitionWithReason:@"control-toggle"];
    }

    if (_eventSink && _eventMethod) {
        [self sendPlayerEvent:type value:value ? value.doubleValue : 0.0];
        return;
    }

    if ([type isEqualToString:@"toggle"]) {
        [self setPaused:![self isPaused]];
        [self syncControls];
    } else if ([type isEqualToString:@"seekPercent"]) {
        double duration = [self doubleProperty:"duration" fallback:0.0];
        if (duration > 0.0 && value) {
            [self seekToMilliseconds:(long long)llround(duration * value.doubleValue * 1000.0)];
        }
    } else if ([type isEqualToString:@"scrubFinish"] && value) {
        [self seekToMilliseconds:(long long)llround(value.doubleValue)];
    }
}

@end

static void runOnMainSync(dispatch_block_t block) {
    if ([NSThread isMainThread]) {
        block();
    } else {
        dispatch_sync(dispatch_get_main_queue(), block);
    }
}

static void runOnMainAsync(dispatch_block_t block) {
    if ([NSThread isMainThread]) {
        block();
    } else {
        dispatch_async(dispatch_get_main_queue(), block);
    }
}

static void throwJavaError(JNIEnv *env, NSString *message) {
    jclass exceptionClass = env->FindClass("java/lang/IllegalStateException");
    if (exceptionClass) {
        env->ThrowNew(exceptionClass, message.UTF8String);
    }
}

static std::string jstringToString(JNIEnv *env, jstring value) {
    if (!value) return std::string();
    jsize length = env->GetStringLength(value);
    const jchar *chars = env->GetStringChars(value, nullptr);
    if (!chars) {
        return std::string();
    }
    NSString *string = [NSString stringWithCharacters:(const unichar *)chars length:(NSUInteger)length];
    env->ReleaseStringChars(value, chars);

    NSData *data = [string dataUsingEncoding:NSUTF8StringEncoding];
    if (!data) {
        return std::string();
    }
    std::string result((const char *)data.bytes, data.length);
    return result;
}

static NSArray<NSString *> *jstringArrayToNSArray(JNIEnv *env, jobjectArray values) {
    NSMutableArray<NSString *> *result = [NSMutableArray array];
    if (!values) {
        return result;
    }
    jsize count = env->GetArrayLength(values);
    for (jsize index = 0; index < count; index++) {
        jstring item = (jstring)env->GetObjectArrayElement(values, index);
        std::string value = jstringToString(env, item);
        if (!value.empty()) {
            [result addObject:[NSString stringWithUTF8String:value.c_str()]];
        }
        env->DeleteLocalRef(item);
    }
    return result;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_create(
    JNIEnv *env,
    jobject /* bridge */,
    jlong hostViewPtr,
    jstring sourceUrl,
    jobjectArray headerLines,
    jboolean playWhenReady,
    jlong initialPositionMs,
    jstring controlsPageUrl,
    jobject eventSink
) {
    NSView *hostView = (__bridge NSView *)(void *)(intptr_t)hostViewPtr;
    if (!hostView) {
        throwJavaError(env, @"Unable to resolve the AWT host NSView for native playback.");
        return 0;
    }

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
            if (eventSinkRef) {
                env->DeleteGlobalRef(eventSinkRef);
            }
            throwJavaError(env, @"Native player event sink is missing onPlayerEvent(String, Double).");
            return 0;
        }
    }

    std::string source = jstringToString(env, sourceUrl);
    std::string controls = jstringToString(env, controlsPageUrl);
    NSArray<NSString *> *headers = jstringArrayToNSArray(env, headerLines);
    __block MpvWebPlayer *player = nil;
    __block NSString *error = nil;
    runOnMainSync(^{
        @try {
            player = [[MpvWebPlayer alloc]
                initWithHostView:hostView
                    sourceUrl:[NSString stringWithUTF8String:source.c_str()]
                    headerLines:headers
                   playWhenReady:playWhenReady == JNI_TRUE
                initialPositionMs:initialPositionMs
                     controlsUrl:[NSString stringWithUTF8String:controls.c_str()]
                          javaVm:javaVm
                       eventSink:eventSinkRef
                     eventMethod:eventMethod];
        } @catch (NSException *exception) {
            error = exception.reason ?: exception.name;
        }
    });

    if (error) {
        if (eventSinkRef) {
            env->DeleteGlobalRef(eventSinkRef);
        }
        throwJavaError(env, error);
        return 0;
    }

    return (jlong)(intptr_t)CFBridgingRetain(player);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_dispose(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge_transfer MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainSync(^{
        [player shutdown];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_updateControls(
    JNIEnv *env,
    jobject /* bridge */,
    jlong handle,
    jstring controlsJson
) {
    if (handle == 0) return;
    std::string controls = jstringToString(env, controlsJson);
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player updateControlsJson:[NSString stringWithUTF8String:controls.c_str()]];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setPaused(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jboolean paused
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player setPaused:paused == JNI_TRUE];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_seekTo(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jlong positionMs
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player seekToMilliseconds:positionMs];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_seekBy(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jlong offsetMs
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player seekByMilliseconds:offsetMs];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setSpeed(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jfloat speed
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player setSpeed:speed];
    });
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_durationMs(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return 0;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    return [player durationMs];
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_positionMs(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return 0;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    return [player positionMs];
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_bufferedPositionMs(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return 0;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    return [player bufferedPositionMs];
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_isLoading(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return JNI_TRUE;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    return [player isLoading] ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_isEnded(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return JNI_FALSE;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    return [player isEnded] ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_isPaused(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return JNI_TRUE;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    return [player isPaused] ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jfloat JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_speed(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return 1.0f;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    return (jfloat)[player speed];
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setResizeMode(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jint mode
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player setResizeMode:(int)mode];
    });
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_audioTracksJson(
    JNIEnv *env,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return env->NewStringUTF("[]");
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    NSString *json = [player audioTracksJson] ?: @"[]";
    return env->NewStringUTF(json.UTF8String);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_subtitleTracksJson(
    JNIEnv *env,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return env->NewStringUTF("[]");
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    NSString *json = [player subtitleTracksJson] ?: @"[]";
    return env->NewStringUTF(json.UTF8String);
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_selectAudioTrack(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jint trackId
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player selectAudioTrackId:(int)trackId];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_selectSubtitleTrack(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jint trackId
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player selectSubtitleTrackId:(int)trackId];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_addSubtitleUrl(
    JNIEnv *env,
    jobject /* bridge */,
    jlong handle,
    jstring url
) {
    if (handle == 0) return;
    std::string subtitleUrl = jstringToString(env, url);
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player addSubtitleUrl:[NSString stringWithUTF8String:subtitleUrl.c_str()]];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_clearExternalSubtitles(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player removeExternalSubtitles];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_clearExternalSubtitlesAndSelect(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jint trackId
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player removeExternalSubtitlesAndSelect:(int)trackId];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_setSubtitleDelayMs(
    JNIEnv * /* env */,
    jobject /* bridge */,
    jlong handle,
    jint delayMs
) {
    if (handle == 0) return;
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player setSubtitleDelayMs:(int)delayMs];
    });
}

extern "C" JNIEXPORT void JNICALL
Java_com_nuvio_app_features_player_desktop_NativePlayerBridge_applySubtitleStyle(
    JNIEnv *env,
    jobject /* bridge */,
    jlong handle,
    jstring textColor,
    jstring backgroundColor,
    jstring outlineColor,
    jfloat outlineSize,
    jboolean bold,
    jfloat fontSize,
    jint subPos
) {
    if (handle == 0) return;
    std::string text = jstringToString(env, textColor);
    std::string background = jstringToString(env, backgroundColor);
    std::string outline = jstringToString(env, outlineColor);
    MpvWebPlayer *player = (__bridge MpvWebPlayer *)(void *)(intptr_t)handle;
    runOnMainAsync(^{
        [player applySubtitleStyleWithTextColor:[NSString stringWithUTF8String:text.c_str()]
                                backgroundColor:[NSString stringWithUTF8String:background.c_str()]
                                    outlineColor:[NSString stringWithUTF8String:outline.c_str()]
                                     outlineSize:(double)outlineSize
                                            bold:bold == JNI_TRUE
                                        fontSize:(double)fontSize
                                          subPos:(int)subPos];
    });
}
