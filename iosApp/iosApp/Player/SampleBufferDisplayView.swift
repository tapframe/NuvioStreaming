import UIKit
import AVFoundation

final class SampleBufferDisplayView: UIView {
    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }

    var displayLayer: AVSampleBufferDisplayLayer {
        layer as! AVSampleBufferDisplayLayer
    }

    private(set) var pictureInPictureController: PictureInPictureController?

    weak var pictureInPictureDelegate: PictureInPictureControllerDelegate? {
        didSet {
            pictureInPictureController?.delegate = pictureInPictureDelegate
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        commonInit()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        backgroundColor = .black
        isUserInteractionEnabled = false
        displayLayer.videoGravity = .resizeAspect
        displayLayer.backgroundColor = UIColor.black.cgColor
        if #available(iOS 17.0, *) {
            displayLayer.wantsExtendedDynamicRangeContent = false
        }
        pictureInPictureController = PictureInPictureController(displayLayer: displayLayer)
        pictureInPictureController?.delegate = pictureInPictureDelegate
    }

    func flush() {
        if #available(iOS 18.0, *) {
            displayLayer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
        } else {
            displayLayer.flushAndRemoveImage()
        }
    }
}
