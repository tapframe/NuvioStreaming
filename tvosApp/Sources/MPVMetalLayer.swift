import Metal
import QuartzCore

final class MPVMetalLayer: CAMetalLayer {
    override var drawableSize: CGSize {
        get { super.drawableSize }
        set {
            if newValue.width > 1, newValue.height > 1 {
                super.drawableSize = newValue
            }
        }
    }
}
