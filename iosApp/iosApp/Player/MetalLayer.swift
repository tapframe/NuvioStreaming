import Foundation
import UIKit
import QuartzCore

class MetalLayer: CAMetalLayer {
    /// Invoked on the thread that presented the drawable, once its contents are on screen.
    ///
    /// This is the hook that lets Picture in Picture reuse the frames mpv already rendered, instead
    /// of running a second, SDR-only render pipeline alongside it. MoltenVK implements its Vulkan
    /// swapchain on top of `CAMetalLayer.nextDrawable()`, so overriding it here catches every frame
    /// without mpv needing to know.
    var onDrawablePresented: ((CAMetalDrawable) -> Void)?

    /// Capture is off by default: `framebufferOnly` has to be disabled for the drawable texture to
    /// be readable, and that costs bandwidth, so it is only paid for when PiP is switched on.
    var isDrawableCaptureArmed = false

    /// Diagnostics. If this stays at zero while PiP is enabled, MoltenVK is not routing through
    /// this override and the capture approach cannot work on the current toolchain.
    private(set) var capturedDrawableCount: UInt64 = 0

    private let captureLock = NSLock()

    override var drawableSize: CGSize {
        get { return super.drawableSize }
        set {
            if Int(newValue.width) > 1 && Int(newValue.height) > 1 {
                super.drawableSize = newValue
            }
        }
    }

    override var wantsExtendedDynamicRangeContent: Bool {
        get { return super.wantsExtendedDynamicRangeContent }
        set {
            if Thread.isMainThread {
                super.wantsExtendedDynamicRangeContent = newValue
            } else {
                // mpv's vo thread sets this during video-output init while it holds the
                // core lock; a sync hop here deadlocks against main-thread property reads.
                DispatchQueue.main.async {
                    super.wantsExtendedDynamicRangeContent = newValue
                }
            }
        }
    }

    override func nextDrawable() -> CAMetalDrawable? {
        let drawable = super.nextDrawable()

        captureLock.lock()
        let armed = isDrawableCaptureArmed
        let handler = onDrawablePresented
        captureLock.unlock()

        guard armed, let drawable, let handler else { return drawable }

        // Waiting for presentation guarantees mpv's command buffer has completed, so the texture
        // can be read without any cross-queue synchronisation of our own.
        // The handler receives an MTLDrawable, which has no texture; capture the CAMetalDrawable
        // itself. Metal releases presented handlers after firing, so this does not leak.
        drawable.addPresentedHandler { [weak self] _ in
            guard let self else { return }
            self.captureLock.lock()
            self.capturedDrawableCount &+= 1
            self.captureLock.unlock()
            handler(drawable)
        }

        return drawable
    }
}
