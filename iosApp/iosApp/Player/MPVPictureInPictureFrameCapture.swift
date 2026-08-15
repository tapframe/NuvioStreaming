import UIKit
import AVFoundation
import CoreMedia
import CoreVideo
import Metal
import ComposeApp

final class MPVPictureInPictureFrameCapture {
    private let displayLayer: AVSampleBufferDisplayLayer
    private let metalLayer: MetalLayer
    private let videoSizeProvider: () -> CGSize
    private let playbackPositionProvider: () -> Double
    private let videoFrameRateProvider: () -> Double
    private let playbackRateProvider: () -> Double

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

    init?(
        displayLayer: AVSampleBufferDisplayLayer,
        metalLayer: MetalLayer,
        videoSizeProvider: @escaping () -> CGSize,
        playbackPositionProvider: @escaping () -> Double,
        videoFrameRateProvider: @escaping () -> Double,
        playbackRateProvider: @escaping () -> Double
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
        self.device = device
        self.commandQueue = queue

        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)

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

    func setExtendedDynamicRangePreferred(_ enabled: Bool) {
        if #available(iOS 17.0, *) {
            DispatchQueue.main.async { [weak self] in
                self?.displayLayer.wantsExtendedDynamicRangeContent = enabled
            }
        }
    }

    func setPaused(_ paused: Bool) {
        if paused { requestRenderBurst(reason: "paused", count: 2) }
    }

    func didSeek() {
        requestRenderBurst(reason: "seek", count: 3)
    }

    func setBackgrounded(_ backgrounded: Bool) {
        metalLayer.capturesWithoutPresentation = backgrounded
        metalLayer.releasePendingDrawable()
        InAppLogBridge.shared.info(
            tag: "PiP/iOS",
            message: "PiP capture mode=\(backgrounded ? "deferred" : "presented") " +
                "drawablesRequested=\(metalLayer.nextDrawableCallCount) " +
                "captured=\(metalLayer.capturedDrawableCount) enqueued=\(enqueuedFrames)"
        )
        if backgrounded { requestRenderBurst(reason: "background", count: 4) }
    }

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
        guard !metalLayer.isSuspended else { return }

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
        let now = CACurrentMediaTime()
        let minimumInterval = 1.0 / (frameRate * max(0.5, playbackRateProvider()))
        if burst == 0 && (now - lastCaptureTime) < minimumInterval * 0.5 {
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
                    message: "Unsupported drawable pixel format \(source.pixelFormat) " +
                        "(raw \(source.pixelFormat.rawValue)) for PiP capture"
                )
            }
            return
        }

        let region = videoRegion(in: source)

        guard
            let pixelBuffer = makePixelBuffer(
                width: region.size.width,
                height: region.size.height,
                format: pixelFormat
            ),
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

        blit.copy(
            from: source,
            sourceSlice: 0,
            sourceLevel: 0,
            sourceOrigin: region.origin,
            sourceSize: region.size,
            to: destination,
            destinationSlice: 0,
            destinationLevel: 0,
            destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0)
        )
        blit.endEncoding()
        commandBuffer.addCompletedHandler { [weak self] _ in
            self?.enqueueSampleBuffer(for: pixelBuffer)
        }
        commandBuffer.commit()
    }

    private func videoRegion(in texture: MTLTexture) -> (origin: MTLOrigin, size: MTLSize) {
        let whole = (
            origin: MTLOrigin(x: 0, y: 0, z: 0),
            size: MTLSize(width: texture.width, height: texture.height, depth: 1)
        )

        let video = videoSizeProvider()
        guard video.width > 0, video.height > 0, texture.width > 0, texture.height > 0 else {
            return whole
        }

        let videoAspect = Double(video.width) / Double(video.height)
        let textureAspect = Double(texture.width) / Double(texture.height)
        var fittedWidth = Double(texture.width)
        var fittedHeight = Double(texture.height)
        if videoAspect > textureAspect {
            fittedHeight = fittedWidth / videoAspect
        } else if videoAspect < textureAspect {
            fittedWidth = fittedHeight * videoAspect
        }

        let width = max(2, Int(fittedWidth.rounded(.down)) & ~1)
        let height = max(2, Int(fittedHeight.rounded(.down)) & ~1)
        guard width <= texture.width, height <= texture.height else { return whole }

        return (
            origin: MTLOrigin(x: (texture.width - width) / 2, y: (texture.height - height) / 2, z: 0),
            size: MTLSize(width: width, height: height, depth: 1)
        )
    }

    private func enqueueSampleBuffer(for pixelBuffer: CVPixelBuffer) {
        attachColorAttributes(to: pixelBuffer)

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
        case .bgr10a2Unorm:
            return kCVPixelFormatType_ARGB2101010LEPacked
        default:
            return nil
        }
    }

    private func attachColorAttributes(to pixelBuffer: CVPixelBuffer) {
        if let colorSpace = metalLayer.colorspace {
            CVBufferSetAttachment(
                pixelBuffer,
                kCVImageBufferCGColorSpaceKey,
                colorSpace,
                .shouldPropagate
            )
            return
        }

        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferColorPrimariesKey,
            kCVImageBufferColorPrimaries_ITU_R_709_2,
            .shouldPropagate
        )
        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferTransferFunctionKey,
            kCVImageBufferTransferFunction_ITU_R_709_2,
            .shouldPropagate
        )
        CVBufferSetAttachment(
            pixelBuffer,
            kCVImageBufferYCbCrMatrixKey,
            kCVImageBufferYCbCrMatrix_ITU_R_709_2,
            .shouldPropagate
        )
    }
}
