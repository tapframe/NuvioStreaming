import Foundation
import MediaPlayer

@MainActor
final class TVNowPlayingController {
    private weak var session: MPVPlaybackSession?
    private var title = ""
    private var subtitle: String?
    private var targets: [(MPRemoteCommand, Any)] = []

    init(session: MPVPlaybackSession) {
        self.session = session
        configureCommands()
    }

    func updateMetadata(title: String, subtitle: String?) {
        self.title = title
        self.subtitle = subtitle
        publish()
    }

    func sync(position: Double, duration: Double, isPaused: Bool, speed: Double) {
        guard !title.isEmpty else { return }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyTitle] = title
        info[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.video.rawValue
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(position, 0)
        info[MPNowPlayingInfoPropertyPlaybackRate] = isPaused ? 0 : speed
        info[MPNowPlayingInfoPropertyIsLiveStream] = duration <= 0
        if duration > 0 { info[MPMediaItemPropertyPlaybackDuration] = duration }
        if let subtitle, !subtitle.isEmpty { info[MPMediaItemPropertyArtist] = subtitle }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    func clear() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    func invalidate() {
        clear()
        targets.forEach { $0.0.removeTarget($0.1) }
        targets.removeAll()
    }

    private func publish() {
        sync(position: 0, duration: 0, isPaused: true, speed: 1)
    }

    private func configureCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.togglePlayPauseCommand.isEnabled = true
        center.skipForwardCommand.isEnabled = true
        center.skipBackwardCommand.isEnabled = true
        center.changePlaybackPositionCommand.isEnabled = true
        center.skipForwardCommand.preferredIntervals = [10]
        center.skipBackwardCommand.preferredIntervals = [10]

        add(center.togglePlayPauseCommand) { [weak self] _ in
            Task { @MainActor in self?.session?.toggle() }
            return .success
        }
        add(center.skipForwardCommand) { [weak self] event in
            guard let interval = (event as? MPSkipIntervalCommandEvent)?.interval else {
                return .commandFailed
            }
            Task { @MainActor in self?.session?.seek(by: interval) }
            return .success
        }
        add(center.skipBackwardCommand) { [weak self] event in
            guard let interval = (event as? MPSkipIntervalCommandEvent)?.interval else {
                return .commandFailed
            }
            Task { @MainActor in self?.session?.seek(by: -interval) }
            return .success
        }
        add(center.changePlaybackPositionCommand) { [weak self] event in
            guard let position = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime else {
                return .commandFailed
            }
            Task { @MainActor in self?.session?.seek(to: position) }
            return .success
        }
    }

    private func add(
        _ command: MPRemoteCommand,
        handler: @escaping (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus
    ) {
        targets.append((command, command.addTarget(handler: handler)))
    }
}
