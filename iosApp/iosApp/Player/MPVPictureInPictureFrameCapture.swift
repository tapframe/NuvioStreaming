import UIKit
import AVFoundation
import CoreMedia
import CoreVideo
import Metal
import ComposeApp

/// Feeds Picture in Picture from the frames mpv already rendered to the Metal layer.
///
/// The previous approach swapped mpv's video output to `vo=libmpv` on OpenGL ES so it could read
/// frames back. That works, but OpenGL ES on iOS has no EDR path at all — no `CAMetalLayer`, no
/// extended-range pixel formats — so enabling PiP silently downgraded *inline* playback to 8-bit
/// SDR and HDR content came out tone-mapped and washed out.
///
/// Here mpv keeps rendering through `gpu-next`/MoltenVK into the EDR-capable `CAMetalLayer`
/// exactly as before. `MetalLayer` hands us each presented drawable, and we blit it into a
/// `CVPixelBuffer` for `AVSampleBufferDisplayLayer`. Nothing about the on-screen pipeline changes,
/// there is no mpv re-init when entering PiP, and because the source is already EDR the PiP window
/// can carry HDR too.
final class MPVPictureInPictureFrameCapture {
    private let displayLayer: AVSampleBufferDisplayLayer
    private let metalLayer: MetalLayer
    private let videoSizeProvider: () -> CGSize
    private let playbackPositionProvider: () -> Double
    private let videoFrameRateProvider: () -> Double
    private let playbackRateProvider: () -> Double
    private let isPausedProvider: () -> Bool

    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private var textureCache: CVMetalTextureCache?

    private let stateLock = NSLock()
    private var pixelBufferPool: CVPixelBufferPool?
    private var poolWidth = 0
    private var poolHeight = 0
    private var poolPixelFormat: OSType = 0
    private var formatDescription: CMVideoFormatDescription?

    private var isPriming = false
    private var isActive = false
    private var stopPrimingAfterFirstFrame = false
    private var burstFramesRemaining = 0
    private var firstFrameHandler: (() -> Void)?
    private var lastCaptureTime: CFTimeInterval = 0
    private var enqueuedFrameCount: UInt64 = 0
    private var loggedUnsupportedFormat = false
    private var extendedDynamicRangePreferred = true

    init?(
        displayLayer: AVSampleBufferDisplayLayer,
        metalLayer: MetalLayer,
        videoSizeProvider: @escaping () -> CGSize,
        playbackPositionProvider: @escaping () -> Double,
        videoFrameRateProvider: @escaping () -> Double,
        playbackRateProvider: @escaping () -> Double,
        isPausedProvider: @escaping () -> Bool
    ) {
        guard
            let device = metalLayer.device ?? MTLCreateSystemDefaultDevice(),
            let queue = device.makeCommandQueue()
        else {
            InAppLogBridge.shared.error(tag: "PiP/iOS", message: "Unable to create Metal device/queue for PiP capture")
            return nil
        }

        self.displayLayer = displayLayer
        self.metalLayer = metalLayer
        self.videoSizeProvider = videoSizeProvider
        self.playbackPositionProvider = playbackPositionProvider
        self.videoFrameRateProvider = videoFrameRateProvider
        self.playbackRateProvider = playbackRateProvider
        self.isPausedProvider = isPausedProvider
        self.device = device
        self.commandQueue = queue

        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)

        // Reading back the drawable requires giving up the framebuffer-only optimisation. This is
        // the only cost the inline pipeline pays for PiP support, and only when it is switched on.
        metalLayer.framebufferOnly = false
        metalLayer.onDrawablePresented = { [weak self] drawable in
            self?.handlePresentedDrawable(drawable)
        }
    }

    deinit { detach() }

    // MARK: - Lifecycle

    func detach() {
        metalLayer.isDrawableCaptureArmed = false
        metalLayer.onDrawablePresented = nil
        metalLayer.framebufferOnly = true
        stopPictureInPictureRendering(removingDisplayedImage: true)
    }

    /// Kept for source compatibility with the old OpenGL surface: the Metal layer's EDR flag is
    /// owned by the player, we only need to know which pixel format to allocate for PiP.
    func setExtendedDynamicRangePreferred(_ enabled: Bool) {
        stateLock.lock()
        extendedDynamicRangePreferred = enabled
        stateLock.unlock()
        if #available(iOS 17.0, *) {
            DispatchQueue.main.async { [weak self] in
                self?.displayLayer.wantsExtendedDynamicRangeContent = enabled
            }
        }
    }

    func setPaused(_ paused: Bool) {
        // A paused player stops presenting drawables, so grab a few frames to keep the PiP window
        // showing the current picture rather than whatever was last enqueued.
        if paused { requestRenderBurst(reason: "paused", count: 2) }
    }

    func didSeek() {
        requestRenderBurst(reason: "seek", count: 3)
    }

    /// Arms capture for the next `count` presented drawables.
    func requestRenderBurst(reason: String, count: Int = 2) {
        stateLock.lock()
        burstFramesRemaining = max(burstFramesRemaining, count)
        stateLock.unlock()
        updateArmedState()
    }

    func markPictureInPictureActive(_ active: Bool) {
        stateLock.lock()
        isActive = active
        if active { isPriming = false }
        stateLock.unlock()
        updateArmedState()
    }

    func startPictureInPicturePriming(onFirstFrame: @escaping () -> Void) {
        beginPriming(stopAfterFirstFrame: true, reason: "manual", onFirstFrame: onFirstFrame)
    }

    func prepareAutomaticPictureInPicturePreview(onFirstFrame: @escaping () -> Void) {
        beginPriming(stopAfterFirstFrame: false, reason: "automatic", onFirstFrame: onFirstFrame)
    }

    func stopPictureInPictureRendering(removingDisplayedImage: Bool) {
        stateLock.lock()
        isPriming = false
        isActive = false
        stopPrimingAfterFirstFrame = false
        burstFramesRemaining = 0
        firstFrameHandler = nil
        stateLock.unlock()
        updateArmedState()

        if removingDisplayedImage {
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if #available(iOS 18.0, *) {
                    self.displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
                } else {
                    self.displayLayer.flushAndRemoveImage()
                }
            }
        }
    }

    /// Non-zero once MoltenVK has routed at least one drawable through our layer subclass. If this
    /// stays at zero while PiP is enabled the hook is not firing and PiP will show nothing.
    var capturedDrawableCount: UInt64 { metalLayer.capturedDrawableCount }

    var enqueuedFrames: UInt64 {
        stateLock.lock()
        defer { stateLock.unlock() }
        return enqueuedFrameCount
    }

    // MARK: - Internals

    private func beginPriming(stopAfterFirstFrame: Bool, reason: String, onFirstFrame: @escaping () -> Void) {
        stateLock.lock()
        isPriming = true
        stopPrimingAfterFirstFrame = stopAfterFirstFrame
        firstFrameHandler = onFirstFrame
        burstFramesRemaining = max(burstFramesRemaining, 3)
        stateLock.unlock()
        updateArmedState()
        InAppLogBridge.shared.info(tag: "PiP/iOS", message: "PiP frame capture priming started reason=\(reason)")
    }

    private func updateArmedState() {
        stateLock.lock()
        let armed = isPriming || isActive || burstFramesRemaining > 0
        stateLock.unlock()
        metalLayer.isDrawableCaptureArmed = armed
    }

    private func handlePresentedDrawable(_ drawable: CAMetalDrawable) {
        stateLock.lock()
        let priming = isPriming
        let active = isActive
        let burst = burstFramesRemaining
        let frameRate = max(12.0, videoFrameRateProvider())
        let shouldCapture = priming || active || burst > 0
        if !shouldCapture {
            stateLock.unlock()
            return
        }
        // Throttle to the video's own cadence; the layer can present faster than the source.
        let now = CACurrentMediaTime()
        let minimumInterval = 1.0 / (frameRate * max(0.5, playbackRateProvider()))
        if active && !priming && burst == 0 && (now - lastCaptureTime) < minimumInterval {
            stateLock.unlock()
            return
        }
        lastCaptureTime = now
        if burstFramesRemaining > 0 { burstFramesRemaining -= 1 }
        stateLock.unlock()

        enqueue(texture: drawable.texture)
        updateArmedState()
    }

    private func enqueue(texture source: MTLTexture) {
        guard let pixelFormat = Self.pixelBufferFormat(for: source.pixelFormat) else {
            stateLock.lock()
            let alreadyLogged = loggedUnsupportedFormat
            loggedUnsupportedFormat = true
            stateLock.unlock()
            if !alreadyLogged {
                InAppLogBridge.shared.error(
                    tag: "PiP/iOS",
                    message: "Unsupported drawable pixel format \(source.pixelFormat.rawValue) for PiP capture"
                )
            }
            return
        }

        guard
            let pixelBuffer = makePixelBuffer(width: source.width, height: source.height, format: pixelFormat),
            let destination = makeTexture(from: pixelBuffer, pixelFormat: source.pixelFormat)
        else {
            return
        }

        guard
            let commandBuffer = commandQueue.makeCommandBuffer(),
            let blit = commandBuffer.makeBlitCommandEncoder()
        else {
            return
        }

        blit.copy(from: source, to: destination)
        blit.endEncoding()
        commandBuffer.addCompletedHandler { [weak self] _ in
            self?.enqueueSampleBuffer(for: pixelBuffer)
        }
        commandBuffer.commit()
    }

    private func enqueueSampleBuffer(for pixelBuffer: CVPixelBuffer) {
        Self.attachColorAttributes(to: pixelBuffer)

        stateLock.lock()
        var description = formatDescription
        if description == nil ||
            !CMVideoFormatDescriptionMatchesImageBuffer(description!, imageBuffer: pixelBuffer) {
            var created: CMVideoFormatDescription?
            CMVideoFormatDescriptionCreateForImageBuffer(
                allocator: kCFAllocatorDefault,
                imageBuffer: pixelBuffer,
                formatDescriptionOut: &created
            )
            formatDescription = created
            description = created
        }
        stateLock.unlock()

        guard let description else { return }

        let position = playbackPositionProvider()
        let presentationTime = position.isFinite && position >= 0
            ? CMTime(seconds: position, preferredTimescale: 90_000)
            : CMTime(seconds: CACurrentMediaTime(), preferredTimescale: 90_000)

        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: Int32(max(12.0, videoFrameRateProvider()))),
            presentationTimeStamp: presentationTime,
            decodeTimeStamp: .invalid
        )

        var sampleBuffer: CMSampleBuffer?
        let status = CMSampleBufferCreateReadyWithImageBuffer(
            allocator: kCFAllocatorDefault,
            imageBuffer: pixelBuffer,
            formatDescription: description,
            sampleTiming: &timing,
            sampleBufferOut: &sampleBuffer
        )
        guard status == noErr, let sampleBuffer else { return }

        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
           CFArrayGetCount(attachments) > 0 {
            let dictionary = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(
                dictionary,
                Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
            )
        }

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            if #available(iOS 18.0, *) {
                let renderer = self.displayLayer.sampleBufferRenderer
                guard renderer.isReadyForMoreMediaData else { return }
                renderer.enqueue(sampleBuffer)
            } else {
                guard self.displayLayer.isReadyForMoreMediaData else { return }
                self.displayLayer.enqueue(sampleBuffer)
            }

            self.stateLock.lock()
            self.enqueuedFrameCount &+= 1
            let handler = self.firstFrameHandler
            let shouldStop = self.stopPrimingAfterFirstFrame
            self.firstFrameHandler = nil
            if shouldStop { self.isPriming = false }
            self.stateLock.unlock()

            handler?()
            self.updateArmedState()
        }
    }

    private func makePixelBuffer(width: Int, height: Int, format: OSType) -> CVPixelBuffer? {
        stateLock.lock()
        if pixelBufferPool == nil || poolWidth != width || poolHeight != height || poolPixelFormat != format {
            poolWidth = width
            poolHeight = height
            poolPixelFormat = format
            formatDescription = nil
            let attributes: [CFString: Any] = [
                kCVPixelBufferPixelFormatTypeKey: format,
                kCVPixelBufferWidthKey: width,
                kCVPixelBufferHeightKey: height,
                kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary,
                kCVPixelBufferMetalCompatibilityKey: kCFBooleanTrue!,
            ]
            var pool: CVPixelBufferPool?
            let poolAttributes: [CFString: Any] = [kCVPixelBufferPoolMinimumBufferCountKey: 4]
            if CVPixelBufferPoolCreate(
                kCFAllocatorDefault,
                poolAttributes as CFDictionary,
                attributes as CFDictionary,
                &pool
            ) == kCVReturnSuccess {
                pixelBufferPool = pool
            }
        }
        let pool = pixelBufferPool
        stateLock.unlock()

        guard let pool else { return nil }
        var pixelBuffer: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer) == kCVReturnSuccess else {
            return nil
        }
        return pixelBuffer
    }

    private func makeTexture(from pixelBuffer: CVPixelBuffer, pixelFormat: MTLPixelFormat) -> MTLTexture? {
        guard let textureCache else { return nil }
        var cvTexture: CVMetalTexture?
        let status = CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault,
            textureCache,
            pixelBuffer,
            nil,
            pixelFormat,
            CVPixelBufferGetWidth(pixelBuffer),
            CVPixelBufferGetHeight(pixelBuffer),
            0,
            &cvTexture
        )
        guard status == kCVReturnSuccess, let cvTexture else { return nil }
        return CVMetalTextureGetTexture(cvTexture)
    }

    /// `MTLBlitCommandEncoder` cannot convert between formats, so the destination buffer must match
    /// the drawable exactly. Anything not listed here is skipped rather than shown with wrong
    /// colours.
    private static func pixelBufferFormat(for format: MTLPixelFormat) -> OSType? {
        switch format {
        case .bgra8Unorm, .bgra8Unorm_srgb:
            return kCVPixelFormatType_32BGRA
        case .rgba16Float:
            return kCVPixelFormatType_64RGBAHalf
        case .bgr10_xr, .bgr10_xr_srgb:
            return kCVPixelFormatType_30RGBLEPackedWideGamut
        case .bgra10_xr, .bgra10_xr_srgb:
            return kCVPixelFormatType_64RGBALE
        default:
            return nil
        }
    }

    /// Without these the display layer has no idea the buffer is BT.2020 PQ and renders it as if it
    /// were BT.709 — the same washed-out look the OpenGL path produced, just one layer later.
    private static func attachColorAttributes(to pixelBuffer: CVPixelBuffer) {
        let isWideGamut: Bool
        switch CVPixelBufferGetPixelFormatType(pixelBuffer) {
        case kCVPixelFormatType_64RGBAHalf, kCVPixelFormatType_64RGBALE, kCVPixelFormatType_30RGBLEPackedWideGamut:
            isWideGamut = true
        default:
            isWideGamut = false
        }

        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferColorPrimariesKey,
            isWideGamut ? kCVImageBufferColorPrimaries_ITU_R_2020 : kCVImageBufferColorPrimaries_ITU_R_709_2,
            .shouldPropagate
        )
        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferTransferFunctionKey,
            isWideGamut ? kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ : kCVImageBufferTransferFunction_ITU_R_709_2,
            .shouldPropagate
        )
        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferYCbCrMatrixKey,
            isWideGamut ? kCVImageBufferYCbCrMatrix_ITU_R_2020 : kCVImageBufferYCbCrMatrix_ITU_R_709_2,
            .shouldPropagate
        )
    }
}
