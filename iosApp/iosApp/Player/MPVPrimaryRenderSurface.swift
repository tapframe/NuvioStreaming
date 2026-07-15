import UIKit
import AVFoundation
import CoreMedia
import CoreVideo
import GLKit
import OpenGLES
import Libmpv
import ComposeApp
import Darwin

private typealias NuvioGLGetProcAddress = @convention(c) (UnsafeMutableRawPointer?, UnsafePointer<CChar>?) -> UnsafeMutableRawPointer?
private let nuvioOpenGLESHandle = dlopen("/System/Library/Frameworks/OpenGLES.framework/OpenGLES", RTLD_LAZY)
private let nuvioGLBGRA = GLenum(0x80E1)
private let nuvioGetOpenGLProcAddress: NuvioGLGetProcAddress = { _, name in
    guard let name else { return nil }
    return dlsym(nuvioOpenGLESHandle, name)
}

private struct NuvioOpenGLInitParams {
    var get_proc_address: NuvioGLGetProcAddress?
    var get_proc_address_ctx: UnsafeMutableRawPointer?
}

private struct NuvioOpenGLFBO {
    var fbo: Int32
    var w: Int32
    var h: Int32
    var internal_format: Int32
}

final class MPVPrimaryRenderSurface: NSObject, GLKViewDelegate {
    let glView: GLKView

    private let displayLayer: AVSampleBufferDisplayLayer
    private let videoSizeProvider: () -> CGSize
    private let playbackPositionProvider: () -> Double
    private let videoFrameRateProvider: () -> Double
    private let playbackRateProvider: () -> Double
    private let isPausedProvider: () -> Bool
    private let glContext: EAGLContext
    private let pipRenderQueue = DispatchQueue(label: "nuvio.player.pip-render", qos: .userInteractive)
    private let pipRenderQueueKey = DispatchSpecificKey<Void>()
    private let pipRenderScheduleLock = NSLock()

    private var renderContext: OpaquePointer?
    private var renderScheduled = false
    private var forcedInlineRenderCount = 0
    private var openGLRenderParams = [mpv_render_param](repeating: mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil), count: 4)
    private var blockForTargetTime: Int32 = 0
    private var inlineRenderContextForDisplay: OpaquePointer?

    private var textureCache: CVOpenGLESTextureCache?
    private var pixelBufferPool: CVPixelBufferPool?
    private var pixelBufferPoolAuxAttributes: CFDictionary?
    private var formatDescription: CMVideoFormatDescription?
    private var poolWidth = 0
    private var poolHeight = 0
    private var lastPiPFramePTS: Double = -1
    private var hasEnqueuedPiPFrame = false
    private var pictureInPicturePriming = false
    private var pictureInPictureActive = false
    private var stopPrimingAfterFirstFrame = false
    private var firstPiPFrameHandler: (() -> Void)?
    private var pipRenderTimer: DispatchSourceTimer?
    private var pipRenderTimerFrameRate: Double = 0
    private var pipCadenceCheckCounter = 0
    private var pipRenderScheduled = false
    private var pipFramebuffer = GLuint(0)
    private var enqueuedPiPFrameCount = 0
    private var pipRenderAttemptCount = 0
    private var pipRenderSkipNotReadyCount = 0
    private var pipRenderDurationTotal: CFTimeInterval = 0
    private var pipDiagnosticsWindowStart: CFTimeInterval = 0
    private var pipDiagnosticsEnqueuedAtWindowStart = 0

    init?(
        displayLayer: AVSampleBufferDisplayLayer,
        videoSizeProvider: @escaping () -> CGSize,
        playbackPositionProvider: @escaping () -> Double,
        videoFrameRateProvider: @escaping () -> Double,
        playbackRateProvider: @escaping () -> Double,
        isPausedProvider: @escaping () -> Bool
    ) {
        guard let context = EAGLContext(api: .openGLES3) ?? EAGLContext(api: .openGLES2) else {
            InAppLogBridge.shared.error(tag: "MPV/iOS", message: "Unable to create OpenGL ES context")
            return nil
        }
        self.displayLayer = displayLayer
        self.videoSizeProvider = videoSizeProvider
        self.playbackPositionProvider = playbackPositionProvider
        self.videoFrameRateProvider = videoFrameRateProvider
        self.playbackRateProvider = playbackRateProvider
        self.isPausedProvider = isPausedProvider
        self.glContext = context
        self.glView = GLKView(frame: .zero, context: context)
        super.init()
        pipRenderQueue.setSpecific(key: pipRenderQueueKey, value: ())
        glView.enableSetNeedsDisplay = false
        glView.isOpaque = true
        glView.backgroundColor = .black
        glView.drawableColorFormat = .RGBA8888
        glView.drawableDepthFormat = .formatNone
        glView.drawableStencilFormat = .formatNone
        glView.drawableMultisample = .multisampleNone
        glView.delegate = self
    }

    deinit { detach() }

    func attach(mpv handle: OpaquePointer) -> Bool {
        detach()
        EAGLContext.setCurrent(glContext)
        defer { EAGLContext.setCurrent(nil) }
        var initParams = NuvioOpenGLInitParams(get_proc_address: nuvioGetOpenGLProcAddress, get_proc_address_ctx: nil)
        var api = Array("opengl".utf8CString)
        var createdContext: OpaquePointer?
        let status = api.withUnsafeMutableBufferPointer { apiPointer -> Int32 in
            withUnsafeMutablePointer(to: &initParams) { initPointer -> Int32 in
                var params = [
                    mpv_render_param(type: MPV_RENDER_PARAM_API_TYPE, data: UnsafeMutableRawPointer(apiPointer.baseAddress)),
                    mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, data: UnsafeMutableRawPointer(initPointer)),
                    mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil)
                ]
                return params.withUnsafeMutableBufferPointer { buffer -> Int32 in
                    guard let base = buffer.baseAddress else { return -1 }
                    return mpv_render_context_create(&createdContext, handle, base)
                }
            }
        }
        guard status >= 0, let createdContext else {
            InAppLogBridge.shared.error(tag: "MPV/iOS", message: "Unable to create primary libmpv OpenGL render context status=\(status)")
            return false
        }
        renderContext = createdContext
        mpv_render_context_set_update_callback(createdContext, { userData in
            guard let userData else { return }
            let surface = Unmanaged<MPVPrimaryRenderSurface>.fromOpaque(userData).takeUnretainedValue()
            surface.handleRenderUpdate()
        }, Unmanaged.passUnretained(self).toOpaque())
        InAppLogBridge.shared.info(tag: "MPV/iOS", message: "Primary libmpv OpenGL render context ready")
        requestRenderBurst(reason: "attach", count: 3)
        return true
    }

    func detach() {
        stopPictureInPictureRendering(removingDisplayedImage: true)
        guard let context = renderContext else { return }
        renderContext = nil
        renderScheduled = false
        EAGLContext.setCurrent(glContext)
        mpv_render_context_set_update_callback(context, nil, nil)
        mpv_render_context_free(context)
        glView.deleteDrawable()
        EAGLContext.setCurrent(nil)
        destroyPiPFramebuffer()
        textureCache = nil
        pixelBufferPool = nil
        pixelBufferPoolAuxAttributes = nil
        formatDescription = nil
    }

    func setExtendedDynamicRangePreferred(_ enabled: Bool) {
        // OpenGL/GLKView cannot expose CAMetalLayer EDR. HDR/DV is tone-mapped by mpv in this path.
    }

    func requestRenderBurst(reason: String, count: Int = 2) {
        forcedInlineRenderCount = max(forcedInlineRenderCount, count)
        scheduleRender(force: true)
    }

    func startPictureInPicturePriming(onFirstFrame: @escaping () -> Void) {
        beginPictureInPicturePriming(
            stopAfterFirstFrame: true,
            logMessage: "Primary-renderer PiP priming started",
            onFirstFrame: onFirstFrame
        )
    }

    func prepareAutomaticPictureInPicturePreview(onFirstFrame: @escaping () -> Void) {
        guard !pictureInPictureActive else { return }
        beginPictureInPicturePriming(
            stopAfterFirstFrame: true,
            logMessage: "Automatic PiP preview prewarming started",
            onFirstFrame: onFirstFrame
        )
    }

    private func beginPictureInPicturePriming(
        stopAfterFirstFrame: Bool,
        logMessage: String,
        onFirstFrame: @escaping () -> Void
    ) {
        guard renderContext != nil else { return }
        pictureInPicturePriming = true
        pictureInPictureActive = false
        stopPrimingAfterFirstFrame = stopAfterFirstFrame
        hasEnqueuedPiPFrame = false
        lastPiPFramePTS = -1
        firstPiPFrameHandler = onFirstFrame
        resetPictureInPictureBuffers(removingDisplayedImage: true)
        scheduleRender(force: true)
        InAppLogBridge.shared.info(tag: "PiP/iOS", message: logMessage)
    }

    func markPictureInPictureActive(_ active: Bool) {
        pictureInPictureActive = active
        pictureInPicturePriming = false
        if active {
            resetPiPDiagnosticsWindow()
            startPiPRenderTimer()
            schedulePiPRender(force: true)
        } else {
            stopPictureInPictureRendering(removingDisplayedImage: true)
            requestRenderBurst(reason: "pip-stop", count: 4)
        }
    }

    func stopPictureInPictureRendering(removingDisplayedImage: Bool) {
        pictureInPicturePriming = false
        pictureInPictureActive = false
        stopPrimingAfterFirstFrame = false
        firstPiPFrameHandler = nil
        stopPiPRenderTimer()
        drainPiPRenderQueue()
        resetPictureInPictureBuffers(removingDisplayedImage: removingDisplayedImage)
    }

    func setPaused(_ paused: Bool) {
        if paused {
            stopPiPRenderTimer()
            scheduleRender(force: true)
        } else if pictureInPictureActive {
            startPiPRenderTimer()
            schedulePiPRender(force: true)
        } else if pictureInPicturePriming {
            scheduleRender(force: true)
        }
    }

    func didSeek() {
        hasEnqueuedPiPFrame = false
        lastPiPFramePTS = -1
        if pictureInPicturePriming || pictureInPictureActive {
            if pictureInPictureActive {
                stopPiPRenderTimer()
                drainPiPRenderQueue()
            }
            resetPictureInPictureBuffers(removingDisplayedImage: false)
            if pictureInPictureActive {
                startPiPRenderTimer()
                schedulePiPRender(force: true)
            } else {
                scheduleRender(force: true)
            }
        }
        requestRenderBurst(reason: "seek", count: 3)
    }


    private func handleRenderUpdate() {
        if !pictureInPictureActive {
            scheduleRender()
        }
    }

    private func schedulePiPRender(force: Bool = false) {
        pipRenderScheduleLock.lock()
        if pipRenderScheduled {
            pipRenderScheduleLock.unlock()
            return
        }
        pipRenderScheduled = true
        pipRenderScheduleLock.unlock()

        pipRenderQueue.async { [weak self] in
            guard let self else { return }
            self.pipRenderScheduleLock.lock()
            self.pipRenderScheduled = false
            self.pipRenderScheduleLock.unlock()
            self.renderPictureInPictureTick(force: force)
        }
    }

    private func renderPictureInPictureTick(force: Bool) {
        guard pictureInPictureActive, let context = renderContext else { return }
        _ = mpv_render_context_update(context)
        renderPictureInPicture(context: context, force: true)

        pipCadenceCheckCounter += 1
        if pipCadenceCheckCounter >= 30 {
            pipCadenceCheckCounter = 0
            refreshPiPRenderTimerCadenceIfNeeded()
        }
    }

    private func scheduleRender(force: Bool = false) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.renderContext != nil else { return }
            if force { self.forcedInlineRenderCount = max(self.forcedInlineRenderCount, 1) }
            guard !self.renderScheduled else { return }
            self.renderScheduled = true
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.renderScheduled = false
                self.renderFrame(force: force)
            }
        }
    }

    private func renderFrame(force: Bool = false) {
        if pictureInPictureActive {
            schedulePiPRender(force: force)
            return
        }
        guard let context = renderContext else { return }
        let updateFlags = UInt32(mpv_render_context_update(context))
        let hasFrameUpdate = updateFlags & MPV_RENDER_UPDATE_FRAME.rawValue != 0
        let shouldForceInline = forcedInlineRenderCount > 0 || force
        if forcedInlineRenderCount > 0 { forcedInlineRenderCount -= 1 }
        guard hasFrameUpdate || shouldForceInline || pictureInPicturePriming || pictureInPictureActive else { return }

        if UIApplication.shared.applicationState != .background && !pictureInPictureActive {
            renderInline(context: context)
        }
        if pictureInPicturePriming {
            renderPictureInPicture(context: context, force: force)
        }
        if updateFlags > 0 { scheduleRender() }
    }

    private func renderInline(context: OpaquePointer) {
        guard glView.bounds.width > 1, glView.bounds.height > 1 else { return }
        inlineRenderContextForDisplay = context
        glView.display()
        inlineRenderContextForDisplay = nil
    }

    func glkView(_ view: GLKView, drawIn rect: CGRect) {
        guard let context = inlineRenderContextForDisplay else { return }
        guard view.drawableWidth > 1, view.drawableHeight > 1 else { return }
        EAGLContext.setCurrent(glContext)
        view.bindDrawable()
        glClearColor(0, 0, 0, 1)
        glClear(GLbitfield(GL_COLOR_BUFFER_BIT))
        var framebuffer: GLint = 0
        glGetIntegerv(GLenum(GL_FRAMEBUFFER_BINDING), &framebuffer)
        glViewport(0, 0, GLsizei(view.drawableWidth), GLsizei(view.drawableHeight))
        var fbo = NuvioOpenGLFBO(
            fbo: Int32(framebuffer),
            w: Int32(view.drawableWidth),
            h: Int32(view.drawableHeight),
            internal_format: Int32(GL_RGBA)
        )
        var flipY: Int32 = 1
        let result = renderOpenGL(context: context, fbo: &fbo, flipY: &flipY, reportSwap: true)
        if result < 0 {
            InAppLogBridge.shared.warn(tag: "MPV/iOS", message: "Primary inline render failed status=\(result)")
        }
        EAGLContext.setCurrent(nil)
    }

    private func renderPictureInPicture(context: OpaquePointer, force: Bool) {
        guard displayLayer.isReadyForMoreMediaData else {
            pipRenderSkipNotReadyCount += 1
            emitPiPDiagnosticsIfNeeded()
            return
        }
        let renderStartedAt = CACurrentMediaTime()
        pipRenderAttemptCount += 1
        guard let target = targetRenderSize(for: videoSizeProvider()) else { return }
        let width = Int(target.width)
        let height = Int(target.height)
        guard width > 1, height > 1 else { return }
        let playbackPosition = playbackPositionProvider()
        if !force, hasEnqueuedPiPFrame, playbackPosition.isFinite, abs(playbackPosition - lastPiPFramePTS) < 0.015 { return }

        if poolWidth != width || poolHeight != height { recreatePixelBufferPool(width: width, height: height) }
        guard let cache = ensureTextureCache() else { return }
        guard let buffer = makePixelBuffer(width: width, height: height) else { return }
        var texture: CVOpenGLESTexture?
        let textureStatus = CVOpenGLESTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault, cache, buffer, nil,
            GLenum(GL_TEXTURE_2D), GLint(GL_RGBA), GLsizei(width), GLsizei(height),
            nuvioGLBGRA, GLenum(GL_UNSIGNED_BYTE), 0, &texture
        )
        guard textureStatus == kCVReturnSuccess, let texture else {
            InAppLogBridge.shared.warn(tag: "PiP/iOS", message: "Unable to create PiP GL texture status=\(textureStatus)")
            return
        }

        EAGLContext.setCurrent(glContext)
        let textureTarget = CVOpenGLESTextureGetTarget(texture)
        let textureName = CVOpenGLESTextureGetName(texture)
        glBindTexture(textureTarget, textureName)
        glTexParameteri(textureTarget, GLenum(GL_TEXTURE_MIN_FILTER), GLint(GL_LINEAR))
        glTexParameteri(textureTarget, GLenum(GL_TEXTURE_MAG_FILTER), GLint(GL_LINEAR))
        glTexParameteri(textureTarget, GLenum(GL_TEXTURE_WRAP_S), GLint(GL_CLAMP_TO_EDGE))
        glTexParameteri(textureTarget, GLenum(GL_TEXTURE_WRAP_T), GLint(GL_CLAMP_TO_EDGE))

        var previousFramebuffer: GLint = 0
        glGetIntegerv(GLenum(GL_FRAMEBUFFER_BINDING), &previousFramebuffer)
        var previousViewport = [GLint](repeating: 0, count: 4)
        previousViewport.withUnsafeMutableBufferPointer { pointer in
            if let base = pointer.baseAddress { glGetIntegerv(GLenum(GL_VIEWPORT), base) }
        }
        if pipFramebuffer == 0 {
            glGenFramebuffers(1, &pipFramebuffer)
        }
        glBindFramebuffer(GLenum(GL_FRAMEBUFFER), pipFramebuffer)
        glFramebufferTexture2D(GLenum(GL_FRAMEBUFFER), GLenum(GL_COLOR_ATTACHMENT0), textureTarget, textureName, 0)
        let framebufferStatus = glCheckFramebufferStatus(GLenum(GL_FRAMEBUFFER))
        guard framebufferStatus == GLenum(GL_FRAMEBUFFER_COMPLETE) else {
            glBindFramebuffer(GLenum(GL_FRAMEBUFFER), GLuint(previousFramebuffer))
            EAGLContext.setCurrent(nil)
            return
        }
        glViewport(0, 0, GLsizei(width), GLsizei(height))
        var fbo = NuvioOpenGLFBO(fbo: Int32(pipFramebuffer), w: Int32(width), h: Int32(height), internal_format: Int32(GL_RGBA))
        var flipY: Int32 = 0
        let renderResult = renderOpenGL(context: context, fbo: &fbo, flipY: &flipY, reportSwap: true)
        glFinish()
        glViewport(previousViewport[0], previousViewport[1], GLsizei(previousViewport[2]), GLsizei(previousViewport[3]))
        glBindFramebuffer(GLenum(GL_FRAMEBUFFER), GLuint(previousFramebuffer))
        if pipRenderAttemptCount % 120 == 0 {
            CVOpenGLESTextureCacheFlush(cache, 0)
        }
        EAGLContext.setCurrent(nil)
        pipRenderDurationTotal += CACurrentMediaTime() - renderStartedAt
        guard renderResult >= 0 else {
            InAppLogBridge.shared.warn(tag: "PiP/iOS", message: "Primary PiP render failed status=\(renderResult)")
            emitPiPDiagnosticsIfNeeded()
            return
        }
        enqueue(buffer: buffer, playbackPosition: playbackPosition)
        emitPiPDiagnosticsIfNeeded()
    }

    private func renderOpenGL(context: OpaquePointer, fbo: inout NuvioOpenGLFBO, flipY: inout Int32, reportSwap: Bool) -> Int32 {
        let result = withUnsafeMutablePointer(to: &fbo) { fboPointer in
            withUnsafeMutablePointer(to: &flipY) { flipPointer in
                withUnsafeMutablePointer(to: &blockForTargetTime) { blockPointer in
                    openGLRenderParams[0] = mpv_render_param(type: MPV_RENDER_PARAM_OPENGL_FBO, data: UnsafeMutableRawPointer(fboPointer))
                    openGLRenderParams[1] = mpv_render_param(type: MPV_RENDER_PARAM_FLIP_Y, data: UnsafeMutableRawPointer(flipPointer))
                    openGLRenderParams[2] = mpv_render_param(type: MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME, data: UnsafeMutableRawPointer(blockPointer))
                    openGLRenderParams[3] = mpv_render_param(type: MPV_RENDER_PARAM_INVALID, data: nil)
                    return openGLRenderParams.withUnsafeMutableBufferPointer { buffer -> Int32 in
                        guard let base = buffer.baseAddress else { return -1 }
                        return mpv_render_context_render(context, base)
                    }
                }
            }
        }
        if result >= 0, reportSwap { mpv_render_context_report_swap(context) }
        return result
    }

    private func startPiPRenderTimer() {
        guard pipRenderTimer == nil else { return }
        let fps = sanitizedFrameRate()
        let intervalNanoseconds = max(16_666_667, Int(1_000_000_000.0 / fps))
        pipRenderTimerFrameRate = fps
        let timer = DispatchSource.makeTimerSource(queue: pipRenderQueue)
        timer.schedule(
            deadline: .now(),
            repeating: .nanoseconds(intervalNanoseconds),
            leeway: .milliseconds(1)
        )
        timer.setEventHandler { [weak self] in
            self?.renderPictureInPictureTick(force: true)
        }
        pipRenderTimer = timer
        pipDiagnosticsWindowStart = CACurrentMediaTime()
        pipDiagnosticsEnqueuedAtWindowStart = enqueuedPiPFrameCount
        InAppLogBridge.shared.info(
            tag: "PiP/iOS",
            message: "PiP render cadence started targetFps=\(String(format: "%.3f", fps)) sizeLimit=800"
        )
        timer.resume()
    }

    private func stopPiPRenderTimer() {
        pipRenderTimer?.setEventHandler {}
        pipRenderTimer?.cancel()
        pipRenderTimer = nil
        pipRenderTimerFrameRate = 0
        pipCadenceCheckCounter = 0
    }

    private func refreshPiPRenderTimerCadenceIfNeeded() {
        guard pictureInPictureActive, pipRenderTimer != nil else { return }
        let desiredFrameRate = sanitizedFrameRate()
        guard abs(desiredFrameRate - pipRenderTimerFrameRate) >= 0.5 else { return }

        let previousFrameRate = pipRenderTimerFrameRate
        stopPiPRenderTimer()
        InAppLogBridge.shared.info(
            tag: "PiP/iOS",
            message: "PiP render cadence adjusted from \(String(format: "%.3f", previousFrameRate)) to \(String(format: "%.3f", desiredFrameRate)) fps"
        )
        startPiPRenderTimer()
    }

    private func drainPiPRenderQueue() {
        guard DispatchQueue.getSpecific(key: pipRenderQueueKey) == nil else { return }
        pipRenderQueue.sync {}
    }

    private func makePixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
        var pixelBuffer: CVPixelBuffer?
        var status: CVReturn = kCVReturnError
        if let pool = pixelBufferPool {
            status = CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(kCFAllocatorDefault, pool, pixelBufferPoolAuxAttributes, &pixelBuffer)
        }
        if status != kCVReturnSuccess || pixelBuffer == nil {
            let attrs: [CFString: Any] = [
                kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
                kCVPixelBufferCGImageCompatibilityKey: kCFBooleanTrue!,
                kCVPixelBufferCGBitmapContextCompatibilityKey: kCFBooleanTrue!,
                kCVPixelBufferMetalCompatibilityKey: kCFBooleanTrue!,
                kCVPixelBufferOpenGLESCompatibilityKey: kCFBooleanTrue!,
                kCVPixelBufferWidthKey: width,
                kCVPixelBufferHeightKey: height,
                kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA
            ]
            status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer)
        }
        return status == kCVReturnSuccess ? pixelBuffer : nil
    }

    private func targetRenderSize(for source: CGSize) -> CGSize? {
        guard source.width > 0, source.height > 0 else { return nil }
        let maxSide: CGFloat = 800
        let scale = min(1.0, maxSide / max(source.width, source.height))
        return CGSize(width: max(2, floor(source.width * scale)), height: max(2, floor(source.height * scale)))
    }

    private func recreatePixelBufferPool(width: Int, height: Int) {
        pixelBufferPool = nil
        formatDescription = nil
        poolWidth = width
        poolHeight = height
        let attrs: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey: width,
            kCVPixelBufferHeightKey: height,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
            kCVPixelBufferMetalCompatibilityKey: kCFBooleanTrue!,
            kCVPixelBufferCGImageCompatibilityKey: kCFBooleanTrue!,
            kCVPixelBufferCGBitmapContextCompatibilityKey: kCFBooleanTrue!,
            kCVPixelBufferOpenGLESCompatibilityKey: kCFBooleanTrue!
        ]
        let poolAttrs: [CFString: Any] = [kCVPixelBufferPoolMinimumBufferCountKey: 6]
        let auxAttrs: [CFString: Any] = [kCVPixelBufferPoolAllocationThresholdKey: 8]
        var pool: CVPixelBufferPool?
        let status = CVPixelBufferPoolCreate(kCFAllocatorDefault, poolAttrs as CFDictionary, attrs as CFDictionary, &pool)
        if status == kCVReturnSuccess {
            pixelBufferPool = pool
            pixelBufferPoolAuxAttributes = auxAttrs as CFDictionary
        }
    }

    private func ensureTextureCache() -> CVOpenGLESTextureCache? {
        if let textureCache { return textureCache }
        var cache: CVOpenGLESTextureCache?
        let status = CVOpenGLESTextureCacheCreate(kCFAllocatorDefault, nil, glContext, nil, &cache)
        if status == kCVReturnSuccess {
            textureCache = cache
            return cache
        }
        return nil
    }

    private func enqueue(buffer: CVPixelBuffer, playbackPosition: Double) {
        let needsFlush = updateFormatDescriptionIfNeeded(for: buffer)
        guard let description = formatDescription else { return }
        let mediaSeconds = playbackPosition.isFinite ? max(0, playbackPosition) : 0
        let presentationTime = CMTime(seconds: mediaSeconds, preferredTimescale: 60_000)
        let frameDuration = CMTime(seconds: 1.0 / sanitizedFrameRate(), preferredTimescale: 60_000)
        var timing = CMSampleTimingInfo(duration: frameDuration, presentationTimeStamp: presentationTime, decodeTimeStamp: .invalid)
        var sampleBuffer: CMSampleBuffer?
        let result = CMSampleBufferCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, dataReady: true, makeDataReadyCallback: nil, refcon: nil, formatDescription: description, sampleTiming: &timing, sampleBufferOut: &sampleBuffer)
        guard result == noErr, let sampleBuffer else { return }
        let isFirst = !hasEnqueuedPiPFrame
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
           CFArrayGetCount(attachments) > 0 {
            let attachment = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(
                attachment,
                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
            )
        }
        if needsFlush || displayLayer.status == .failed {
            if #available(iOS 18.0, *) {
                displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
            } else {
                displayLayer.flushAndRemoveImage()
            }
        }
        let desiredRate = isPausedProvider() ? 0.0 : max(0.01, playbackRateProvider())
        if displayLayer.controlTimebase == nil {
            var timebase: CMTimebase?
            if CMTimebaseCreateWithSourceClock(
                allocator: kCFAllocatorDefault,
                sourceClock: CMClockGetHostTimeClock(),
                timebaseOut: &timebase
            ) == noErr, let timebase {
                displayLayer.controlTimebase = timebase
            }
        }
        if let timebase = displayLayer.controlTimebase {
            CMTimebaseSetTime(timebase, time: presentationTime)
            CMTimebaseSetRate(timebase, rate: desiredRate)
        }
        if #available(iOS 18.0, *) {
            displayLayer.sampleBufferRenderer.enqueue(sampleBuffer)
        } else {
            displayLayer.enqueue(sampleBuffer)
        }
        lastPiPFramePTS = mediaSeconds
        hasEnqueuedPiPFrame = true
        enqueuedPiPFrameCount += 1
        if isFirst {
            InAppLogBridge.shared.info(tag: "PiP/iOS", message: "First primary libmpv PiP frame enqueued pts=\(String(format: "%.2f", mediaSeconds)) size=\(CVPixelBufferGetWidth(buffer))x\(CVPixelBufferGetHeight(buffer)) layerStatus=\(displayLayer.status.rawValue)")
            if stopPrimingAfterFirstFrame {
                pictureInPicturePriming = false
                stopPrimingAfterFirstFrame = false
            }
            if let handler = firstPiPFrameHandler {
                firstPiPFrameHandler = nil
                handler()
            }
        }
    }

    private func resetPiPDiagnosticsWindow() {
        enqueuedPiPFrameCount = 0
        pipRenderAttemptCount = 0
        pipRenderSkipNotReadyCount = 0
        pipRenderDurationTotal = 0
        pipDiagnosticsWindowStart = CACurrentMediaTime()
        pipDiagnosticsEnqueuedAtWindowStart = 0
    }

    private func emitPiPDiagnosticsIfNeeded() {
        let now = CACurrentMediaTime()
        if pipDiagnosticsWindowStart == 0 {
            pipDiagnosticsWindowStart = now
            pipDiagnosticsEnqueuedAtWindowStart = enqueuedPiPFrameCount
            return
        }
        let elapsed = now - pipDiagnosticsWindowStart
        guard elapsed >= 5.0 else { return }
        let deliveredFrames = enqueuedPiPFrameCount - pipDiagnosticsEnqueuedAtWindowStart
        let deliveredFps = Double(deliveredFrames) / elapsed
        let targetFps = sanitizedFrameRate()
        let averageRenderMs = pipRenderAttemptCount > 0
            ? (pipRenderDurationTotal / Double(pipRenderAttemptCount)) * 1000.0
            : 0
        let frameBudgetMs = 1000.0 / targetFps
        let renderLoadPercent = frameBudgetMs > 0 ? (averageRenderMs / frameBudgetMs) * 100.0 : 0
        InAppLogBridge.shared.info(
            tag: "PiP/iOS",
            message: "PiP cadence actualFps=\(String(format: "%.2f", deliveredFps)) targetFps=\(String(format: "%.2f", targetFps)) avgRenderMs=\(String(format: "%.2f", averageRenderMs)) renderLoad=\(String(format: "%.0f", renderLoadPercent))% rendered=\(pipRenderAttemptCount) notReady=\(pipRenderSkipNotReadyCount)"
        )
        pipDiagnosticsWindowStart = now
        pipDiagnosticsEnqueuedAtWindowStart = enqueuedPiPFrameCount
        pipRenderAttemptCount = 0
        pipRenderSkipNotReadyCount = 0
        pipRenderDurationTotal = 0
    }

    private func updateFormatDescriptionIfNeeded(for buffer: CVPixelBuffer) -> Bool {
        let width = Int32(CVPixelBufferGetWidth(buffer))
        let height = Int32(CVPixelBufferGetHeight(buffer))
        let format = CVPixelBufferGetPixelFormatType(buffer)
        if let description = formatDescription {
            let dimensions = CMVideoFormatDescriptionGetDimensions(description)
            if dimensions.width == width, dimensions.height == height, CMFormatDescriptionGetMediaSubType(description) == format { return false }
        }
        var newDescription: CMVideoFormatDescription?
        let status = CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, formatDescriptionOut: &newDescription)
        if status == noErr, let newDescription {
            formatDescription = newDescription
            return true
        }
        return false
    }


    private func sanitizedFrameRate() -> Double {
        let fps = videoFrameRateProvider()
        guard fps.isFinite, fps >= 12 else { return 30.0 }
        return min(30.0, max(12.0, fps))
    }

    private func destroyPiPFramebuffer() {
        guard pipFramebuffer != 0 else { return }
        EAGLContext.setCurrent(glContext)
        glDeleteFramebuffers(1, &pipFramebuffer)
        pipFramebuffer = 0
        EAGLContext.setCurrent(nil)
    }

    private func resetPictureInPictureBuffers(removingDisplayedImage: Bool) {
        hasEnqueuedPiPFrame = false
        lastPiPFramePTS = -1
        pixelBufferPool = nil
        pixelBufferPoolAuxAttributes = nil
        formatDescription = nil
        poolWidth = 0
        poolHeight = 0
        enqueuedPiPFrameCount = 0
        pipRenderAttemptCount = 0
        pipRenderSkipNotReadyCount = 0
        pipRenderDurationTotal = 0
        pipDiagnosticsWindowStart = 0
        pipDiagnosticsEnqueuedAtWindowStart = 0
        destroyPiPFramebuffer()
        if let textureCache { CVOpenGLESTextureCacheFlush(textureCache, 0) }
        textureCache = nil
        displayLayer.controlTimebase = nil
        if #available(iOS 18.0, *) {
            displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: removingDisplayedImage, completionHandler: nil)
        } else if removingDisplayedImage {
            displayLayer.flushAndRemoveImage()
        } else {
            displayLayer.flush()
        }
    }
}
