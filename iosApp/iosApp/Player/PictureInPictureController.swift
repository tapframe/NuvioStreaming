import AVFoundation
import AVKit
import CoreMedia
import ComposeApp

protocol PictureInPictureControllerDelegate: AnyObject {
    func pictureInPictureControllerWillStart(_ controller: PictureInPictureController)
    func pictureInPictureControllerDidStart(_ controller: PictureInPictureController)
    func pictureInPictureController(_ controller: PictureInPictureController, failedToStart error: Error)
    func pictureInPictureControllerWillStop(_ controller: PictureInPictureController)
    func pictureInPictureControllerDidStop(_ controller: PictureInPictureController)
    func pictureInPictureControllerRestoreUI(_ controller: PictureInPictureController, completion: @escaping (Bool) -> Void)
    func pictureInPictureControllerPlay(_ controller: PictureInPictureController)
    func pictureInPictureControllerPause(_ controller: PictureInPictureController)
    func pictureInPictureController(_ controller: PictureInPictureController, skipBy interval: CMTime)
    func pictureInPictureControllerIsPlaying(_ controller: PictureInPictureController) -> Bool
    func pictureInPictureControllerDuration(_ controller: PictureInPictureController) -> Double
    func pictureInPictureControllerCurrentTime(_ controller: PictureInPictureController) -> Double
}

final class PictureInPictureController: NSObject {
    private let displayLayer: AVSampleBufferDisplayLayer
    private var controller: AVPictureInPictureController?
    private var startPending = false
    private var startTransitionBegan = false
    private var currentStartSource: String?
    private var deferredAutomaticStartFailure: DispatchWorkItem?
    private var deferredAutomaticStartFailureError: NSError?

    weak var delegate: PictureInPictureControllerDelegate?

    var isSupported: Bool {
        AVPictureInPictureController.isPictureInPictureSupported()
    }

    var isActive: Bool {
        controller?.isPictureInPictureActive ?? false
    }

    var isStartPending: Bool {
        startPending
    }

    var hasStartedTransition: Bool {
        startTransitionBegan
    }

    var isPossible: Bool {
        controller?.isPictureInPicturePossible ?? false
    }

    init(displayLayer: AVSampleBufferDisplayLayer) {
        self.displayLayer = displayLayer
        super.init()
        configureController()
    }

    private func configureController() {
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            InAppLogBridge.shared.warn(tag: "PiP/iOS", message: "Picture in Picture is not supported on this device")
            return
        }

        let source = AVPictureInPictureController.ContentSource(
            sampleBufferDisplayLayer: displayLayer,
            playbackDelegate: self
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.delegate = self
        controller.requiresLinearPlayback = false
        controller.canStartPictureInPictureAutomaticallyFromInline = false
        self.controller = controller
        InAppLogBridge.shared.info(tag: "PiP/iOS", message: "Sample-buffer PiP controller initialized")
    }

    func start(source: String = "manual") {
        guard let controller else {
            InAppLogBridge.shared.warn(tag: "PiP/iOS", message: "PiP start ignored: controller unavailable")
            return
        }
        guard controller.isPictureInPicturePossible else {
            InAppLogBridge.shared.warn(tag: "PiP/iOS", message: "PiP start ignored: not possible yet layer=\(layerSnapshot())")
            return
        }
        guard !controller.isPictureInPictureActive, !startPending else { return }

        cancelDeferredAutomaticStartFailure()
        startPending = true
        startTransitionBegan = false
        currentStartSource = source
        controller.requiresLinearPlayback = false
        controller.invalidatePlaybackState()
        InAppLogBridge.shared.info(tag: "PiP/iOS", message: "Starting PiP source=\(source) layer=\(layerSnapshot())")
        controller.startPictureInPicture()
    }

    func stop(source: String) {
        cancelDeferredAutomaticStartFailure()
        startPending = false
        startTransitionBegan = false
        currentStartSource = nil
        InAppLogBridge.shared.info(tag: "PiP/iOS", message: "Stopping PiP source=\(source) active=\(isActive)")
        controller?.stopPictureInPicture()
    }

    func invalidatePlaybackState() {
        controller?.invalidatePlaybackState()
    }

    func setAutomaticStartEnabled(_ enabled: Bool) {
        controller?.canStartPictureInPictureAutomaticallyFromInline = enabled
    }

    private func cancelDeferredAutomaticStartFailure() {
        deferredAutomaticStartFailure?.cancel()
        deferredAutomaticStartFailure = nil
        deferredAutomaticStartFailureError = nil
    }

    private func completeFailedStart(_ error: Error, source: String?) {
        cancelDeferredAutomaticStartFailure()
        startPending = false
        startTransitionBegan = false
        currentStartSource = nil
        let nsError = error as NSError
        InAppLogBridge.shared.error(
            tag: "PiP/iOS",
            message: "PiP failed to start source=\(source ?? "unknown") error=\(nsError.domain)#\(nsError.code): \(error.localizedDescription)"
        )
        delegate?.pictureInPictureController(self, failedToStart: error)
    }

    private func handlePlaybackRequest(playing: Bool) {
        InAppLogBridge.shared.debug(
            tag: "PiP/iOS",
            message: "AVKit playback request playing=\(playing) active=\(isActive) startPending=\(startPending) source=\(currentStartSource ?? "none")"
        )
        if playing {
            delegate?.pictureInPictureControllerPlay(self)
        } else {
            delegate?.pictureInPictureControllerPause(self)
        }
        DispatchQueue.main.async { [weak self] in
            self?.controller?.invalidatePlaybackState()
        }
    }

    private func sanitizedPlaybackTimes() -> (current: Double, duration: Double) {
        let rawCurrent = delegate?.pictureInPictureControllerCurrentTime(self) ?? 0
        let rawDuration = delegate?.pictureInPictureControllerDuration(self) ?? 0
        let current = rawCurrent.isFinite ? max(0, rawCurrent) : 0
        let duration = rawDuration.isFinite && rawDuration > max(5, current + 1) ? rawDuration : max(600, current + 600)
        return (min(current, max(0, duration - 0.5)), duration)
    }

    private func layerSnapshot() -> String {
        let nsError = displayLayer.error.map { $0 as NSError }
        let errorText = nsError.map { "\($0.domain)#\($0.code)" } ?? "nil"
        return "ready=\(displayLayer.isReadyForMoreMediaData) status=\(layerStatusName(displayLayer.status)) error=\(errorText) hidden=\(displayLayer.isHidden) opacity=\(String(format: "%.2f", displayLayer.opacity)) frame=\(String(format: "%.0fx%.0f", displayLayer.bounds.width, displayLayer.bounds.height)) timebase=\(displayLayer.controlTimebase != nil)"
    }

    private func layerStatusName(_ status: AVQueuedSampleBufferRenderingStatus) -> String {
        switch status {
        case .unknown: return "unknown"
        case .rendering: return "rendering"
        case .failed: return "failed"
        @unknown default: return "unknown"
        }
    }
}

extension PictureInPictureController: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerWillStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        startTransitionBegan = true
        delegate?.pictureInPictureControllerWillStart(self)
    }

    func pictureInPictureControllerDidStartPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        let recoveredError = deferredAutomaticStartFailureError
        cancelDeferredAutomaticStartFailure()
        startPending = false
        currentStartSource = nil
        if let recoveredError {
            InAppLogBridge.shared.warn(
                tag: "PiP/iOS",
                message: "Ignoring transient automatic PiP start failure because PiP subsequently started error=\(recoveredError.domain)#\(recoveredError.code)"
            )
        }
        InAppLogBridge.shared.info(tag: "PiP/iOS", message: "PiP did start")
        delegate?.pictureInPictureControllerDidStart(self)
    }

    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        let source = currentStartSource
        guard source == "automatic-home" else {
            completeFailedStart(error, source: source)
            return
        }

        deferredAutomaticStartFailure?.cancel()
        let nsError = error as NSError
        deferredAutomaticStartFailureError = nsError
        InAppLogBridge.shared.warn(
            tag: "PiP/iOS",
            message: "AVKit provisionally reported automatic PiP start failure error=\(nsError.domain)#\(nsError.code) willStartReceived=\(startTransitionBegan); waiting briefly for didStart"
        )

        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard !self.isActive else {
                self.cancelDeferredAutomaticStartFailure()
                return
            }
            self.completeFailedStart(error, source: source)
        }
        deferredAutomaticStartFailure = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.25, execute: workItem)
    }

    func pictureInPictureControllerWillStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        cancelDeferredAutomaticStartFailure()
        startPending = false
        startTransitionBegan = false
        currentStartSource = nil
        delegate?.pictureInPictureControllerWillStop(self)
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        cancelDeferredAutomaticStartFailure()
        startTransitionBegan = false
        currentStartSource = nil
        InAppLogBridge.shared.info(tag: "PiP/iOS", message: "PiP did stop")
        delegate?.pictureInPictureControllerDidStop(self)
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
    ) {
        delegate?.pictureInPictureControllerRestoreUI(self, completion: completionHandler)
    }
}

extension PictureInPictureController: AVPictureInPictureSampleBufferPlaybackDelegate {
    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, setPlaying playing: Bool) {
        handlePlaybackRequest(playing: playing)
    }

    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, skipByInterval skipInterval: CMTime, completion completionHandler: @escaping () -> Void) {
        delegate?.pictureInPictureController(self, skipBy: skipInterval)
        DispatchQueue.main.async { [weak self] in
            self?.controller?.invalidatePlaybackState()
        }
        completionHandler()
    }

    func pictureInPictureControllerTimeRangeForPlayback(_ pictureInPictureController: AVPictureInPictureController) -> CMTimeRange {
        let times = sanitizedPlaybackTimes()
        return CMTimeRange(start: .zero, duration: CMTime(seconds: times.duration, preferredTimescale: 1000))
    }

    func pictureInPictureControllerIsPlaybackPaused(_ pictureInPictureController: AVPictureInPictureController) -> Bool {
        !(delegate?.pictureInPictureControllerIsPlaying(self) ?? false)
    }

    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, didTransitionToRenderSize newRenderSize: CMVideoDimensions) {
        // Required by AVPictureInPictureSampleBufferPlaybackDelegate on newer SDKs.
        // The sample-buffer renderer keeps its own fixed SDR render size, so no action is needed here.
    }

    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, setPlaying playing: Bool, completion: @escaping () -> Void) {
        handlePlaybackRequest(playing: playing)
        completion()
    }

    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, timeRangeForPlayback sampleBufferDisplayLayer: AVSampleBufferDisplayLayer) -> CMTimeRange {
        let times = sanitizedPlaybackTimes()
        return CMTimeRange(start: .zero, duration: CMTime(seconds: times.duration, preferredTimescale: 1000))
    }

    func pictureInPictureController(_ pictureInPictureController: AVPictureInPictureController, currentTimeFor sampleBufferDisplayLayer: AVSampleBufferDisplayLayer) -> CMTime {
        let times = sanitizedPlaybackTimes()
        return CMTime(seconds: times.current, preferredTimescale: 1000)
    }
}
