import Foundation
import UIKit
import QuartzCore

class MetalLayer: CAMetalLayer {
    var onDrawablePresented: ((CAMetalDrawable) -> Void)?

    var isDrawableCaptureArmed = false

    private(set) var capturedDrawableCount: UInt64 = 0

    var capturesWithoutPresentation = false

    private(set) var nextDrawableCallCount: UInt64 = 0

    private var pendingDrawable: CAMetalDrawable?
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
        nextDrawableCallCount &+= 1
        let armed = isDrawableCaptureArmed
        let handler = onDrawablePresented
        let deferred = capturesWithoutPresentation
        let previous = pendingDrawable
        pendingDrawable = deferred ? drawable : nil
        captureLock.unlock()

        guard armed, let drawable, let handler else { return drawable }

        if deferred {
            if let previous {
                captureLock.lock()
                capturedDrawableCount &+= 1
                captureLock.unlock()
                handler(previous)
            }
            return drawable
        }

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
