import AVFoundation
import Libmpv
import UIKit

@MainActor
final class MPVPlaybackSession: ObservableObject {
    @Published private(set) var isPaused = false
    @Published private(set) var isLoading = true
    @Published private(set) var position: Double = 0
    @Published private(set) var duration: Double = 0
    @Published private(set) var speed: Double = 1
    @Published private(set) var resizeMode: PlayerResizeMode = .fit
    @Published private(set) var audioTracks: [PlaybackTrack] = []
    @Published private(set) var subtitleTracks: [PlaybackTrack] = []
    @Published private(set) var subtitleDelayMilliseconds = 0
    @Published private(set) var subtitleFontSize = 52
    @Published private(set) var errorMessage: String?
    @Published private(set) var activeSourceName = ""
    var onPress: ((UIPress.PressType) -> Void)?

    fileprivate weak var controller: MPVPlayerController?

    func load(
        url: URL,
        startPosition: Double? = nil,
        requestHeaders: [String: String] = [:],
        responseHeaders: [String: String] = [:]
    ) {
        controller?.load(
            url: url,
            startPosition: startPosition,
            requestHeaders: requestHeaders,
            responseHeaders: responseHeaders
        )
    }
    func toggle() { controller?.togglePlayback() }
    func seek(by seconds: Double) { controller?.seek(by: seconds) }
    func seek(to seconds: Double) { controller?.seek(to: seconds) }
    func setSpeed(_ speed: Double) { controller?.setSpeed(speed) }
    func setResizeMode(_ mode: PlayerResizeMode) { controller?.setResizeMode(mode) }
    func selectAudio(id: Int64) { controller?.selectAudio(id: id) }
    func selectSubtitle(id: Int64?) { controller?.selectSubtitle(id: id) }
    func setSubtitleDelay(milliseconds: Int) {
        controller?.setSubtitleDelay(milliseconds: milliseconds)
    }
    func setSubtitleFontSize(_ size: Int) { controller?.setSubtitleFontSize(size) }
    func updateActiveSourceName(_ name: String) { activeSourceName = name }
    func switchSource(url: URL) { controller?.load(url: url) }
    func stop() { controller?.stop() }

    func beginLoading() {
        isLoading = true
        errorMessage = nil
        audioTracks = []
        subtitleTracks = []
    }

    func update(paused: Bool? = nil, loading: Bool? = nil, error: String? = nil) {
        if let paused { isPaused = paused }
        if let loading { isLoading = loading }
        if let error { errorMessage = error }
    }

    func update(position: Double, duration: Double) {
        self.position = position
        self.duration = duration
    }

    func updateSubtitle(delayMilliseconds: Int? = nil, fontSize: Int? = nil) {
        if let delayMilliseconds { subtitleDelayMilliseconds = delayMilliseconds }
        if let fontSize { subtitleFontSize = fontSize }
    }

    func update(
        speed: Double,
        resizeMode: PlayerResizeMode,
        audioTracks: [PlaybackTrack],
        subtitleTracks: [PlaybackTrack]
    ) {
        self.speed = speed
        self.resizeMode = resizeMode
        self.audioTracks = audioTracks
        self.subtitleTracks = subtitleTracks
    }
}

final class MPVPlayerController: UIViewController {
    let session: MPVPlaybackSession
    private let metalLayer = MPVMetalLayer()
    private let eventQueue = DispatchQueue(label: "nuvio.tv.mpv.events", qos: .userInitiated)
    var mpv: OpaquePointer?
    private var progressTimer: Timer?
    private var pendingURL: URL?
    private var pendingStartPosition: Double?

    init(session: MPVPlaybackSession) {
        self.session = session
        super.init(nibName: nil, bundle: nil)
        session.controller = self
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override var canBecomeFirstResponder: Bool { true }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        configureLayer()
        configureAudio()
        setupMPV()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.publishProgress()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let scale = view.window?.screen.nativeScale ?? UIScreen.main.nativeScale
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        metalLayer.frame = view.bounds
        metalLayer.drawableSize = CGSize(width: view.bounds.width * scale, height: view.bounds.height * scale)
        CATransaction.commit()
        if let url = pendingURL, view.window != nil, view.bounds.width > 1 {
            pendingURL = nil
            command("loadfile", url.absoluteString, "replace")
        }
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        guard let type = presses.first?.type else { return super.pressesBegan(presses, with: event) }
        session.onPress?(type)
        super.pressesBegan(presses, with: event)
    }

    func load(
        url: URL,
        startPosition: Double? = nil,
        requestHeaders: [String: String] = [:],
        responseHeaders: [String: String] = [:]
    ) {
        applyRequestHeaders(requestHeaders, responseHeaders: responseHeaders)
        pendingStartPosition = startPosition
        Task { @MainActor in
            session.beginLoading()
        }
        if view.window == nil || view.bounds.width <= 1 {
            pendingURL = url
        } else {
            command("loadfile", url.absoluteString, "replace")
        }
    }

    func setSubtitleDelay(milliseconds: Int) {
        guard let mpv else { return }
        let clamped = min(max(milliseconds, -60_000), 60_000)
        var seconds = Double(clamped) / 1_000
        mpv_set_property(mpv, "sub-delay", MPV_FORMAT_DOUBLE, &seconds)
        Task { @MainActor in session.updateSubtitle(delayMilliseconds: clamped) }
    }
    private func applyPendingStartPosition() {
        guard let position = pendingStartPosition, position > 0 else { return }
        pendingStartPosition = nil
        command("seek", String(position), "absolute+exact")
    }

    func togglePlayback() {
        guard let mpv else { return }
        var paused: Int32 = 0
        mpv_get_property(mpv, "pause", MPV_FORMAT_FLAG, &paused)
        paused = paused == 0 ? 1 : 0
        mpv_set_property(mpv, "pause", MPV_FORMAT_FLAG, &paused)
        Task { @MainActor in session.update(paused: paused != 0) }
    }

    func seek(by seconds: Double) {
        command("seek", String(seconds), "relative+exact")
    }

    func seek(to seconds: Double) {
        command("seek", String(seconds), "absolute+exact")
    }

    func setSpeed(_ speed: Double) {
        guard let mpv else { return }
        var value = speed
        mpv_set_property(mpv, "speed", MPV_FORMAT_DOUBLE, &value)
        publishPlaybackOptions()
    }

    func setResizeMode(_ mode: PlayerResizeMode) {
        guard let mpv else { return }
        switch mode {
        case .fit:
            mpv_set_property_string(mpv, "panscan", "0")
            mpv_set_property_string(mpv, "video-unscaled", "no")
        case .fill:
            mpv_set_property_string(mpv, "panscan", "1")
            mpv_set_property_string(mpv, "video-unscaled", "no")
        case .original:
            mpv_set_property_string(mpv, "panscan", "0")
            mpv_set_property_string(mpv, "video-unscaled", "downscale-big")
        }
        publishPlaybackOptions(resizeMode: mode)
    }

    func selectAudio(id: Int64) {
        guard let mpv else { return }
        var value = id
        mpv_set_property(mpv, "aid", MPV_FORMAT_INT64, &value)
        publishPlaybackOptions()
    }

    func selectSubtitle(id: Int64?) {
        guard let mpv else { return }
        if var value = id {
            mpv_set_property(mpv, "sid", MPV_FORMAT_INT64, &value)
        } else {
            mpv_set_property_string(mpv, "sid", "no")
        }
        publishPlaybackOptions()
    }

    func setSubtitleFontSize(_ size: Int) {
        guard let mpv else { return }
        let clamped = min(max(size, 24), 96)
        var value = Double(clamped)
        mpv_set_property(mpv, "sub-font-size", MPV_FORMAT_DOUBLE, &value)
        Task { @MainActor in session.updateSubtitle(fontSize: clamped) }
    }

    func stop() {
        progressTimer?.invalidate()
        progressTimer = nil
        command("stop")
    }

    private func configureLayer() {
        metalLayer.contentsGravity = .resize
        metalLayer.framebufferOnly = true
        metalLayer.backgroundColor = UIColor.black.cgColor
        view.layer.addSublayer(metalLayer)
    }

    private func configureAudio() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    private func setupMPV() {
        mpv = mpv_create()
        guard let mpv else {
            Task { @MainActor in session.update(loading: false, error: "Could not initialize the MPV player.") }
            return
        }
        mpv_request_log_messages(mpv, "warn")
        var layerPointer = Int64(Int(bitPattern: Unmanaged.passUnretained(metalLayer).toOpaque()))
        setOption(mpv, "wid", format: MPV_FORMAT_INT64, value: &layerPointer)
        setOption(mpv, "vo", "gpu-next")
        setOption(mpv, "gpu-api", "vulkan")
        setOption(mpv, "gpu-context", "moltenvk")
        setOption(mpv, "hwdec", "videotoolbox")
        setOption(mpv, "ao", "audiounit")
        setOption(mpv, "audio-channels", "auto")
        setOption(mpv, "audio-fallback-to-null", "yes")
        setOption(mpv, "vulkan-swap-mode", "fifo")
        setOption(mpv, "vulkan-queue-count", "1")
        setOption(mpv, "vulkan-async-compute", "no")
        setOption(mpv, "vulkan-async-transfer", "no")
        setOption(mpv, "vulkan-disable-interop", "yes")
        setOption(mpv, "keep-open", "yes")
        setOption(mpv, "target-colorspace-hint", "yes")
        setOption(mpv, "tone-mapping", "auto")
        setOption(mpv, "hdr-compute-peak", "yes")
        guard mpv_initialize(mpv) >= 0 else {
            Task { @MainActor in session.update(loading: false, error: "MPV initialization failed.") }
            return
        }
        mpv_set_wakeup_callback(mpv, { context in
            guard let context else { return }
            Unmanaged<MPVPlayerController>.fromOpaque(context).takeUnretainedValue().readEvents()
        }, Unmanaged.passUnretained(self).toOpaque())
    }

    private func readEvents() {
        eventQueue.async { [weak self] in
            guard let self, let mpv = self.mpv else { return }
            while true {
                guard let event = mpv_wait_event(mpv, 0), event.pointee.event_id != MPV_EVENT_NONE else { return }
                switch event.pointee.event_id {
                case MPV_EVENT_FILE_LOADED, MPV_EVENT_PLAYBACK_RESTART:
                    self.applyPendingStartPosition()
                    Task { @MainActor in
                        self.session.update(paused: false, loading: false)
                        self.publishPlaybackOptions()
                    }
                case MPV_EVENT_END_FILE:
                    if let data = event.pointee.data {
                        let end = UnsafePointer<mpv_event_end_file>(OpaquePointer(data)).pointee
                        if end.reason == MPV_END_FILE_REASON_ERROR {
                            let text = String(cString: mpv_error_string(end.error))
                            Task { @MainActor in self.session.update(loading: false, error: text) }
                        }
                    }
                default: break
                }
            }
        }
    }

    func command(_ values: String...) {
        guard let mpv else { return }
        var cStrings: [UnsafePointer<CChar>?] = values.map { value in
            guard let pointer = strdup(value) else { return nil }
            return UnsafePointer(pointer)
        }
        cStrings.append(nil)
        defer { cStrings.dropLast().forEach { pointer in
            if let pointer { free(UnsafeMutablePointer(mutating: pointer)) }
        } }
        _ = mpv_command(mpv, &cStrings)
    }

    private func setOption(_ mpv: OpaquePointer, _ name: String, _ value: String) {
        _ = mpv_set_option_string(mpv, name, value)
    }

    private func setOption<T>(_ mpv: OpaquePointer, _ name: String, format: mpv_format, value: inout T) {
        _ = mpv_set_option(mpv, name, format, &value)
    }

    deinit {
        progressTimer?.invalidate()
        if let mpv { mpv_terminate_destroy(mpv) }
    }
}
