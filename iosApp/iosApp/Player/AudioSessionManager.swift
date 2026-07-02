import AVFoundation
import MediaPlayer
import UIKit

final class AudioSessionManager {
    static let shared = AudioSessionManager()

    private weak var activePlayer: MPVPlayerViewController?
    private var pausedDueToRouteChange = false
    private var commandsRegistered = false
    private var nowPlayingUpdateTimer: Timer?

    private init() {}

    func registerActivePlayer(_ player: MPVPlayerViewController) {
        activePlayer = player
        pausedDueToRouteChange = false
        configureAudioSession()
        setupNotificationObservers()
        UIApplication.shared.beginReceivingRemoteControlEvents()
        registerRemoteCommands()
        setupNowPlayingInfo()
        startNowPlayingUpdateTimer()
    }

    func unregisterActivePlayer(_ player: MPVPlayerViewController) {
        guard activePlayer === player else { return }
        activePlayer = nil
        pausedDueToRouteChange = false
        stopNowPlayingUpdateTimer()
        clearNowPlayingInfo()
        UIApplication.shared.endReceivingRemoteControlEvents()
        unregisterRemoteCommands()
        removeNotificationObservers()
        deactivateAudioSession()
    }

    func refreshSessionAndNowPlaying() {
        guard activePlayer != nil else { return }
        configureAudioSession()
        updateNowPlayingInfo()
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
        } catch {}
    }

    private func deactivateAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {}
    }

    private func setupNowPlayingInfo() {
        var info = [String: Any]()
        info[MPNowPlayingInfoPropertyIsLiveStream] = false
        info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0.0
        info[MPMediaItemPropertyPlaybackDuration] = 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = .playing
        updateNowPlayingInfo()
    }

    func updateNowPlayingInfo() {
        guard let player = activePlayer else { return }

        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
        let positionSeconds = Double(player.positionMs) / 1000.0
        let durationSeconds = Double(player.durationMs) / 1000.0

        info[MPMediaItemPropertyTitle] = player.mediaTitle()
        info[MPMediaItemPropertyPlaybackDuration] = durationSeconds
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = positionSeconds
        info[MPNowPlayingInfoPropertyPlaybackRate] = player.isPlayerPlaying ? Double(player.currentSpeed) : 0.0
        info[MPNowPlayingInfoPropertyIsLiveStream] = durationSeconds <= 0

        if let image = player.getPosterImage() {
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            info[MPMediaItemPropertyArtwork] = artwork
        }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = player.isPlayerPlaying ? .playing : .paused
    }

    private func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        MPNowPlayingInfoCenter.default().playbackState = .stopped
    }

    private func startNowPlayingUpdateTimer() {
        stopNowPlayingUpdateTimer()
        nowPlayingUpdateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.updateNowPlayingInfo()
        }
    }

    private func stopNowPlayingUpdateTimer() {
        nowPlayingUpdateTimer?.invalidate()
        nowPlayingUpdateTimer = nil
    }

    private func setupNotificationObservers() {
        let nc = NotificationCenter.default
        nc.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
        nc.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)

        nc.addObserver(
            self,
            selector: #selector(handleRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: nil
        )
        nc.addObserver(
            self,
            selector: #selector(handleInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: nil
        )
    }

    private func removeNotificationObservers() {
        let nc = NotificationCenter.default
        nc.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
        nc.removeObserver(self, name: AVAudioSession.interruptionNotification, object: nil)
    }

    @objc private func handleRouteChange(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue)
        else { return }

        switch reason {
        case .oldDeviceUnavailable:
            handleAudioDeviceDisconnected(userInfo: userInfo)
        case .newDeviceAvailable:
            handleAudioDeviceConnected()
        default:
            break
        }
    }

    private func handleAudioDeviceDisconnected(userInfo: [AnyHashable: Any]) {
        guard activePlayer != nil else { return }

        if let previousRoute = userInfo[AVAudioSessionRouteChangePreviousRouteKey] as? AVAudioSessionRouteDescription {
            let hadExternalAudio = previousRoute.outputs.contains { output in
                output.portType != .builtInSpeaker && output.portType != .builtInReceiver
            }
            guard hadExternalAudio else { return }
        }

        DispatchQueue.main.async { [weak self] in
            guard let self, let player = self.activePlayer else { return }
            if !player.isMpvPaused() {
                player.pausePlayback()
                player.refreshPlaybackState()
                self.pausedDueToRouteChange = true
                self.updateNowPlayingInfo()
            }
        }
    }

    private func handleAudioDeviceConnected() {
        pausedDueToRouteChange = false
    }

    @objc private func handleInterruption(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue)
        else { return }

        switch type {
        case .began:
            DispatchQueue.main.async { [weak self] in
                guard let self, let player = self.activePlayer else { return }
                player.pausePlayback()
                player.refreshPlaybackState()
                self.updateNowPlayingInfo()
            }
        case .ended:
            let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            if options.contains(.shouldResume) {
                DispatchQueue.main.async { [weak self] in
                    guard let self, let player = self.activePlayer else { return }
                    player.playPlayback()
                    player.refreshPlaybackState()
                    self.updateNowPlayingInfo()
                }
            }
        default:
            break
        }
    }

    private func registerRemoteCommands() {
        guard !commandsRegistered else { return }
        commandsRegistered = true

        let center = MPRemoteCommandCenter.shared()

        center.playCommand.isEnabled = true
        center.playCommand.addTarget { [weak self] _ in
            guard let self, let player = self.activePlayer else { return .noActionableNowPlayingItem }
            DispatchQueue.main.async {
                player.playPlayback()
                player.refreshPlaybackState()
                self.updateNowPlayingInfo()
            }
            return .success
        }

        center.pauseCommand.isEnabled = true
        center.pauseCommand.addTarget { [weak self] _ in
            guard let self, let player = self.activePlayer else { return .noActionableNowPlayingItem }
            DispatchQueue.main.async {
                player.pausePlayback()
                player.refreshPlaybackState()
                self.updateNowPlayingInfo()
            }
            return .success
        }

        center.togglePlayPauseCommand.isEnabled = true
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self, let player = self.activePlayer else { return .noActionableNowPlayingItem }
            DispatchQueue.main.async {
                if player.isMpvPaused() {
                    player.playPlayback()
                } else {
                    player.pausePlayback()
                }
                player.refreshPlaybackState()
                self.updateNowPlayingInfo()
            }
            return .success
        }

        center.stopCommand.isEnabled = true
        center.stopCommand.addTarget { [weak self] _ in
            guard let self, let player = self.activePlayer else { return .noActionableNowPlayingItem }
            DispatchQueue.main.async {
                player.pausePlayback()
                player.refreshPlaybackState()
                self.updateNowPlayingInfo()
            }
            return .success
        }

        center.nextTrackCommand.isEnabled = false
        center.previousTrackCommand.isEnabled = false
        center.skipForwardCommand.isEnabled = false
        center.skipBackwardCommand.isEnabled = false
        center.seekForwardCommand.isEnabled = false
        center.seekBackwardCommand.isEnabled = false
        center.changePlaybackRateCommand.isEnabled = false
    }

    private func unregisterRemoteCommands() {
        guard commandsRegistered else { return }
        commandsRegistered = false

        let center = MPRemoteCommandCenter.shared()
        center.playCommand.removeTarget(nil)
        center.pauseCommand.removeTarget(nil)
        center.togglePlayPauseCommand.removeTarget(nil)
        center.stopCommand.removeTarget(nil)
    }
}
