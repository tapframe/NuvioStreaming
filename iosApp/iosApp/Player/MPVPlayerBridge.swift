import Foundation
import UIKit
import AVFoundation
import Metal
import Libmpv
import ComposeApp

// MARK: - Player Bridge Implementation (Kotlin protocol conformance)

final class MPVPlayerBridgeImpl: NSObject, NuvioPlayerBridge {

    private var playerVC: MPVPlayerViewController?
    private var experimentalSinglePrimaryPictureInPictureEnabled = false

    func createPlayerViewController() -> UIViewController {
        return ensurePlayerViewController()
    }

    private func ensurePlayerViewController() -> MPVPlayerViewController {
        if let playerVC { return playerVC }
        let vc = MPVPlayerViewController(
            experimentalSinglePrimaryPictureInPictureEnabled: experimentalSinglePrimaryPictureInPictureEnabled
        )
        self.playerVC = vc
        return vc
    }

    func loadFile(url: String) { ensurePlayerViewController().loadFile(url) }
    func loadFileWithAudio(videoUrl: String, audioUrl: String?, headersJson: String?, subtitlesJson: String?) {
        ensurePlayerViewController().loadFile(
            videoUrl,
            audioUrl: audioUrl,
            requestHeaders: parseRequestHeaders(headersJson),
            subtitles: parseSubtitles(subtitlesJson)
        )
    }

    private func parseSubtitles(_ json: String?) -> [PluginSubtitle] {
        guard
            let json,
            let data = json.data(using: .utf8),
            let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else {
            return []
        }
        return raw.compactMap { dict in
            guard let url = dict["url"] as? String else { return nil }
            return PluginSubtitle(
                url: url,
                language: dict["language"] as? String ?? "Unknown",
                name: dict["name"] as? String,
                headers: dict["headers"] as? [String: String]
            )
        }
    }

    func play() { playerVC?.playPlayback() }
    func pause() { playerVC?.pausePlayback() }
    func seekTo(positionMs: Int64) { playerVC?.seekToMs(positionMs) }
    func seekBy(offsetMs: Int64) { playerVC?.seekByMs(offsetMs) }
    func retry() { playerVC?.retryPlayback() }
    func isPictureInPictureSupported() -> Bool { playerVC?.isPictureInPictureSupported() ?? false }
    func startPictureInPicture() { playerVC?.startPictureInPicture() }
    func setExperimentalSinglePrimaryPictureInPictureEnabled(enabled: Bool) {
        experimentalSinglePrimaryPictureInPictureEnabled = enabled
        playerVC?.setExperimentalSinglePrimaryPictureInPictureEnabled(enabled)
    }
    func updateNowPlayingMetadata(
        title: String,
        subtitle: String?,
        artworkUrl: String?
    ) {
        ensurePlayerViewController().updateNowPlayingMetadata(
            title: title,
            subtitle: subtitle,
            artworkUrl: artworkUrl
        )
    }
    func clearNowPlayingInfo() { playerVC?.clearNowPlayingInfo() }
    func configureVideoOutput(
        hardwareDecoder: String,
        targetColorspaceHint: Bool,
        toneMapping: String,
        hdrComputePeak: Bool,
        targetPrimaries: String,
        targetTransfer: String,
        extendedDynamicRange: Bool,
        deband: Bool,
        interpolation: Bool,
        brightness: Int32,
        contrast: Int32,
        saturation: Int32,
        gamma: Int32
    ) {
        playerVC?.configureVideoOutput(
            hardwareDecoder: hardwareDecoder,
            targetColorspaceHint: targetColorspaceHint,
            toneMapping: toneMapping,
            hdrComputePeak: hdrComputePeak,
            targetPrimaries: targetPrimaries,
            targetTransfer: targetTransfer,
            extendedDynamicRange: extendedDynamicRange,
            deband: deband,
            interpolation: interpolation,
            brightness: Int(brightness),
            contrast: Int(contrast),
            saturation: Int(saturation),
            gamma: Int(gamma)
        )
    }
    func configureAudioOutput(audioOutput: String) {
        playerVC?.configureAudioOutput(audioOutput: audioOutput)
    }
    func setPlaybackSpeed(speed: Float) { playerVC?.setSpeed(speed) }
    func getVolume() -> Float { playerVC?.getVolume() ?? 1.0 }
    func setVolume(volume: Float) { playerVC?.setVolume(volume) }
    func setMuted(muted: Bool) { playerVC?.setMuted(muted) }
    func setEmbeddedPreviewMode(enabled: Bool) { ensurePlayerViewController().setEmbeddedPreviewMode(enabled) }
    func setResizeMode(mode: Int32) { playerVC?.setResize(Int(mode)) }
    func syncVideoSurfaceLayout(width: Double, height: Double) {
        playerVC?.syncVideoSurfaceLayout(size: CGSize(width: width, height: height))
    }

    // Audio tracks
    func getAudioTrackCount() -> Int32 { Int32(playerVC?.audioTracks.count ?? 0) }
    func getAudioTrackIndex(at: Int32) -> Int32 {
        guard let t = playerVC?.audioTracks, Int(at) < t.count else { return 0 }
        return Int32(t[Int(at)].index)
    }
    func getAudioTrackId(at: Int32) -> String {
        guard let t = playerVC?.audioTracks, Int(at) < t.count else { return "0" }
        return "\(t[Int(at)].id)"
    }
    func getAudioTrackLabel(at: Int32) -> String {
        guard let t = playerVC?.audioTracks, Int(at) < t.count else { return "" }
        return t[Int(at)].title
    }
    func getAudioTrackLang(at: Int32) -> String {
        guard let t = playerVC?.audioTracks, Int(at) < t.count else { return "" }
        return t[Int(at)].lang
    }
    func isAudioTrackSelected(at: Int32) -> Bool {
        guard let t = playerVC?.audioTracks, Int(at) < t.count else { return false }
        return t[Int(at)].selected
    }

    // Subtitle tracks
    func getSubtitleTrackCount() -> Int32 { Int32(playerVC?.subtitleTracks.count ?? 0) }
    func getSubtitleTrackIndex(at: Int32) -> Int32 {
        guard let t = playerVC?.subtitleTracks, Int(at) < t.count else { return 0 }
        return Int32(t[Int(at)].index)
    }
    func getSubtitleTrackId(at: Int32) -> String {
        guard let t = playerVC?.subtitleTracks, Int(at) < t.count else { return "0" }
        return "\(t[Int(at)].id)"
    }
    func getSubtitleTrackLabel(at: Int32) -> String {
        guard let t = playerVC?.subtitleTracks, Int(at) < t.count else { return "" }
        return t[Int(at)].title
    }
    func getSubtitleTrackLang(at: Int32) -> String {
        guard let t = playerVC?.subtitleTracks, Int(at) < t.count else { return "" }
        return t[Int(at)].lang
    }
    func isSubtitleTrackSelected(at: Int32) -> Bool {
        guard let t = playerVC?.subtitleTracks, Int(at) < t.count else { return false }
        return t[Int(at)].selected
    }

    func selectAudioTrack(trackId: Int32) { playerVC?.selectAudio(Int(trackId)) }
    func selectSubtitleTrack(trackId: Int32) { playerVC?.selectSubtitle(Int(trackId)) }
    func setSubtitleUrl(url: String) { playerVC?.addSubtitleUrl(url) }
    func clearExternalSubtitle() { playerVC?.removeExternalSubtitles() }
    func clearExternalSubtitleAndSelect(trackId: Int32) { playerVC?.removeExternalSubtitlesAndSelect(Int(trackId)) }
    func setSubtitleDelayMs(delayMs: Int32) { playerVC?.setSubtitleDelayMs(Int(delayMs)) }
    func applySubtitleStyle(
        textColor: String,
        backgroundColor: String,
        outlineColor: String,
        outlineSize: Float,
        bold: Bool,
        fontSize: Float,
        subPos: Int32
    ) {
        playerVC?.applySubtitleStyle(
            textColor: textColor,
            backgroundColor: backgroundColor,
            outlineColor: outlineColor,
            outlineSize: outlineSize,
            bold: bold,
            fontSize: fontSize,
            subPos: Int(subPos)
        )
    }

    // State - refreshes position from mpv on each call (polled from Kotlin every 250ms)
    func getIsLoading() -> Bool { playerVC?.refreshPlaybackState(); return playerVC?.isPlayerLoading ?? true }
    func getIsPlaying() -> Bool { return playerVC?.isPlayerPlaying ?? false }
    func getIsEnded() -> Bool { return playerVC?.isPlayerEnded ?? false }
    func getDurationMs() -> Int64 { return playerVC?.durationMs ?? 0 }
    func getPositionMs() -> Int64 { return playerVC?.positionMs ?? 0 }
    func getBufferedMs() -> Int64 { return playerVC?.bufferedMs ?? 0 }
    func getPlaybackSpeed() -> Float { playerVC?.currentSpeed ?? 1.0 }
    func getVideoWidth() -> Int32 { Int32(playerVC?.currentVideoWidth ?? 0) }
    func getVideoHeight() -> Int32 { Int32(playerVC?.currentVideoHeight ?? 0) }
    func getErrorMessage() -> String { playerVC?.currentErrorMessage ?? "" }
    func getMediaInfoJson() -> String { playerVC?.getMediaInfoJson() ?? "{}" }

    func destroy() {
        playerVC?.destroyPlayer()
        playerVC = nil
    }

    private func parseRequestHeaders(_ headersJson: String?) -> [String: String] {
        guard
            let headersJson,
            !headersJson.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            let data = headersJson.data(using: .utf8),
            let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return [:]
        }

        var headers: [String: String] = [:]
        headers.reserveCapacity(raw.count)
        raw.forEach { key, value in
            guard let headerValue = value as? String else { return }
            headers[key] = headerValue
        }
        return headers
    }
}

struct PluginSubtitle {
    let url: String
    let language: String
    let name: String?
    let headers: [String: String]?
}

// MARK: - Track Info

struct TrackInfo {
    let index: Int
    let id: Int
    let type: String
    let title: String
    let lang: String
    let selected: Bool
}

private struct PendingLoadRequest {
    let urlString: String
    let audioUrl: String?
    let requestHeaders: [String: String]
    let subtitles: [PluginSubtitle]
    let queuedAtUptime: TimeInterval
}

// MARK: - MPV Player View Controller

final class MPVPlayerViewController: UIViewController {

    static let defaultAudioOutput = "audiounit"

    private struct CachedNowPlayingMetadata {
        let title: String
        let subtitle: String?
        let artworkUrl: String?
    }

    private let errorStateLock = NSLock()
    let experimentalSinglePrimaryPictureInPictureEnabled: Bool
    let metalLayer = MetalLayer()
    private var lastAppliedDrawableSize: CGSize = .zero
    private var externallyManagedViewSize: CGSize?
    private var pendingSurfaceLayoutWorkItems: [DispatchWorkItem] = []
    var primaryRenderSurface: MPVPictureInPictureFrameCapture?
    private var pendingLoadRequest: PendingLoadRequest?
    private var pendingLoadRetryWorkItem: DispatchWorkItem?
    var mpv: OpaquePointer?
    private var cachedNowPlayingMetadata: CachedNowPlayingMetadata?
    private lazy var nowPlayingController = PlayerNowPlayingController(owner: self)
    private let eventQueue = DispatchQueue(label: "mpv-events", qos: .userInitiated)
    private let mpvQueue: DispatchQueue = {
        let queue = DispatchQueue(label: "mpv-properties", qos: .userInitiated)
        queue.setSpecific(key: MPVPlayerViewController.mpvQueueKey, value: ())
        return queue
    }()
    private static let mpvQueueKey = DispatchSpecificKey<Void>()

    private func onMpvQueue(_ work: @escaping () -> Void) {
        if DispatchQueue.getSpecific(key: Self.mpvQueueKey) != nil {
            work()
        } else {
            mpvQueue.async(execute: work)
        }
    }

    private let mpvLifecycleLock = NSLock()
    private var storedMpvGeneration: UInt64 = 0
    private var mpvGeneration: UInt64 {
        mpvLifecycleLock.lock()
        defer { mpvLifecycleLock.unlock() }
        return storedMpvGeneration
    }
    private func bumpMpvGeneration() {
        mpvLifecycleLock.lock()
        storedMpvGeneration &+= 1
        mpvLifecycleLock.unlock()
    }

    private func withMpvOnQueue(_ work: @escaping (OpaquePointer) -> Void) {
        guard mpv != nil else { return }
        let generation = mpvGeneration
        onMpvQueue { [weak self] in
            guard let self, self.mpvGeneration == generation, let ctx = self.mpv else { return }
            work(ctx)
        }
    }
    private let stateRefreshLock = NSLock()
    private var isPlaybackStateRefreshInFlight = false
    private var isTrackRefreshInFlight = false
    private var playbackStateGeneration: UInt64 = 0

    private let positionSampleLock = NSLock()
    private var positionSampleMs: Int64 = 0
    private var positionSampleTime: CFTimeInterval = 0
    private var positionSampleRate: Double = 0

    private static let mediaInfoRefreshInterval: CFTimeInterval = 1.0
    private let mediaInfoLock = NSLock()
    private var cachedMediaInfoJson = "{}"
    private var cachedVideoWidth = 0
    private var cachedVideoHeight = 0
    private var cachedFrameRate: Double = 30.0
    private var isMediaInfoRefreshInFlight = false
    private var lastMediaInfoRefreshTime: CFTimeInterval = 0
    private var mediaInfoGeneration: UInt64 = 0
    private var recentPlaybackLogs: [String] = []
    private var activeRequestHeaders: [String: String] = [:]

    struct VideoOutputSettings {
        let hardwareDecoder: String
        let targetColorspaceHint: Bool
        let toneMapping: String
        let hdrComputePeak: Bool
        let targetPrimaries: String
        let targetTransfer: String
        let extendedDynamicRange: Bool
        let deband: Bool
        let interpolation: Bool
        let brightness: Int
        let contrast: Int
        let saturation: Int
        let gamma: Int
    }

    struct SubtitleStyleSettings {
        let textColor: String
        let backgroundColor: String
        let outlineColor: String
        let outlineSize: Float
        let bold: Bool
        let fontSize: Float
        let subPos: Int
    }

    private var lastLoadRequest: PendingLoadRequest?
    private var lastVideoOutputSettings: VideoOutputSettings?
    private var lastSubtitleStyle: SubtitleStyleSettings?
    private var lastAudioOutput: String?
    private var lastResizeMode: Int?
    private var lastSubtitleDelayMs: Int?
    private var lastVolume: Float?
    private var lastMuted: Bool?
    private var lastSelectedAudioTrackId: Int?
    private var lastSelectedSubtitleTrackId: Int?
    private var isRecoveringFromDeviceLoss = false
    private var isDeviceLossRecoveryPending = false
    private var hasGivenUpOnDeviceLossRecovery = false
    private var isPlayerDestroyed = false
    private var deviceLossRecoveryAttempts = 0
    private var lastDeviceLossRecoveryTime: CFTimeInterval = 0
    private var deviceLossDetectedAt: CFTimeInterval = 0
    private var deviceLossResumeSeconds: Double = 0
    private var deviceLossResumePlayback = false
    private var deviceLossRecoveryProbeWorkItem: DispatchWorkItem?
    private var isDeviceLossResumePending = false
    private var deviceLossResumeGeneration: UInt64 = 0
    private var deviceLossDetectedPositionSeconds: Double = 0
    private var deviceLossResumeTimeoutWorkItem: DispatchWorkItem?
    private var gpuProbeCommandQueue: MTLCommandQueue?
    private var gpuProbeBuffer: MTLBuffer?
    private var sawDeviceLossInLog = false

    private struct ThrottledLogEntry {
        let prefix: String
        let level: String
        let text: String
        var count: Int
        var lastEmitTime: CFTimeInterval
    }

    private static let logCoalesceInterval: CFTimeInterval = 2.0
    private let logCoalesceLock = NSLock()
    private var throttledLogEntries: [String: ThrottledLogEntry] = [:]

    lazy var sampleBufferDisplayView: SampleBufferDisplayView = {
        let view = SampleBufferDisplayView(frame: CGRect(x: -4, y: -4, width: 2, height: 2))
        view.alpha = 0.01
        view.isHidden = false
        view.pictureInPictureDelegate = self
        return view
    }()
    var isPictureInPictureStarting = false
    var pipStartTimeoutWorkItem: DispatchWorkItem?
    var automaticPictureInPictureStartArmed = false
    var automaticPictureInPicturePrepared = false
    var automaticPictureInPicturePreparedAt: CFTimeInterval = 0
    var automaticPictureInPictureStartPreparationInFlight = false
    var automaticPictureInPictureStartRetryWorkItem: DispatchWorkItem?
    var automaticPictureInPictureTimeoutWorkItem: DispatchWorkItem?
    var automaticPictureInPictureBackgroundTask: UIBackgroundTaskIdentifier = .invalid
    var videoTrackSuspendedForBackground = false
    var resumePlaybackAfterPictureInPictureRestore = false
    var pipRestoreResumeWorkItem: DispatchWorkItem?
    var preservePlaybackDuringPictureInPictureStart = false
    var ignorePictureInPicturePauseCallbacksUntil: CFTimeInterval = 0
    var automaticPiPHomeSwipeCandidate = false
    lazy var automaticPiPHomeSwipeRecognizer: UIPanGestureRecognizer = {
        let recognizer = UIPanGestureRecognizer(target: self, action: #selector(handleAutomaticPiPHomeSwipe(_:)))
        recognizer.maximumNumberOfTouches = 1
        recognizer.cancelsTouchesInView = false
        recognizer.delaysTouchesBegan = false
        recognizer.delaysTouchesEnded = false
        recognizer.delegate = self
        return recognizer
    }()

    // Cached track lists
    var audioTracks: [TrackInfo] = []
    var subtitleTracks: [TrackInfo] = []

    // State (polled from Kotlin every 250ms)
    var isPlayerLoading: Bool = true
    var isPlayerPlaying: Bool = false
    var isPlayerEnded: Bool = false
    var durationMs: Int64 = 0
    var positionMs: Int64 = 0
    var bufferedMs: Int64 = 0
    var currentSpeed: Float = 1.0
    var currentErrorMessage: String {
        errorStateLock.lock()
        defer { errorStateLock.unlock() }
        return _currentErrorMessage ?? ""
    }
    private var _currentErrorMessage: String?
    private var isEmbeddedPreviewMode = false

    init(experimentalSinglePrimaryPictureInPictureEnabled: Bool) {
        self.experimentalSinglePrimaryPictureInPictureEnabled = experimentalSinglePrimaryPictureInPictureEnabled
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        self.experimentalSinglePrimaryPictureInPictureEnabled = false
        super.init(coder: coder)
    }

    override var canBecomeFirstResponder: Bool {
        !isEmbeddedPreviewMode
    }

    override var prefersHomeIndicatorAutoHidden: Bool {
        !isEmbeddedPreviewMode
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        isEmbeddedPreviewMode ? [] : [.bottom, .left, .right]
    }

    override var prefersStatusBarHidden: Bool {
        !isEmbeddedPreviewMode
    }

    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation {
        .fade
    }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        view.layer.masksToBounds = true

        metalLayer.contentsGravity = .resize
        metalLayer.contentsScale = view.window?.screen.nativeScale ?? UIScreen.main.nativeScale
        metalLayer.framebufferOnly = true
        metalLayer.backgroundColor = UIColor.black.cgColor
        metalLayer.wantsExtendedDynamicRangeContent = true
        metalLayer.anchorPoint = CGPoint(x: 0, y: 0)
        metalLayer.position = .zero
        metalLayer.onRenderingSuspensionChanged = { suspended, reason in
            if suspended {
                InAppLogBridge.shared.warn(
                    tag: "MPV/iOS",
                    message: "Drawable acquisition suspended (\(reason)); iOS is likely denying " +
                        "background GPU work. Rendering will resume when the app is visible again."
                )
            } else {
                InAppLogBridge.shared.info(
                    tag: "MPV/iOS",
                    message: "Drawable acquisition resumed (\(reason))"
                )
            }
        }
        view.layer.addSublayer(metalLayer)
        layoutPlayerSurfaces()

        setupMpv()
        installExperimentalPictureInPictureCaptureIfNeeded()
        if !isEmbeddedPreviewMode {
            activateAudioSessionForPlayback()
        }
        setupNotifications()
        if experimentalSinglePrimaryPictureInPictureEnabled {
            view.addGestureRecognizer(automaticPiPHomeSwipeRecognizer)
        }
        refreshImmersiveSystemUI()
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        refreshImmersiveSystemUI()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        layoutPlayerSurfaces()
        attemptStartPendingLoad()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !isEmbeddedPreviewMode {
            publishImmersiveSystemUIVisibility(isVisible: true)
            refreshImmersiveSystemUI()
            becomeFirstResponder()
            UIApplication.shared.beginReceivingRemoteControlEvents()
            publishCachedNowPlayingInfoIfNeeded()
        }
        syncVideoSurfaceLayout()
        attemptStartPendingLoad()
    }

    override func viewWillDisappear(_ animated: Bool) {
        if !isEmbeddedPreviewMode {
            publishImmersiveSystemUIVisibility(isVisible: false)
        }
        super.viewWillDisappear(animated)
    }

    override func didMove(toParent parent: UIViewController?) {
        super.didMove(toParent: parent)
        if parent == nil {
            publishImmersiveSystemUIVisibility(isVisible: false)
        }
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        syncVideoSurfaceLayout()
        refreshImmersiveSystemUI()
        attemptStartPendingLoad()
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)

        syncVideoSurfaceLayoutNow(scheduleDeferredPasses: false)
        coordinator.animate(alongsideTransition: { [weak self] _ in
            self?.syncVideoSurfaceLayoutNow(scheduleDeferredPasses: false)
        }, completion: { [weak self] _ in
            self?.syncVideoSurfaceLayout()
            self?.attemptStartPendingLoad()
        })
    }

    func syncVideoSurfaceLayout(size: CGSize) {
        if Thread.isMainThread {
            syncVideoSurfaceLayoutNow(size: size, scheduleDeferredPasses: true)
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.syncVideoSurfaceLayoutNow(size: size, scheduleDeferredPasses: true)
            }
        }
    }

    private func syncVideoSurfaceLayout() {
        if Thread.isMainThread {
            syncVideoSurfaceLayoutNow(size: nil, scheduleDeferredPasses: true)
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.syncVideoSurfaceLayoutNow(size: nil, scheduleDeferredPasses: true)
            }
        }
    }

    private func syncVideoSurfaceLayoutNow(size: CGSize? = nil, scheduleDeferredPasses: Bool) {
        guard isViewLoaded else { return }
        if let size, size.width > 1, size.height > 1 {
            externallyManagedViewSize = size
            applyExternallyManagedViewSize(size)
        }
        view.setNeedsLayout()
        view.layoutIfNeeded()
        layoutPlayerSurfaces()

        if scheduleDeferredPasses {
            scheduleDeferredSurfaceLayoutPasses()
        }
    }

    private func scheduleDeferredSurfaceLayoutPasses() {
        pendingSurfaceLayoutWorkItems.forEach { $0.cancel() }
        pendingSurfaceLayoutWorkItems.removeAll(keepingCapacity: true)

        [0.0, 0.05, 0.15, 0.35].forEach { delay in
            let workItem = DispatchWorkItem { [weak self] in
                self?.syncVideoSurfaceLayoutNow(scheduleDeferredPasses: false)
            }
            pendingSurfaceLayoutWorkItems.append(workItem)
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
        }
    }

    private func applyExternallyManagedViewSize(_ size: CGSize) {
        let targetBounds = CGRect(origin: .zero, size: size)
        if view.bounds != targetBounds {
            view.bounds = targetBounds
        }

        var targetFrame = view.frame
        if targetFrame.size != size {
            targetFrame.size = size
            view.frame = targetFrame
        }
    }

    private func layoutPlayerSurfaces() {
        let bounds = CGRect(origin: .zero, size: externallyManagedViewSize ?? view.bounds.size)
        guard bounds.width > 1, bounds.height > 1 else { return }

        layoutExperimentalPictureInPictureSurfaces(in: bounds)

        let scale = view.window?.screen.nativeScale ?? UIScreen.main.nativeScale
        let drawableSize = CGSize(
            width: (bounds.width * scale).rounded(.toNearestOrAwayFromZero),
            height: (bounds.height * scale).rounded(.toNearestOrAwayFromZero)
        )

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        metalLayer.contentsScale = scale
        metalLayer.position = .zero
        metalLayer.bounds = CGRect(origin: .zero, size: bounds.size)
        if drawableSize != lastAppliedDrawableSize {
            metalLayer.drawableSize = drawableSize
            lastAppliedDrawableSize = drawableSize
        }
        CATransaction.commit()
    }

    /// Subtitle font selection for non-Latin scripts. See MPVSubtitleFontResolver.
    private lazy var subtitleFonts = MPVSubtitleFontController(player: self)

    // MARK: - MPV Setup

    private func setupMpv() {
        mpv = mpv_create()
        guard mpv != nil else {
            print("[MPV] Failed to create mpv instance")
            InAppLogBridge.shared.error(tag: "MPV/iOS", message: "Failed to create mpv instance")
            return
        }

        InAppLogBridge.shared.info(tag: "MPV/iOS", message: "Initializing mpv vo=gpu-next gpu-api=vulkan gpu-context=moltenvk hwdec=videotoolbox")
        checkError(mpv_request_log_messages(mpv, "warn"))

        var layerPointer = Int64(Int(bitPattern: Unmanaged.passUnretained(metalLayer).toOpaque()))
        checkError(mpv_set_option(mpv, "wid", MPV_FORMAT_INT64, &layerPointer))
        setSetupOption("vo", "gpu-next")
        setSetupOption("gpu-api", "vulkan")
        setSetupOption("gpu-context", "moltenvk")
        setSetupOption("hwdec", "videotoolbox")
        setSetupOption("ao", Self.defaultAudioOutput)
        setSetupOption("audio-channels", "auto")
        setSetupOption("audio-fallback-to-null", "yes")
        setSetupOption("volume-max", "200")
        setSetupOption("volume", "100")
        setSetupOption("volume-gain-max", "12")
        setSetupOption("volume-gain", "0")
        setSetupOption("vulkan-swap-mode", "fifo")
        setSetupOption("vulkan-queue-count", "1")
        setSetupOption("vulkan-async-compute", "no")
        setSetupOption("vulkan-async-transfer", "no")
        setSetupOption("video-rotate", "no")
        setSetupOption("subs-match-os-language", "yes")
        setSetupOption("subs-fallback", "yes")
        subtitleFonts.applySetupOptions(setSetupOption)
        setSetupOption("keep-open", "yes")
        setSetupOption("target-colorspace-hint", "yes")
        setSetupOption("tone-mapping", "auto")
        setSetupOption("hdr-compute-peak", "yes")
        setSetupOption("demuxer-lavf-o", "protocol_whitelist=[file,crypto,data,http,https,tcp,tls]")

        checkError(mpv_initialize(mpv))

        // Observe properties
        mpv_observe_property(mpv, 0, "pause", MPV_FORMAT_FLAG)
        mpv_observe_property(mpv, 0, "paused-for-cache", MPV_FORMAT_FLAG)
        mpv_observe_property(mpv, 0, "core-idle", MPV_FORMAT_FLAG)
        mpv_observe_property(mpv, 0, "eof-reached", MPV_FORMAT_FLAG)
        mpv_observe_property(mpv, 0, "seeking", MPV_FORMAT_FLAG)
        mpv_observe_property(mpv, 0, "track-list/count", MPV_FORMAT_INT64)
        mpv_observe_property(mpv, 0, "current-tracks/sub/lang", MPV_FORMAT_STRING)
        mpv_observe_property(mpv, 0, "sub-text", MPV_FORMAT_STRING)

        mpv_set_wakeup_callback(mpv, { ctx in
            let vc = unsafeBitCast(ctx, to: MPVPlayerViewController.self)
            vc.readEvents()
        }, UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()))
    }

    private func setSetupOption(_ name: String, _ value: String) {
        guard let ctx = mpv else { return }
        let status = mpv_set_option_string(ctx, name, value)
        if status < 0 {
            let reason = String(cString: mpv_error_string(status))
            InAppLogBridge.shared.warn(
                tag: "MPV/iOS",
                message: "Ignoring mpv option \(name)=\(value): \(reason)"
            )
        }
    }

    // MARK: - Playback API

    func loadFile(_ urlString: String, audioUrl: String? = nil, requestHeaders: [String: String] = [:], subtitles: [PluginSubtitle] = []) {
        let request = PendingLoadRequest(
            urlString: urlString,
            audioUrl: audioUrl,
            requestHeaders: requestHeaders,
            subtitles: subtitles,
            queuedAtUptime: ProcessInfo.processInfo.systemUptime
        )

        if Thread.isMainThread {
            queueLoad(request)
        } else {
            DispatchQueue.main.async { [weak self] in
                self?.queueLoad(request)
            }
        }
    }

    private func queueLoad(_ request: PendingLoadRequest) {
        pendingLoadRequest = request
        attemptStartPendingLoad()
    }

    private func attemptStartPendingLoad() {
        guard let request = pendingLoadRequest else { return }
        guard mpv != nil else { return }
        layoutPlayerSurfaces()
        guard isViewportReadyForPlayback(queuedAtUptime: request.queuedAtUptime) else {
            schedulePendingLoadRetry()
            return
        }

        pendingLoadRequest = nil
        pendingLoadRetryWorkItem?.cancel()
        pendingLoadRetryWorkItem = nil
        lastLoadRequest = request
        cancelPendingDeviceLossResume()
        hasGivenUpOnDeviceLossRecovery = false
        deviceLossRecoveryAttempts = 0
        startLoad(request)
    }

    private func startLoad(_ request: PendingLoadRequest) {
        guard mpv != nil else { return }
        automaticPictureInPictureStartRetryWorkItem?.cancel()
        automaticPictureInPictureStartRetryWorkItem = nil
        automaticPictureInPicturePrepared = false
        automaticPictureInPicturePreparedAt = 0
        automaticPictureInPictureStartPreparationInFlight = false
        if !isPictureInPictureActive(), !isPictureInPictureStarting {
            primaryRenderSurface?.stopPictureInPictureRendering(removingDisplayedImage: true)
            sampleBufferDisplayView.flush()
        }
        layoutPlayerSurfaces()
        clearPlaybackError()
        let sanitizedHeaders = sanitizeRequestHeaders(request.requestHeaders)
        InAppLogBridge.shared.info(
            tag: "MPV/iOS",
            message: "loadfile url=\(redactedPlaybackUrlForLogs(request.urlString)) audio=\(!(request.audioUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) subtitles=\(request.subtitles.count) headers=\(sanitizedHeaders.keys.sorted().joined(separator: ","))"
        )
        activeRequestHeaders = sanitizedHeaders
        applyRequestHeaders(sanitizedHeaders)
        isPlayerLoading = true
        isPlayerEnded = false
        playbackStateGeneration &+= 1
        invalidateMediaInfoCache()
        command("loadfile", args: [request.urlString, "replace"])
        if let audioUrl = request.audioUrl, !audioUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.command("audio-add", args: [audioUrl, "select"], checkForErrors: false)
            }
        }

        for subtitle in request.subtitles {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                self?.addSubtitle(subtitle, mode: "auto")
            }
        }
    }

    private func isViewportReadyForPlayback(queuedAtUptime: TimeInterval) -> Bool {
        guard isViewLoaded, view.window != nil else { return false }
        let bounds = view.bounds
        guard bounds.width > 1, bounds.height > 1 else { return false }
        if bounds.width >= bounds.height { return true }

        let age = ProcessInfo.processInfo.systemUptime - queuedAtUptime
        return age >= 0.9
    }

    private func schedulePendingLoadRetry() {
        guard pendingLoadRetryWorkItem == nil else { return }

        let workItem = DispatchWorkItem { [weak self] in
            self?.pendingLoadRetryWorkItem = nil
            self?.attemptStartPendingLoad()
        }
        pendingLoadRetryWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: workItem)
    }

    func playPlayback() {
        guard mpv != nil else { return }
        if !isEmbeddedPreviewMode {
            publishNowPlayingForPlaybackSession()
        }
        setFlag("pause", false)
        isPlayerPlaying = true
        playbackStateGeneration &+= 1
        if !isEmbeddedPreviewMode {
            syncNowPlayingPlaybackState(isPlaying: true)
        }
        if experimentalSinglePrimaryPictureInPictureEnabled, !isPictureInPictureActive(), !isPictureInPictureStarting {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.prewarmAutomaticPictureInPictureSource(reason: "play")
            }
        }
    }

    func pausePlayback() {
        guard mpv != nil else { return }
        setFlag("pause", true)
        isPlayerPlaying = false
        playbackStateGeneration &+= 1
        if !isEmbeddedPreviewMode {
            syncNowPlayingPlaybackState(isPlaying: false)
        }
        primaryRenderSurface?.setPaused(true)
    }

    func seekToMs(_ ms: Int64) {
        guard mpv != nil else { return }
        let seconds = Double(ms) / 1000.0
        if isRecoveringFromDeviceLoss { deviceLossResumeSeconds = max(0, seconds) }
        command("seek", args: [String(format: "%.3f", seconds), "absolute"])
        primaryRenderSurface?.didSeek()
        automaticPictureInPicturePrepared = false
        automaticPictureInPicturePreparedAt = 0
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.prewarmAutomaticPictureInPictureSource(reason: "seek")
        }
    }

    func seekByMs(_ ms: Int64) {
        guard mpv != nil else { return }
        let seconds = Double(ms) / 1000.0
        if isRecoveringFromDeviceLoss {
            deviceLossResumeSeconds = max(0, deviceLossResumeSeconds + seconds)
        }
        command("seek", args: [String(format: "%.3f", seconds), "relative"])
        primaryRenderSurface?.didSeek()
        automaticPictureInPicturePrepared = false
        automaticPictureInPicturePreparedAt = 0
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
            self?.prewarmAutomaticPictureInPictureSource(reason: "seek")
        }
    }

    // MARK: - GPU device-loss recovery

    private static let deviceLossRecoveryCooldown: CFTimeInterval = 10.0
    private static let maxDeviceLossRecoveryAttempts = 3
    private static let deviceLossProbeInterval: CFTimeInterval = 0.75
    private static let deviceLossRecoveryDeadline: CFTimeInterval = 60.0
    private static let deviceLossResumeTimeout: CFTimeInterval = 15.0

    func handleVideoOutputDeviceLost() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard self.mpv != nil,
                  !self.hasGivenUpOnDeviceLossRecovery,
                  !self.isRecoveringFromDeviceLoss,
                  !self.isDeviceLossRecoveryPending
            else {
                self.clearDeviceLossLogLatch()
                return
            }

            self.isDeviceLossRecoveryPending = true
            self.deviceLossDetectedAt = CACurrentMediaTime()
            self.deviceLossDetectedPositionSeconds = max(0, Double(self.positionMs) / 1000.0)
            InAppLogBridge.shared.warn(
                tag: "MPV/iOS",
                message: "GPU device lost; waiting for GPU access to rebuild mpv core " +
                    "positionMs=\(self.positionMs)"
            )
            self.metalLayer.setRenderingSuspended(true, reason: "device-lost")
            self.scheduleDeviceLossRecoveryProbe(delay: 0)
        }
    }

    var isAwaitingDeviceLossRecovery: Bool {
        isDeviceLossRecoveryPending || isRecoveringFromDeviceLoss
    }

    private func clearDeviceLossLogLatch() {
        eventQueue.async { [weak self] in self?.sawDeviceLossInLog = false }
    }

    func retryDeviceLossRecoveryNow() {
        guard isDeviceLossRecoveryPending else { return }
        scheduleDeviceLossRecoveryProbe(delay: 0)
    }

    private func scheduleDeviceLossRecoveryProbe(delay: CFTimeInterval) {
        deviceLossRecoveryProbeWorkItem?.cancel()
        let workItem = DispatchWorkItem { [weak self] in
            self?.deviceLossRecoveryProbeWorkItem = nil
            self?.attemptDeviceLossRecovery()
        }
        deviceLossRecoveryProbeWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0, delay), execute: workItem)
    }

    private func attemptDeviceLossRecovery() {
        guard isDeviceLossRecoveryPending, !isRecoveringFromDeviceLoss, mpv != nil else { return }

        if CACurrentMediaTime() - deviceLossDetectedAt > Self.deviceLossRecoveryDeadline {
            giveUpOnDeviceLossRecovery(reason: "GPU never became available again")
            return
        }

        scheduleDeviceLossRecoveryProbe(delay: Self.deviceLossProbeInterval)

        probeGpuAvailability { [weak self] permitted in
            guard let self, permitted else { return }
            guard self.isDeviceLossRecoveryPending, !self.isRecoveringFromDeviceLoss else { return }
            self.deviceLossRecoveryProbeWorkItem?.cancel()
            self.deviceLossRecoveryProbeWorkItem = nil
            self.beginDeviceLossRebuild()
        }
    }

    private func beginDeviceLossRebuild() {
        let now = CACurrentMediaTime()
        if now - lastDeviceLossRecoveryTime > Self.deviceLossRecoveryCooldown {
            deviceLossRecoveryAttempts = 0
        }
        guard deviceLossRecoveryAttempts < Self.maxDeviceLossRecoveryAttempts else {
            giveUpOnDeviceLossRecovery(
                reason: "rebuilt \(deviceLossRecoveryAttempts) times without recovering"
            )
            return
        }

        deviceLossRecoveryAttempts += 1
        lastDeviceLossRecoveryTime = now
        isDeviceLossRecoveryPending = false
        isRecoveringFromDeviceLoss = true
        let polledPosition = max(0, Double(positionMs) / 1000.0)
        deviceLossResumeSeconds = polledPosition > 0 ? polledPosition : deviceLossDetectedPositionSeconds
        deviceLossResumePlayback = isPlayerPlaying

        InAppLogBridge.shared.warn(
            tag: "MPV/iOS",
            message: "GPU available again; rebuilding mpv core " +
                "attempt=\(deviceLossRecoveryAttempts) resumeAt=\(deviceLossResumeSeconds)s"
        )
        rebuildMpvCoreAfterDeviceLoss()
    }

    private func giveUpOnDeviceLossRecovery(reason: String) {
        deviceLossRecoveryProbeWorkItem?.cancel()
        deviceLossRecoveryProbeWorkItem = nil
        deviceLossResumeTimeoutWorkItem?.cancel()
        deviceLossResumeTimeoutWorkItem = nil
        isDeviceLossResumePending = false
        isDeviceLossRecoveryPending = false
        isRecoveringFromDeviceLoss = false
        hasGivenUpOnDeviceLossRecovery = true
        metalLayer.setRenderingSuspended(false, reason: "device-loss-gave-up")
        InAppLogBridge.shared.error(
            tag: "MPV/iOS",
            message: "GPU device-loss recovery abandoned — \(reason)"
        )
        setPlaybackError("Video output was lost and could not be restarted.")
    }

    private func probeGpuAvailability(completion: @escaping (Bool) -> Void) {
        guard
            let queue = makeGpuProbeQueueIfNeeded(),
            let buffer = gpuProbeBuffer,
            let commandBuffer = queue.makeCommandBuffer(),
            let blit = commandBuffer.makeBlitCommandEncoder()
        else {
            completion(false)
            return
        }

        blit.fill(buffer: buffer, range: 0..<4, value: 0)
        blit.endEncoding()
        commandBuffer.addCompletedHandler { finished in
            let permitted = finished.status == .completed && finished.error == nil
            DispatchQueue.main.async { completion(permitted) }
        }
        commandBuffer.commit()
    }

    private func makeGpuProbeQueueIfNeeded() -> MTLCommandQueue? {
        if let existing = gpuProbeCommandQueue { return existing }
        guard let device = metalLayer.device ?? MTLCreateSystemDefaultDevice() else { return nil }
        guard let queue = device.makeCommandQueue() else { return nil }
        guard let buffer = device.makeBuffer(length: 4, options: .storageModePrivate) else { return nil }
        gpuProbeCommandQueue = queue
        gpuProbeBuffer = buffer
        return queue
    }

    private func releaseGpuProbeResources() {
        gpuProbeCommandQueue = nil
        gpuProbeBuffer = nil
    }

    private func rebuildMpvCoreAfterDeviceLoss() {
        teardownMpvCore { [weak self] in
            guard let self, !self.isPlayerDestroyed else { return }

            self.metalLayer.setRenderingSuspended(false, reason: "device-loss-recovery")
            self.metalLayer.releasePendingDrawable()

            self.setupMpv()
            guard self.mpv != nil else {
                self.giveUpOnDeviceLossRecovery(reason: "could not create a new mpv core")
                return
            }

            self.reapplyRememberedSettings()

            guard let request = self.lastLoadRequest else {
                self.isRecoveringFromDeviceLoss = false
                return
            }

            self.startLoad(request)
            self.scheduleDeviceLossResume()
        }
    }

    private func scheduleDeviceLossResume() {
        isDeviceLossResumePending = true
        deviceLossResumeGeneration = mpvGeneration
        deviceLossResumeTimeoutWorkItem?.cancel()
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.isDeviceLossResumePending else { return }
            InAppLogBridge.shared.warn(
                tag: "MPV/iOS",
                message: "File did not load within \(Int(Self.deviceLossResumeTimeout))s after rebuild; " +
                    "resuming anyway"
            )
            self.performDeviceLossResume()
        }
        deviceLossResumeTimeoutWorkItem = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.deviceLossResumeTimeout, execute: timeout)
    }

    private func cancelPendingDeviceLossResume() {
        isDeviceLossResumePending = false
        deviceLossResumeTimeoutWorkItem?.cancel()
        deviceLossResumeTimeoutWorkItem = nil
        deviceLossRecoveryProbeWorkItem?.cancel()
        deviceLossRecoveryProbeWorkItem = nil
        isDeviceLossRecoveryPending = false
        isRecoveringFromDeviceLoss = false
    }

    private func performDeviceLossResume() {
        guard isDeviceLossResumePending else { return }
        guard mpvGeneration == deviceLossResumeGeneration else {
            cancelPendingDeviceLossResume()
            return
        }
        isDeviceLossResumePending = false
        deviceLossResumeTimeoutWorkItem?.cancel()
        deviceLossResumeTimeoutWorkItem = nil
        defer { isRecoveringFromDeviceLoss = false }
        guard mpv != nil else { return }

        command("seek", args: [String(format: "%.3f", deviceLossResumeSeconds), "absolute"])
        if deviceLossResumePlayback {
            playPlayback()
        } else {
            pausePlayback()
        }
        primaryRenderSurface?.requestRenderBurst(reason: "device-loss-recovery", count: 5)
        clearDeviceLossLogLatch()
        InAppLogBridge.shared.info(
            tag: "MPV/iOS",
            message: "mpv core rebuilt after device loss; resumed at \(deviceLossResumeSeconds)s"
        )
    }

    private func teardownMpvCore(completion: (() -> Void)? = nil) {
        guard let ctx = mpv else {
            completion?()
            return
        }
        mpv = nil
        bumpMpvGeneration()
        mpv_set_wakeup_callback(ctx, nil, nil)
        pendingLoadRetryWorkItem?.cancel()
        pendingLoadRetryWorkItem = nil
        pendingLoadRequest = nil
        videoTrackSuspendedForBackground = false

        mpvQueue.async { [weak self, eventQueue, metalLayer] in
            eventQueue.sync {}
            mpv_terminate_destroy(ctx)
            withExtendedLifetime(metalLayer) {}
            eventQueue.async { self?.sawDeviceLossInLog = false }
            if let completion {
                DispatchQueue.main.async(execute: completion)
            }
        }
    }

    private func reapplyRememberedSettings() {
        if let settings = lastVideoOutputSettings {
            configureVideoOutput(
                hardwareDecoder: settings.hardwareDecoder,
                targetColorspaceHint: settings.targetColorspaceHint,
                toneMapping: settings.toneMapping,
                hdrComputePeak: settings.hdrComputePeak,
                targetPrimaries: settings.targetPrimaries,
                targetTransfer: settings.targetTransfer,
                extendedDynamicRange: settings.extendedDynamicRange,
                deband: settings.deband,
                interpolation: settings.interpolation,
                brightness: settings.brightness,
                contrast: settings.contrast,
                saturation: settings.saturation,
                gamma: settings.gamma
            )
        }
        if let audioOutput = lastAudioOutput { setStringProperty("ao", audioOutput) }
        if let mode = lastResizeMode { setResize(mode) }
        if let delay = lastSubtitleDelayMs { setSubtitleDelayMs(delay) }
        if let style = lastSubtitleStyle {
            applySubtitleStyle(
                textColor: style.textColor,
                backgroundColor: style.backgroundColor,
                outlineColor: style.outlineColor,
                outlineSize: style.outlineSize,
                bold: style.bold,
                fontSize: style.fontSize,
                subPos: style.subPos
            )
        }
        setSpeed(currentSpeed)
        if let volume = lastVolume { setVolume(volume) }
        if let muted = lastMuted { setMuted(muted) }
        if let audioTrack = lastSelectedAudioTrackId { selectAudio(audioTrack) }
        if let subtitleTrack = lastSelectedSubtitleTrackId { selectSubtitle(subtitleTrack) }
    }

    func retryPlayback() {
        guard mpv != nil else { return }
        clearPlaybackError()
        applyRequestHeaders(activeRequestHeaders)
        playbackStateGeneration &+= 1
        invalidateMediaInfoCache()
        let coreGeneration = mpvGeneration
        mpvQueue.async { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration else { return }
            guard self.mpv != nil, let path = self.getString("path") else { return }
            let pos = self.getDouble("time-pos")
            self.command("loadfile", args: [path, "replace"])
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                self?.command("seek", args: [String(format: "%.3f", pos), "absolute"])
            }
        }
    }

    func configureVideoOutput(
        hardwareDecoder: String,
        targetColorspaceHint: Bool,
        toneMapping: String,
        hdrComputePeak: Bool,
        targetPrimaries: String,
        targetTransfer: String,
        extendedDynamicRange: Bool,
        deband: Bool,
        interpolation: Bool,
        brightness: Int,
        contrast: Int,
        saturation: Int,
        gamma: Int
    ) {
        lastVideoOutputSettings = VideoOutputSettings(
            hardwareDecoder: hardwareDecoder,
            targetColorspaceHint: targetColorspaceHint,
            toneMapping: toneMapping,
            hdrComputePeak: hdrComputePeak,
            targetPrimaries: targetPrimaries,
            targetTransfer: targetTransfer,
            extendedDynamicRange: extendedDynamicRange,
            deband: deband,
            interpolation: interpolation,
            brightness: brightness,
            contrast: contrast,
            saturation: saturation,
            gamma: gamma
        )
        metalLayer.wantsExtendedDynamicRangeContent = extendedDynamicRange
        primaryRenderSurface?.setExtendedDynamicRangePreferred(extendedDynamicRange)
        guard mpv != nil else { return }

        setStringProperty("hwdec", hardwareDecoder)
        setStringProperty("target-colorspace-hint", targetColorspaceHint ? "yes" : "no")
        setStringProperty("tone-mapping", toneMapping)
        setStringProperty("hdr-compute-peak", hdrComputePeak ? "yes" : "no")
        setStringProperty("target-prim", targetPrimaries)
        setStringProperty("target-trc", targetTransfer)
        setStringProperty("deband", deband ? "yes" : "no")
        setStringProperty("interpolation", interpolation ? "yes" : "no")
        setVideoEqualizer("brightness", brightness)
        setVideoEqualizer("contrast", contrast)
        setVideoEqualizer("saturation", saturation)
        setVideoEqualizer("gamma", gamma)
    }

    func configureAudioOutput(audioOutput: String) {
        guard mpv != nil else { return }
        let resolvedAudioOutput: String
        if audioOutput.contains("avfoundation") {
            resolvedAudioOutput = Self.defaultAudioOutput
        } else {
            resolvedAudioOutput = audioOutput
        }
        lastAudioOutput = resolvedAudioOutput
        setStringProperty("ao", resolvedAudioOutput)
    }

    func setSpeed(_ speed: Float) {
        guard mpv != nil else { return }
        setDoubleProperty("speed", Double(speed))
        primaryRenderSurface?.requestRenderBurst(reason: "speed", count: 2)
    }

    func getVolume() -> Float {
        guard mpv != nil else { return 1.0 }
        let baseVolume = getDouble("volume") / 100.0
        let gainDb = getDouble("volume-gain")
        let gainMultiplier = pow(10.0, gainDb / 20.0)
        return Float(max(0.0, min(2.0, baseVolume * gainMultiplier)))
    }

    func setVolume(_ volume: Float) {
        lastVolume = volume
        guard mpv != nil else { return }
        let clamped = max(0.0, min(2.0, Double(volume)))

        if clamped <= 0.001 {
            setDoubleProperty("volume", 0.0)
            setDoubleProperty("volume-gain", 0.0)
            return
        }

        // Keep mpv's base volume at 100 and apply real software amplification through volume-gain.
        // 2.0x equals about +6.02 dB.
        setDoubleProperty("volume", 100.0)
        setDoubleProperty("volume-gain", 20.0 * log10(clamped))
    }


    func setEmbeddedPreviewMode(_ enabled: Bool) {
        guard isEmbeddedPreviewMode != enabled else { return }
        isEmbeddedPreviewMode = enabled
        if isViewLoaded {
            setNeedsStatusBarAppearanceUpdate()
            setNeedsUpdateOfHomeIndicatorAutoHidden()
            setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        }
    }

    func setMuted(_ muted: Bool) {
        lastMuted = muted
        guard mpv != nil else { return }
        setFlag("mute", muted)
    }

    func setResize(_ mode: Int) {
        lastResizeMode = mode
        guard mpv != nil else { return }
        switch mode {
        case 1: // Fill
            setStringProperty("panscan", "1.0")
            setStringProperty("video-unscaled", "no")
        case 2: // Zoom
            setStringProperty("panscan", "1.0")
            setStringProperty("video-unscaled", "no")
        default: // Fit
            setStringProperty("panscan", "0.0")
            setStringProperty("video-unscaled", "no")
        }
    }

    // MARK: - Track selection

    func selectAudio(_ trackId: Int) {
        lastSelectedAudioTrackId = trackId
        guard mpv != nil else { return }
        setIntProperty("aid", Int64(trackId))
    }

    func selectSubtitle(_ trackId: Int) {
        lastSelectedSubtitleTrackId = trackId
        guard mpv != nil else { return }
        if trackId < 0 {
            setStringProperty("sid", "no")
        } else {
            setIntProperty("sid", Int64(trackId))
        }
    }

    func addSubtitleUrl(_ url: String) {
        guard mpv != nil else { return }
        command("sub-add", args: [url, "select"])
    }

    private func addSubtitle(_ subtitle: PluginSubtitle, mode: String) {
        guard mpv != nil else { return }
        let subtitleHeaders = sanitizeRequestHeaders(subtitle.headers ?? [:])
        let previousHeaders = activeRequestHeaders

        let coreGeneration = mpvGeneration
        onMpvQueue { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration, self.mpv != nil else { return }
            if !subtitleHeaders.isEmpty {
                self.applyRequestHeaders(
                    previousHeaders.merging(subtitleHeaders) { _, subtitleValue in subtitleValue }
                )
            }

            self.command(
                "sub-add",
                args: [subtitle.url, mode, subtitle.name ?? subtitle.language, subtitle.language],
                checkForErrors: false
            )

            if !subtitleHeaders.isEmpty {
                self.applyRequestHeaders(previousHeaders)
            }
        }
    }

    func removeExternalSubtitles() {
        guard mpv != nil else { return }
        let coreGeneration = mpvGeneration
        onMpvQueue { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration, self.mpv != nil else { return }
            self.removeExternalSubtitleTracksOnMpvQueue()
            self.setStringProperty("sid", "no")
        }
    }

    func removeExternalSubtitlesAndSelect(_ trackId: Int) {
        guard mpv != nil else { return }
        let coreGeneration = mpvGeneration
        onMpvQueue { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration, self.mpv != nil else { return }
            self.removeExternalSubtitleTracksOnMpvQueue()
            if trackId >= 0 {
                self.selectSubtitle(trackId)
            } else {
                self.setStringProperty("sid", "no")
            }
        }
    }

    private func removeExternalSubtitleTracksOnMpvQueue() {
        let count = getInt("track-list/count")
        for i in stride(from: count - 1, through: 0, by: -1) {
            let type = getString("track-list/\(i)/type") ?? ""
            let external = getFlag("track-list/\(i)/external")
            if type == "sub" && external {
                let id = getInt("track-list/\(i)/id")
                command("sub-remove", args: ["\(id)"], checkForErrors: false)
            }
        }
    }

    func setSubtitleDelayMs(_ delayMs: Int) {
        lastSubtitleDelayMs = delayMs
        guard mpv != nil else { return }
        setDoubleProperty("sub-delay", Double(max(-60_000, min(60_000, delayMs))) / 1000.0)
    }

    func applySubtitleStyle(
        textColor: String,
        backgroundColor: String,
        outlineColor: String,
        outlineSize: Float,
        bold: Bool,
        fontSize: Float,
        subPos: Int
    ) {
        lastSubtitleStyle = SubtitleStyleSettings(
            textColor: textColor,
            backgroundColor: backgroundColor,
            outlineColor: outlineColor,
            outlineSize: outlineSize,
            bold: bold,
            fontSize: fontSize,
            subPos: subPos
        )
        guard mpv != nil else { return }

        let hasBackground = !backgroundColor.hasPrefix("#00")

        let effectiveOutlineColor = hasBackground ? backgroundColor : outlineColor
        let effectiveOutlineSize = hasBackground
            ? max(Double(outlineSize), 1.0)
            : Double(outlineSize)

        subtitleFonts.reapplyFont()
        setStringProperty("sub-ass-override", "no")
        setStringProperty("sub-color", textColor)
        setStringProperty("sub-back-color", backgroundColor)
        setStringProperty("sub-outline-color", effectiveOutlineColor)
        setStringProperty("sub-border-style", hasBackground ? "opaque-box" : "outline-and-shadow")
        setStringProperty("sub-shadow-offset", "0")
        setStringProperty("sub-bold", bold ? "yes" : "no")
        setDoubleProperty("sub-outline-size", effectiveOutlineSize)
        setDoubleProperty("sub-font-size", Double(fontSize))
        setIntProperty("sub-pos", Int64(subPos))
    }

    func destroyPlayer() {
        automaticPictureInPictureStartRetryWorkItem?.cancel()
        automaticPictureInPictureStartRetryWorkItem = nil
        cancelAutomaticPictureInPictureStart(stopPriming: false)
        endAutomaticPictureInPictureBackgroundTask()
        stopPictureInPicture(source: "destroy")
        primaryRenderSurface?.detach()
        NotificationCenter.default.removeObserver(self)
        if !isEmbeddedPreviewMode {
            UIApplication.shared.endReceivingRemoteControlEvents()
            resignFirstResponder()
        }
        pendingLoadRetryWorkItem?.cancel()
        pendingLoadRetryWorkItem = nil
        deviceLossRecoveryProbeWorkItem?.cancel()
        deviceLossRecoveryProbeWorkItem = nil
        deviceLossResumeTimeoutWorkItem?.cancel()
        deviceLossResumeTimeoutWorkItem = nil
        isDeviceLossResumePending = false
        isDeviceLossRecoveryPending = false
        pendingSurfaceLayoutWorkItems.forEach { $0.cancel() }
        pendingSurfaceLayoutWorkItems.removeAll(keepingCapacity: false)
        pendingLoadRequest = nil
        if !isEmbeddedPreviewMode {
            nowPlayingController.invalidate()
        }
        clearPlaybackError()
        if !isEmbeddedPreviewMode {
            deactivateAudioSession()
        }
        isPlayerDestroyed = true
        isRecoveringFromDeviceLoss = false
        releaseGpuProbeResources()
        flushPendingCoalescedLog()
        teardownMpvCore()
    }

    private func activateAudioSessionForPlayback() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
        } catch {
            print("[NowPlaying] Failed to activate audio session: \(error)")
        }
    }

    private func deactivateAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("[NowPlaying] Failed to deactivate audio session: \(error)")
        }
    }

    // MARK: - Media Info

    func getMediaInfoJson() -> String {
        guard mpv != nil else { return "{}" }
        scheduleMediaInfoRefreshIfNeeded()
        mediaInfoLock.lock()
        defer { mediaInfoLock.unlock() }
        return cachedMediaInfoJson
    }

    private func invalidateMediaInfoCache() {
        mediaInfoLock.lock()
        cachedMediaInfoJson = "{}"
        cachedVideoWidth = 0
        cachedVideoHeight = 0
        cachedFrameRate = 30.0
        lastMediaInfoRefreshTime = 0
        mediaInfoGeneration &+= 1
        mediaInfoLock.unlock()
    }

    private func scheduleMediaInfoRefreshIfNeeded() {
        let now = CACurrentMediaTime()
        mediaInfoLock.lock()
        let shouldRefresh = !isMediaInfoRefreshInFlight &&
            (now - lastMediaInfoRefreshTime) >= Self.mediaInfoRefreshInterval
        if shouldRefresh {
            isMediaInfoRefreshInFlight = true
            lastMediaInfoRefreshTime = now
        }
        let generation = mediaInfoGeneration
        mediaInfoLock.unlock()
        guard shouldRefresh else { return }

        let coreGeneration = mpvGeneration
        mpvQueue.async { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration else { return }
            let json = self.computeMediaInfoJson()
            let width = self.readCurrentVideoWidth()
            let height = self.readCurrentVideoHeight()
            let frameRate = self.readCurrentFrameRate()
            self.mediaInfoLock.lock()
            self.isMediaInfoRefreshInFlight = false
            if generation == self.mediaInfoGeneration {
                self.cachedMediaInfoJson = json
                self.cachedVideoWidth = width
                self.cachedVideoHeight = height
                self.cachedFrameRate = frameRate
            }
            self.mediaInfoLock.unlock()
        }
    }

    private func computeMediaInfoJson() -> String {
        guard mpv != nil else { return "{}" }
        let count = getInt("track-list/count")

        var videoCodec = getString("video-codec") ?? ""
        var videoDecoder = ""
        var dvProfile = ""
        var codecProfile = ""
        let filename = getString("filename") ?? ""
        let gamma = getString("video-params/gamma") ?? ""
        let primaries = getString("video-params/primaries") ?? ""
        let colorLevels = getString("video-params/colorlevels") ?? ""
        let pixelFormat = getString("video-out-params/pixelformat") ?? ""
        let videoWidth = getInt("video-params/w")
        let videoHeight = getInt("video-params/h")
        let fps = getDouble("container-fps")
        let hwdecCurrent = getString("hwdec-current") ?? ""
        var hdrFormat = ""

        for index in 0..<count {
            let type = getString("track-list/\(index)/type") ?? ""
            if type == "video" {
                videoCodec = getString("track-list/\(index)/codec") ?? videoCodec
                videoDecoder = getString("track-list/\(index)/decoder-desc") ?? ""
                dvProfile = getString("track-list/\(index)/dolby-vision-profile") ?? ""
                if dvProfile.isEmpty {
                    dvProfile = getString("track-list/\(index)/dv_profile") ?? ""
                }
                codecProfile = getString("track-list/\(index)/codec-profile") ?? ""
                let dvLower = dvProfile.lowercased()
                let isDolbyVision = !dvProfile.isEmpty &&
                    dvLower != "none" &&
                    dvLower != "unknown" &&
                    dvLower != "0" &&
                    dvLower != "false"
                if isDolbyVision ||
                    videoCodec.localizedCaseInsensitiveContains("dvhe") ||
                    videoCodec.localizedCaseInsensitiveContains("dvh1") ||
                    videoDecoder.localizedCaseInsensitiveContains("dovi") ||
                    codecProfile.localizedCaseInsensitiveContains("dovi") {
                    hdrFormat = "dolby_vision"
                }
                break
            }
        }

        if hdrFormat.isEmpty {
            if gamma.caseInsensitiveCompare("hlg") == .orderedSame {
                hdrFormat = "hlg"
            } else if gamma.caseInsensitiveCompare("pq") == .orderedSame {
                hdrFormat = "hdr"
            } else if primaries.caseInsensitiveCompare("bt.2020") == .orderedSame ||
                        primaries.caseInsensitiveCompare("bt.2020nc") == .orderedSame {
                hdrFormat = "hdr"
            } else if gamma.caseInsensitiveCompare("sdr") == .orderedSame {
                hdrFormat = "sdr"
            }
        }

        var audioCodec = getString("audio-codec") ?? ""
        var audioDecoder = ""
        var audioChannels = ""
        var audioSampleRate = ""
        var audioLang = ""
        for index in 0..<count {
            let type = getString("track-list/\(index)/type") ?? ""
            let selected = getFlag("track-list/\(index)/selected")
            if type == "audio" && selected {
                audioCodec = getString("track-list/\(index)/codec") ?? audioCodec
                audioDecoder = getString("track-list/\(index)/decoder-desc") ?? ""
                let channelCount = getInt("track-list/\(index)/demux-channel-count")
                audioChannels = channelCount > 0 ? "\(channelCount)" : ""
                let sampleRate = getInt("track-list/\(index)/demux-samplerate")
                audioSampleRate = sampleRate > 0 ? "\(sampleRate)" : ""
                audioLang = getString("track-list/\(index)/lang") ?? ""
                break
            }
        }

        let videoBitrate = getDouble("video-bitrate")
        let audioBitrate = getDouble("audio-bitrate")
        let videoBitrateKbps = videoBitrate.isFinite && videoBitrate > 0 ? Int(videoBitrate / 1000.0) : 0
        let audioBitrateKbps = audioBitrate.isFinite && audioBitrate > 0 ? Int(audioBitrate / 1000.0) : 0

        let payload: [String: Any] = [
            "engine": "libmpv",
            "filename": filename,
            "videoCodec": videoCodec,
            "videoDecoder": videoDecoder,
            "dvProfile": dvProfile,
            "codecProfile": codecProfile,
            "hdrFormat": hdrFormat,
            "gamma": gamma,
            "primaries": primaries,
            "colorLevels": colorLevels,
            "pixelFormat": pixelFormat,
            "videoWidth": videoWidth,
            "videoHeight": videoHeight,
            "fps": fps.isFinite ? fps : 0.0,
            "hwdecCurrent": hwdecCurrent,
            "audioCodec": audioCodec,
            "audioDecoder": audioDecoder,
            "audioChannels": audioChannels,
            "audioSampleRate": audioSampleRate,
            "audioLang": audioLang,
            "videoBitrateKbps": videoBitrateKbps,
            "audioBitrateKbps": audioBitrateKbps,
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let jsonString = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return jsonString
    }

    private struct PlaybackStateSnapshot {
        let isLoading: Bool
        let isPlaying: Bool
        let isEnded: Bool
        let durationMs: Int64
        let positionMs: Int64
        let bufferedMs: Int64
        let speed: Float
    }

    func refreshPlaybackState() {
        guard mpv != nil else { return }

        stateRefreshLock.lock()
        if isPlaybackStateRefreshInFlight {
            stateRefreshLock.unlock()
            return
        }
        isPlaybackStateRefreshInFlight = true
        stateRefreshLock.unlock()

        let generation = playbackStateGeneration
        let coreGeneration = mpvGeneration
        mpvQueue.async { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration else { return }
            let snapshot = self.readPlaybackStateSnapshot()

            self.stateRefreshLock.lock()
            self.isPlaybackStateRefreshInFlight = false
            self.stateRefreshLock.unlock()

            guard let snapshot else { return }
            DispatchQueue.main.async {
                guard generation == self.playbackStateGeneration else { return }
                self.applyPlaybackStateSnapshot(snapshot)
            }
        }
    }

    private func readPlaybackStateSnapshot() -> PlaybackStateSnapshot? {
        guard mpv != nil else { return nil }
        let duration = getDouble("duration")
        let position = getDouble("time-pos")
        let cached = getDouble("demuxer-cache-time")
        let speed = getDouble("speed")
        let paused = getFlag("pause")
        let eofReached = getFlag("eof-reached")
        let idle = getFlag("core-idle")
        let seeking = getFlag("seeking")
        let bufferingCache = getFlag("paused-for-cache")

        return PlaybackStateSnapshot(
            isLoading: (idle && !paused && !eofReached) || seeking || bufferingCache,
            isPlaying: !paused && !idle && !eofReached,
            isEnded: eofReached,
            durationMs: Int64(duration * 1000),
            positionMs: Int64(max(position, 0) * 1000),
            bufferedMs: Int64(max(position + cached, 0) * 1000),
            speed: Float(speed > 0 ? speed : 1.0)
        )
    }

    var interpolatedPositionSeconds: Double {
        positionSampleLock.lock()
        let base = Double(positionSampleMs) / 1000.0
        let sampledAt = positionSampleTime
        let rate = positionSampleRate
        positionSampleLock.unlock()
        guard sampledAt > 0 else { return base }
        return base + max(0, CACurrentMediaTime() - sampledAt) * rate
    }

    private func applyPlaybackStateSnapshot(_ snapshot: PlaybackStateSnapshot) {
        isPlayerLoading = snapshot.isLoading
        isPlayerPlaying = snapshot.isPlaying
        isPlayerEnded = snapshot.isEnded
        durationMs = snapshot.durationMs
        positionMs = snapshot.positionMs
        bufferedMs = snapshot.bufferedMs
        currentSpeed = snapshot.speed

        positionSampleLock.lock()
        positionSampleMs = snapshot.positionMs
        positionSampleTime = CACurrentMediaTime()
        positionSampleRate = snapshot.isPlaying ? Double(snapshot.speed) : 0.0
        positionSampleLock.unlock()

        let shouldPublishNowPlayingState = !isEmbeddedPreviewMode &&
            (!isPlayerLoading || isPlayerPlaying || durationMs > 0 || positionMs > 0)
        if shouldPublishNowPlayingState {
            syncNowPlayingPlaybackState(isPlaying: isPlayerPlaying)
        }
    }

    private func syncNowPlayingPlaybackState(isPlaying: Bool) {
        nowPlayingController.syncPlayback(
            positionMs: positionMs,
            durationMs: durationMs,
            isPlaying: isPlaying,
            playbackSpeed: currentSpeed
        )
    }

    func updateState() {
        refreshPlaybackState()
        refreshTracks()
    }

    private func refreshTracks() {
        guard mpv != nil else { return }

        stateRefreshLock.lock()
        if isTrackRefreshInFlight {
            stateRefreshLock.unlock()
            return
        }
        isTrackRefreshInFlight = true
        stateRefreshLock.unlock()

        let coreGeneration = mpvGeneration
        mpvQueue.async { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration else { return }
            let tracks = self.readTracks()

            self.stateRefreshLock.lock()
            self.isTrackRefreshInFlight = false
            self.stateRefreshLock.unlock()

            guard let tracks else { return }
            DispatchQueue.main.async {
                self.audioTracks = tracks.audio
                self.subtitleTracks = tracks.subtitles
            }
        }
    }

    private func readTracks() -> (audio: [TrackInfo], subtitles: [TrackInfo])? {
        guard mpv != nil else { return nil }
        var audio = [TrackInfo]()
        var subs = [TrackInfo]()
        let count = getInt("track-list/count")
        var audioIdx = 0
        var subIdx = 0

        for i in 0..<count {
            let type = getString("track-list/\(i)/type") ?? ""
            let id = getInt("track-list/\(i)/id")
            let title = getTrackString(i, "title")
            let lang = getTrackString(i, "lang")
            let codec = getTrackString(i, "codec")
            let decoderDescription = getTrackString(i, "decoder-desc")
            let channels = getTrackString(i, "demux-channels")
            let channelCount = getInt("track-list/\(i)/demux-channel-count")
            let selected = getFlag("track-list/\(i)/selected")
            let displayTitle = formatTrackTitle(
                type: type,
                index: type == "audio" ? audioIdx : subIdx,
                title: title,
                lang: lang,
                codec: codec,
                decoderDescription: decoderDescription,
                channels: channels,
                channelCount: channelCount
            )

            if type == "audio" {
                audio.append(TrackInfo(index: audioIdx, id: id, type: type, title: displayTitle, lang: lang, selected: selected))
                audioIdx += 1
            } else if type == "sub" {
                subs.append(TrackInfo(index: subIdx, id: id, type: type, title: displayTitle, lang: lang, selected: selected))
                subIdx += 1
            }
        }
        return (audio, subs)
    }

    func updateNowPlayingMetadata(
        title: String,
        subtitle: String?,
        artworkUrl: String?
    ) {
        cachedNowPlayingMetadata = CachedNowPlayingMetadata(
            title: title,
            subtitle: subtitle,
            artworkUrl: artworkUrl
        )
        nowPlayingController.updateMetadata(
            title: title,
            subtitle: subtitle,
            artworkUrl: artworkUrl
        )
        publishNowPlayingForPlaybackSession()
    }

    func clearNowPlayingInfo() {
        cachedNowPlayingMetadata = nil
        nowPlayingController.clear()
    }

    private func publishCachedNowPlayingInfoIfNeeded() {
        guard let metadata = cachedNowPlayingMetadata else { return }
        nowPlayingController.updateMetadata(
            title: metadata.title,
            subtitle: metadata.subtitle,
            artworkUrl: metadata.artworkUrl
        )
    }

    private func publishNowPlayingForPlaybackSession() {
        guard !isEmbeddedPreviewMode else { return }
        activateAudioSessionForPlayback()
        if isViewLoaded, view.window != nil {
            becomeFirstResponder()
        }
        UIApplication.shared.beginReceivingRemoteControlEvents()
        publishCachedNowPlayingInfoIfNeeded()
        syncNowPlayingPlaybackState(isPlaying: isPlayerPlaying)
    }

    private func getTrackString(_ index: Int, _ field: String) -> String {
        (getString("track-list/\(index)/\(field)") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func formatTrackTitle(
        type: String,
        index: Int,
        title: String,
        lang: String,
        codec: String,
        decoderDescription: String,
        channels: String,
        channelCount: Int
    ) -> String {
        let base = ifNotBlank(title)
            ?? localizedLanguageName(lang)
            ?? (type == "sub" ? "Subtitle \(index + 1)" : "Track \(index + 1)")
        let codecName = codecDisplayName(codec) ?? codecDisplayName(decoderDescription)
        let channelName = type == "audio" ? channelLayoutName(channels: channels, channelCount: channelCount) : nil
        let details = [channelName, codecName]
            .compactMap { $0 }
            .filter { detail in !base.localizedCaseInsensitiveContains(detail) }
        return details.isEmpty ? base : "\(base) (\(details.joined(separator: ", ")))"
    }

    private func ifNotBlank(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func localizedLanguageName(_ languageCode: String) -> String? {
        guard let code = ifNotBlank(languageCode) else { return nil }
        return Locale.current.localizedString(forLanguageCode: code) ?? code
    }

    private func channelLayoutName(channels: String, channelCount: Int) -> String? {
        if let normalized = ifNotBlank(channels), normalized != "unknown" {
            let lower = normalized.lowercased()
            if lower == "mono" { return "Mono" }
            if lower == "stereo" { return "Stereo" }
            return normalized
        }
        switch channelCount {
        case 1:
            return "Mono"
        case 2:
            return "Stereo"
        case 6:
            return "5.1"
        case 8:
            return "7.1"
        case let count where count > 0:
            return "\(count)ch"
        default:
            return nil
        }
    }

    private func codecDisplayName(_ value: String) -> String? {
        guard let raw = ifNotBlank(value) else { return nil }
        let codec = raw.lowercased()
        if codec.contains("eac3") || codec.contains("e-ac-3") || codec.contains("e ac-3") {
            return codec.contains("joc") || codec.contains("atmos") ? "E-AC-3-JOC" : "E-AC-3"
        }
        if codec.contains("truehd") || codec.contains("true hd") { return "TrueHD" }
        if codec.contains("ac3") || codec.contains("ac-3") { return "AC-3" }
        if codec.contains("dts-hd") || codec.contains("dtshd") || codec.contains("dts hd") { return "DTS-HD" }
        if codec.contains("dts") || codec == "dca" { return "DTS" }
        if codec.contains("aac") { return "AAC" }
        if codec.contains("mp3") || codec.contains("mpeg audio") { return "MP3" }
        if codec.contains("mp2") { return "MP2" }
        if codec.contains("opus") { return "Opus" }
        if codec.contains("vorbis") { return "Vorbis" }
        if codec.contains("flac") { return "FLAC" }
        if codec.contains("alac") { return "ALAC" }
        if codec.contains("pcm") || codec.contains("wav") { return "WAV" }
        if codec.contains("amr_wb") || codec.contains("amr-wb") { return "AMR-WB" }
        if codec.contains("amr_nb") || codec.contains("amr-nb") { return "AMR-NB" }
        if codec.contains("amr") { return "AMR" }
        if codec.contains("iamf") { return "IAMF" }
        if codec.contains("mpegh") || codec.contains("mpeg-h") { return "MPEG-H" }
        if codec.contains("pgs") || codec.contains("hdmv") { return "PGS" }
        if codec.contains("subrip") || codec == "srt" { return "SRT" }
        if codec.contains("ass") || codec.contains("ssa") { return "SSA" }
        if codec.contains("webvtt") || codec == "vtt" { return "VTT" }
        if codec.contains("ttml") { return "TTML" }
        if codec.contains("mov_text") || codec.contains("tx3g") { return "TX3G" }
        if codec.contains("dvb") { return "DVB" }
        return raw
    }

    private func clearPlaybackError() {
        errorStateLock.lock()
        recentPlaybackLogs.removeAll(keepingCapacity: true)
        _currentErrorMessage = nil
        errorStateLock.unlock()
    }

    private func appendPlaybackLog(prefix: String, level: String, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard level == "warn" || level == "error" || level == "fatal" else { return }

        if !sawDeviceLossInLog, trimmed.contains("VK_ERROR_DEVICE_LOST") {
            sawDeviceLossInLog = true
            handleVideoOutputDeviceLost()
        }

        if emitCoalescedLog(prefix: prefix, level: level, text: trimmed) {
            InAppLogBridge.shared.mpv(platform: "iOS", prefix: prefix, level: level, message: trimmed)
        }

        let formatted = "[\(prefix)] \(trimmed)"
        errorStateLock.lock()
        recentPlaybackLogs.append(formatted)
        if recentPlaybackLogs.count > 4 {
            recentPlaybackLogs.removeFirst(recentPlaybackLogs.count - 4)
        }
        errorStateLock.unlock()
    }

    private func emitCoalescedLog(prefix: String, level: String, text: String) -> Bool {
        let key = "\(prefix)|\(level)|\(text)"
        let now = CACurrentMediaTime()

        var summary: String?
        logCoalesceLock.lock()
        if var entry = throttledLogEntries[key] {
            entry.count += 1
            if now - entry.lastEmitTime >= Self.logCoalesceInterval {
                summary = "\(text) (repeated ×\(entry.count))"
                entry.count = 0
                entry.lastEmitTime = now
            }
            throttledLogEntries[key] = entry
            logCoalesceLock.unlock()

            if let summary {
                InAppLogBridge.shared.mpv(platform: "iOS", prefix: prefix, level: level, message: summary)
            }
            return false
        }

        if throttledLogEntries.count > 64 { throttledLogEntries.removeAll(keepingCapacity: true) }
        throttledLogEntries[key] = ThrottledLogEntry(
            prefix: prefix,
            level: level,
            text: text,
            count: 0,
            lastEmitTime: now
        )
        logCoalesceLock.unlock()
        return true
    }

    private func flushPendingCoalescedLog() {
        logCoalesceLock.lock()
        let pending = throttledLogEntries.values.filter { $0.count > 0 }
        throttledLogEntries.removeAll(keepingCapacity: false)
        logCoalesceLock.unlock()

        for entry in pending {
            InAppLogBridge.shared.mpv(
                platform: "iOS",
                prefix: entry.prefix,
                level: entry.level,
                message: "\(entry.text) (repeated ×\(entry.count))"
            )
        }
    }

    private func setPlaybackError(_ fallback: String) {
        let trimmedFallback = fallback.trimmingCharacters(in: .whitespacesAndNewlines)
        errorStateLock.lock()
        var parts = recentPlaybackLogs.suffix(3)
        if !trimmedFallback.isEmpty && !parts.contains(trimmedFallback) {
            parts.append(trimmedFallback)
        }
        _currentErrorMessage = parts.isEmpty ? "Unable to play this stream." : parts.joined(separator: "\n")
        errorStateLock.unlock()
    }

    // MARK: - Event Loop

    private func readEvents() {
        let coreGeneration = mpvGeneration
        eventQueue.async { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration, let mpv = self.mpv else { return }

            while true {
                let event = mpv_wait_event(mpv, 0)
                guard let eventPtr = event else { break }
                if eventPtr.pointee.event_id == MPV_EVENT_NONE { break }

                switch eventPtr.pointee.event_id {
                case MPV_EVENT_PROPERTY_CHANGE:
                    self.subtitleFonts.handlePropertyChange(eventPtr)
                    DispatchQueue.main.async { self.updateState() }
                case MPV_EVENT_FILE_LOADED:
                    DispatchQueue.main.async {
                        self.clearPlaybackError()
                        self.isPlayerLoading = false
                        self.playbackStateGeneration &+= 1
                        self.invalidateMediaInfoCache()
                        self.updateState()
                        if !self.isEmbeddedPreviewMode {
                            self.publishNowPlayingForPlaybackSession()
                        }
                        self.logCurrentAudioOutput()
                        self.performDeviceLossResume()
                        self.primaryRenderSurface?.requestRenderBurst(reason: "file-loaded", count: 5)
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                            self?.prewarmAutomaticPictureInPictureSource(reason: "file-loaded")
                        }
                    }
                case MPV_EVENT_PLAYBACK_RESTART:
                    DispatchQueue.main.async {
                        self.updateState()
                        if !self.isEmbeddedPreviewMode {
                            self.publishNowPlayingForPlaybackSession()
                        }
                    }
                case MPV_EVENT_END_FILE:
                    if let data = eventPtr.pointee.data {
                        let endFile = UnsafePointer<mpv_event_end_file>(OpaquePointer(data)).pointee
                        if endFile.reason == MPV_END_FILE_REASON_ERROR {
                            let errorText = String(cString: mpv_error_string(endFile.error))
                            DispatchQueue.main.async { self.cancelPendingDeviceLossResume() }
                            self.setPlaybackError("[mpv] \(errorText)")
                            InAppLogBridge.shared.error(tag: "MPV/iOS", message: "End file error: \(errorText)")
                            print("[MPV] End file error: \(errorText)")
                        }
                    }
                case MPV_EVENT_SHUTDOWN:
                    return
                case MPV_EVENT_LOG_MESSAGE:
                    if let msg = UnsafeMutablePointer<mpv_event_log_message>(OpaquePointer(eventPtr.pointee.data)) {
                        let prefix = String(cString: msg.pointee.prefix!)
                        let level = String(cString: msg.pointee.level!)
                        let text = String(cString: msg.pointee.text!)
                        self.appendPlaybackLog(prefix: prefix, level: level, text: text)
                        print("[MPV][\(prefix)] \(level): \(text)", terminator: "")
                    }
                default:
                    break
                }
            }
        }
    }

    var currentVideoWidth: Int {
        scheduleMediaInfoRefreshIfNeeded()
        mediaInfoLock.lock()
        defer { mediaInfoLock.unlock() }
        return cachedVideoWidth
    }

    var currentVideoHeight: Int {
        scheduleMediaInfoRefreshIfNeeded()
        mediaInfoLock.lock()
        defer { mediaInfoLock.unlock() }
        return cachedVideoHeight
    }

    var currentRenderFrameRate: Double {
        scheduleMediaInfoRefreshIfNeeded()
        mediaInfoLock.lock()
        defer { mediaInfoLock.unlock() }
        return cachedFrameRate
    }

    private func readCurrentFrameRate() -> Double {
        let container = getDouble("container-fps")
        if container.isFinite, container >= 12 { return container }
        let estimated = getDouble("estimated-vf-fps")
        return estimated.isFinite && estimated >= 12 ? estimated : 30.0
    }

    private func readCurrentVideoWidth() -> Int {
        let width = getInt("video-out-params/w")
        return width > 0 ? width : getInt("video-params/w")
    }

    private func readCurrentVideoHeight() -> Int {
        let height = getInt("video-out-params/h")
        return height > 0 ? height : getInt("video-params/h")
    }

    // MARK: - MPV Helpers

    func command(_ command: String, args: [String?] = [], checkForErrors: Bool = true) {
        guard mpv != nil else { return }
        let argv = makeCArgs(command, args)
        withMpvOnQueue { [weak self] ctx in
            var cargs = argv.map { $0.flatMap { UnsafePointer<CChar>(strdup($0)) } }
            defer { for ptr in cargs where ptr != nil { free(UnsafeMutablePointer(mutating: ptr!)) } }
            let ret = mpv_command(ctx, &cargs)
            if checkForErrors { self?.checkError(ret) }
        }
    }

    private func makeCArgs(_ command: String, _ args: [String?]) -> [String?] {
        var strArgs = args
        strArgs.insert(command, at: 0)
        strArgs.append(nil)
        return strArgs
    }

    func getDouble(_ name: String) -> Double {
        guard let ctx = mpv else { return 0.0 }
        var data = Double()
        mpv_get_property(ctx, name, MPV_FORMAT_DOUBLE, &data)
        return data
    }

    private func getString(_ name: String) -> String? {
        guard let ctx = mpv else { return nil }
        let cstr = mpv_get_property_string(ctx, name)
        let str: String? = cstr == nil ? nil : String(cString: cstr!)
        mpv_free(cstr)
        return str
    }

    func getFlag(_ name: String) -> Bool {
        guard let ctx = mpv else { return false }
        var data = CInt(0)
        mpv_get_property(ctx, name, MPV_FORMAT_FLAG, &data)
        return data > 0
    }

    func setFlag(_ name: String, _ flag: Bool) {
        withMpvOnQueue { ctx in
            var data = CInt(flag ? 1 : 0)  // MPV_FORMAT_FLAG is a C int
            mpv_set_property(ctx, name, MPV_FORMAT_FLAG, &data)
        }
    }

    func setStringProperty(_ name: String, _ value: String) {
        withMpvOnQueue { [weak self] ctx in
            self?.checkError(mpv_set_property_string(ctx, name, value))
        }
    }

    private func setDoubleProperty(_ name: String, _ value: Double) {
        withMpvOnQueue { [weak self] ctx in
            var data = value
            self?.checkError(mpv_set_property(ctx, name, MPV_FORMAT_DOUBLE, &data))
        }
    }

    private func setIntProperty(_ name: String, _ value: Int64) {
        withMpvOnQueue { [weak self] ctx in
            var data = value
            self?.checkError(mpv_set_property(ctx, name, MPV_FORMAT_INT64, &data))
        }
    }

    private func setVideoEqualizer(_ name: String, _ value: Int) {
        setIntProperty(name, Int64(max(-100, min(100, value))))
    }

    private func getInt(_ name: String) -> Int {
        guard let ctx = mpv else { return 0 }
        var data = Int64()
        mpv_get_property(ctx, name, MPV_FORMAT_INT64, &data)
        return Int(data)
    }

    private func logCurrentAudioOutput() {
        let coreGeneration = mpvGeneration
        mpvQueue.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self, self.mpvGeneration == coreGeneration, self.mpv != nil else { return }
            let currentAo = self.getString("current-ao") ?? "unknown"
            let channels = self.getString("audio-out-params/hr-channels")
                ?? self.getString("audio-params/hr-channels")
                ?? "unknown"
            let channelCount = self.getInt("audio-out-params/channel-count")
            let codec = self.getString("audio-codec-name") ?? "unknown"
            let message = "Audio output: ao=\(currentAo), channels=\(channels), channelCount=\(channelCount), codec=\(codec)"
            InAppLogBridge.shared.info(tag: "MPV/iOS", message: message)
            print("[MPV] \(message)")
        }
    }

    func checkError(_ status: CInt) {
        if status < 0 {
            let message = "API error: \(String(cString: mpv_error_string(status)))"
            InAppLogBridge.shared.warn(tag: "MPV/iOS", message: message)
            print("[MPV] \(message)")
        }
    }

    private func redactedPlaybackUrlForLogs(_ urlString: String, maxLength: Int = 180) -> String {
        let withoutQuery = urlString.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? urlString
        if withoutQuery.count <= maxLength {
            return withoutQuery
        }
        return String(withoutQuery.prefix(maxLength)) + "…"
    }

    private func sanitizeRequestHeaders(_ headers: [String: String]) -> [String: String] {
        guard !headers.isEmpty else { return [:] }

        var sanitized: [String: String] = [:]
        sanitized.reserveCapacity(headers.count)
        headers.forEach { rawKey, rawValue in
            let key = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
            let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !key.isEmpty, !value.isEmpty else { return }
            guard key.caseInsensitiveCompare("Range") != .orderedSame else { return }
            sanitized[key] = value
        }
        return sanitized
    }

    private func applyRequestHeaders(_ headers: [String: String]) {
        guard mpv != nil else { return }
        if headers.isEmpty {
            setStringProperty("http-header-fields", "")
            return
        }

        let serialized = headers
            .sorted { $0.key.localizedCaseInsensitiveCompare($1.key) == .orderedAscending }
            .map { key, value in
                let escapedValue = value
                    .replacingOccurrences(of: "\\", with: "\\\\")
                    .replacingOccurrences(of: ",", with: "\\,")
                return "\(key): \(escapedValue)"
            }
            .joined(separator: ",")
        setStringProperty("http-header-fields", serialized)
    }

    private func refreshImmersiveSystemUI() {
        guard !isEmbeddedPreviewMode else { return }
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        setNeedsStatusBarAppearanceUpdate()

        var currentParent = parent
        while let controller = currentParent {
            controller.setNeedsUpdateOfHomeIndicatorAutoHidden()
            controller.setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
            controller.setNeedsStatusBarAppearanceUpdate()
            if let rootController = controller as? RootComposeViewController {
                rootController.refreshImmersiveSystemUI()
            }
            currentParent = controller.parent
        }
    }

    private func publishImmersiveSystemUIVisibility(isVisible: Bool) {
        guard !isEmbeddedPreviewMode else { return }
        if isVisible {
            NuvioImmersiveSystemUI.shared.playerDidBecomeVisible(self)
        } else {
            NuvioImmersiveSystemUI.shared.playerDidBecomeHidden(self)
        }
        NotificationCenter.default.post(
            name: nuvioPlayerImmersiveSystemUIVisibilityDidChange,
            object: self,
            userInfo: [nuvioPlayerImmersiveSystemUIVisibleKey: isVisible]
        )
    }
}

// MARK: - Bridge Creator (implements Kotlin protocol)

final class MPVPlayerBridgeCreator: NSObject, NuvioPlayerBridgeCreator {
    func createBridge() -> any NuvioPlayerBridge {
        return MPVPlayerBridgeImpl()
    }
}

// MARK: - Registration (called from Swift app startup)

enum NuvioPlayerRegistration {
    static func register() {
        NuvioPlayerBridgeFactory.shared.registerFactory(creator: MPVPlayerBridgeCreator())
    }
}
