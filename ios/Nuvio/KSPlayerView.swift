//
//  KSPlayerView.swift
//  Nuvio
//
//  Created by KSPlayer integration
//

import Foundation
import KSPlayer
import React

@objc(KSPlayerView)
class KSPlayerView: UIView {
    private var playerView: IOSVideoPlayerView!
    private var currentSource: NSDictionary?
    private var isPaused = false
    private var currentVolume: Float = 1.0
    weak var viewManager: KSPlayerViewManager?
    private var loadTimeoutWorkItem: DispatchWorkItem?
    
    // Event blocks for Fabric
    @objc var onLoad: RCTDirectEventBlock?
    @objc var onProgress: RCTDirectEventBlock?
    @objc var onBuffering: RCTDirectEventBlock?
    @objc var onEnd: RCTDirectEventBlock?
    @objc var onError: RCTDirectEventBlock?
    @objc var onBufferingProgress: RCTDirectEventBlock?
    
    // Property setters that React Native will call
    @objc var source: NSDictionary? {
        didSet {
            if let source = source {
                setSource(source)
            }
        }
    }
    
    @objc var paused: Bool = false {
        didSet {
            setPaused(paused)
        }
    }
    
    @objc var volume: NSNumber = 1.0 {
        didSet {
            setVolume(volume.floatValue)
        }
    }
    
    @objc var audioTrack: NSNumber = -1 {
        didSet {
            setAudioTrack(audioTrack.intValue)
        }
    }
    
    @objc var textTrack: NSNumber = -1 {
        didSet {
            setTextTrack(textTrack.intValue)
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupPlayerView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupPlayerView()
    }

    private func setupPlayerView() {
        playerView = IOSVideoPlayerView()
        playerView.translatesAutoresizingMaskIntoConstraints = false
        // Hide native controls - we use custom React Native controls
        playerView.isUserInteractionEnabled = false
        // Hide KSPlayer's built-in overlay/controls
        playerView.controllerView.isHidden = true
        playerView.contentOverlayView.isHidden = true
        playerView.controllerView.alpha = 0
        playerView.contentOverlayView.alpha = 0
        playerView.controllerView.gestureRecognizers?.forEach { $0.isEnabled = false }
        addSubview(playerView)

        NSLayoutConstraint.activate([
            playerView.topAnchor.constraint(equalTo: topAnchor),
            playerView.leadingAnchor.constraint(equalTo: leadingAnchor),
            playerView.trailingAnchor.constraint(equalTo: trailingAnchor),
            playerView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])

        // Set up player delegates and callbacks
        setupPlayerCallbacks()
    }

    private func setupPlayerCallbacks() {
        // Configure KSOptions (use static defaults where required)
        KSOptions.isAutoPlay = false
        #if targetEnvironment(simulator)
        // Simulator: disable hardware decode and MEPlayer to avoid VT/Vulkan issues
        KSOptions.hardwareDecode = false
        KSOptions.asynchronousDecompression = false
        KSOptions.secondPlayerType = nil
        #endif
    }

    func setSource(_ source: NSDictionary) {
        currentSource = source

        guard let uri = source["uri"] as? String else {
            print("KSPlayerView: No URI provided")
            return
        }

        var headers: [String: String] = [:]
        if let headersDict = source["headers"] as? [String: String] {
            headers = headersDict
        }

        // Choose player pipeline based on format
        let isMKV = uri.lowercased().contains(".mkv")
        #if targetEnvironment(simulator)
        if isMKV {
            // MKV not supported on AVPlayer in Simulator and MEPlayer is disabled
            sendEvent("onError", ["error": "MKV playback is not supported in the iOS Simulator. Test on a real device."])
        }
        #else
        if isMKV {
            // Prefer MEPlayer (FFmpeg) for MKV on device
            KSOptions.firstPlayerType = KSMEPlayer.self
            KSOptions.secondPlayerType = nil
        } else {
            KSOptions.firstPlayerType = KSAVPlayer.self
            KSOptions.secondPlayerType = KSMEPlayer.self
        }
        #endif

        // Create KSPlayerResource
        let url = URL(string: uri)!
        let resource = KSPlayerResource(url: url, options: createOptions(with: headers), name: "Video")

        print("KSPlayerView: Setting source: \(uri)")
        playerView.set(resource: resource)
        
        // Set up delegate after setting the resource
        playerView.playerLayer?.delegate = self

        // Apply current state
        if isPaused {
            playerView.pause()
        } else {
            playerView.play()
        }

        setVolume(currentVolume)

        // Start a safety timeout to surface errors if never ready
        loadTimeoutWorkItem?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            let dur = self.playerView.playerLayer?.player.duration ?? 0
            if dur <= 0 {
                self.sendEvent("onError", ["error": "Playback timeout: stream did not become ready."])
            }
        }
        loadTimeoutWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }

    private func createOptions(with headers: [String: String]) -> KSOptions {
        let options = KSOptions()
        // Disable native player remote control center integration; use RN controls
        options.registerRemoteControll = false
        
        // Configure audio for proper dialogue mixing using FFmpeg's pan filter
        // This approach uses standard audio engineering practices for multi-channel downmixing

        // Use conservative center channel mixing that preserves spatial audio
        // c0 (Left) = 70% original left + 30% center (dialogue) + 20% rear left
        // c1 (Right) = 70% original right + 30% center (dialogue) + 20% rear right
        // This creates natural dialogue presence without the "playing on both ears" effect
        options.audioFilters.append("pan=stereo|c0=0.7*c0+0.3*c2+0.2*c4|c1=0.7*c1+0.3*c2+0.2*c5")

        // Alternative: Use FFmpeg's surround filter for more sophisticated downmixing
        // This provides better spatial audio processing and natural dialogue mixing
        // options.audioFilters.append("surround=ang=45")
        
        #if targetEnvironment(simulator)
        options.hardwareDecode = false
        options.asynchronousDecompression = false
        #else
        options.hardwareDecode = KSOptions.hardwareDecode
        #endif
        if !headers.isEmpty {
            options.appendHeader(headers)
            if let referer = headers["Referer"] ?? headers["referer"] {
                options.referer = referer
            }
        }
        return options
    }

    func setPaused(_ paused: Bool) {
        isPaused = paused
        if paused {
            playerView.pause()
        } else {
            playerView.play()
        }
    }

    func setVolume(_ volume: Float) {
        currentVolume = volume
        playerView.playerLayer?.player.playbackVolume = volume
    }

    func seek(to time: TimeInterval) {
        guard let playerLayer = playerView.playerLayer,
              playerLayer.player.isReadyToPlay,
              playerLayer.player.seekable else {
            print("KSPlayerView: Cannot seek - player not ready or not seekable")
            return
        }
        
        playerView.seek(time: time) { success in
            if success {
                print("KSPlayerView: Seek successful to \(time)")
            } else {
                print("KSPlayerView: Seek failed to \(time)")
            }
        }
    }

    func setAudioTrack(_ trackId: Int) {
        if let player = playerView.playerLayer?.player {
            let audioTracks = player.tracks(mediaType: .audio)
            print("KSPlayerView: Available audio tracks count: \(audioTracks.count)")
            print("KSPlayerView: Requested track ID: \(trackId)")

            // Debug: Print all track information
            for (index, track) in audioTracks.enumerated() {
                print("KSPlayerView: Track \(index) - ID: \(track.trackID), Name: '\(track.name)', Language: '\(track.language ?? "nil")', isEnabled: \(track.isEnabled)")
            }

            // First try to find track by trackID (proper way)
            var selectedTrack: MediaPlayerTrack? = nil
            var trackIndex: Int = -1

            // Try to find by exact trackID match
            if let track = audioTracks.first(where: { Int($0.trackID) == trackId }) {
                selectedTrack = track
                trackIndex = audioTracks.firstIndex(where: { $0.trackID == track.trackID }) ?? -1
                print("KSPlayerView: Found track by trackID \(trackId) at index \(trackIndex)")
            }
            // Fallback: treat trackId as array index
            else if trackId >= 0 && trackId < audioTracks.count {
                selectedTrack = audioTracks[trackId]
                trackIndex = trackId
                print("KSPlayerView: Found track by array index \(trackId) (fallback)")
            }

            if let track = selectedTrack {
                print("KSPlayerView: Selecting track \(trackId) (index: \(trackIndex)): '\(track.name)' (ID: \(track.trackID))")

                // Use KSPlayer's select method which properly handles track selection
                player.select(track: track)

                print("KSPlayerView: Successfully selected audio track \(trackId)")

                // Verify the selection worked
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                    let tracksAfter = player.tracks(mediaType: .audio)
                    for (index, track) in tracksAfter.enumerated() {
                        print("KSPlayerView: After selection - Track \(index) (ID: \(track.trackID)) isEnabled: \(track.isEnabled)")
                    }
                }

                // Configure audio downmixing for multi-channel tracks
                configureAudioDownmixing(for: track)
            } else if trackId == -1 {
                // Disable all audio tracks (mute)
                for track in audioTracks { track.isEnabled = false }
                print("KSPlayerView: Disabled all audio tracks")
            } else {
                print("KSPlayerView: Track \(trackId) not found. Available track IDs: \(audioTracks.map { Int($0.trackID) }), array indices: 0..\(audioTracks.count - 1)")
            }
        } else {
            print("KSPlayerView: No player available for audio track selection")
        }
    }
    
    private func configureAudioDownmixing(for track: MediaPlayerTrack) {
        // Check if this is a multi-channel audio track that needs downmixing
        // This is a simplified check - in practice, you might want to check the actual channel layout
        let trackName = track.name.lowercased()
        let isMultiChannel = trackName.contains("5.1") || trackName.contains("7.1") ||
                            trackName.contains("truehd") || trackName.contains("dts") ||
                            trackName.contains("dolby") || trackName.contains("atmos")

        if isMultiChannel {
            print("KSPlayerView: Detected multi-channel audio track '\(track.name)', ensuring proper dialogue mixing")
            print("KSPlayerView: Using FFmpeg pan filter for natural stereo downmixing")
        } else {
            print("KSPlayerView: Stereo or mono audio track '\(track.name)', no additional downmixing needed")
        }
    }

    func setTextTrack(_ trackId: Int) {
        if let player = playerView.playerLayer?.player {
            let textTracks = player.tracks(mediaType: .subtitle)
            print("KSPlayerView: Available text tracks count: \(textTracks.count)")
            print("KSPlayerView: Requested text track ID: \(trackId)")

            // First try to find track by trackID (proper way)
            var selectedTrack: MediaPlayerTrack? = nil
            var trackIndex: Int = -1

            // Try to find by exact trackID match
            if let track = textTracks.first(where: { Int($0.trackID) == trackId }) {
                selectedTrack = track
                trackIndex = textTracks.firstIndex(where: { $0.trackID == track.trackID }) ?? -1
                print("KSPlayerView: Found text track by trackID \(trackId) at index \(trackIndex)")
            }
            // Fallback: treat trackId as array index
            else if trackId >= 0 && trackId < textTracks.count {
                selectedTrack = textTracks[trackId]
                trackIndex = trackId
                print("KSPlayerView: Found text track by array index \(trackId) (fallback)")
            }

            if let track = selectedTrack {
                print("KSPlayerView: Selecting text track \(trackId) (index: \(trackIndex)): '\(track.name)' (ID: \(track.trackID))")

                // Use KSPlayer's select method which properly handles track selection
                player.select(track: track)

                print("KSPlayerView: Successfully selected text track \(trackId)")
            } else if trackId == -1 {
                // Disable all subtitles
                for track in textTracks { track.isEnabled = false }
                print("KSPlayerView: Disabled all text tracks")
            } else {
                print("KSPlayerView: Text track \(trackId) not found. Available track IDs: \(textTracks.map { Int($0.trackID) }), array indices: 0..\(textTracks.count - 1)")
            }
        } else {
            print("KSPlayerView: No player available for text track selection")
        }
    }
    
    // Get available tracks for React Native
    func getAvailableTracks() -> [String: Any] {
        guard let player = playerView.playerLayer?.player else {
            return ["audioTracks": [], "textTracks": []]
        }

        let audioTracks = player.tracks(mediaType: .audio).enumerated().map { index, track in
            return [
                "id": Int(track.trackID), // Use actual track ID, not array index
                "index": index, // Keep index for backward compatibility
                "name": track.name,
                "language": track.language ?? "Unknown",
                "languageCode": track.languageCode ?? "",
                "isEnabled": track.isEnabled,
                "bitRate": track.bitRate,
                "bitDepth": track.bitDepth
            ]
        }

        let textTracks = player.tracks(mediaType: .subtitle).enumerated().map { index, track in
            return [
                "id": Int(track.trackID), // Use actual track ID, not array index
                "index": index, // Keep index for backward compatibility
                "name": track.name,
                "language": track.language ?? "Unknown",
                "languageCode": track.languageCode ?? "",
                "isEnabled": track.isEnabled,
                "isImageSubtitle": track.isImageSubtitle
            ]
        }

        return [
            "audioTracks": audioTracks,
            "textTracks": textTracks
        ]
    }

    // Get current player state for React Native
    func getCurrentState() -> [String: Any] {
        guard let player = playerView.playerLayer?.player else {
            return [:]
        }

        return [
            "currentTime": player.currentPlaybackTime,
            "duration": player.duration,
            "buffered": player.playableTime,
            "isPlaying": !isPaused,
            "volume": currentVolume
        ]
    }
}

extension KSPlayerView: KSPlayerLayerDelegate {
    func player(layer: KSPlayerLayer, state: KSPlayerState) {
        switch state {
        case .readyToPlay:
            // Cancel timeout when ready
            loadTimeoutWorkItem?.cancel()
            // Send onLoad event to React Native with track information
            let p = layer.player
            let tracks = getAvailableTracks()
            sendEvent("onLoad", [
                "duration": p.duration,
                "currentTime": p.currentPlaybackTime,
                "naturalSize": [
                    "width": p.naturalSize.width,
                    "height": p.naturalSize.height
                ],
                "audioTracks": tracks["audioTracks"] ?? [],
                "textTracks": tracks["textTracks"] ?? []
            ])
        case .buffering:
            sendEvent("onBuffering", ["isBuffering": true])
        case .bufferFinished:
            sendEvent("onBuffering", ["isBuffering": false])
        case .playedToTheEnd:
            sendEvent("onEnd", [:])
        case .error:
            // Error will be handled by the finish delegate method
            break
        default:
            break
        }
    }

    func player(layer: KSPlayerLayer, currentTime: TimeInterval, totalTime: TimeInterval) {
        let p = layer.player
        // Ensure we have valid duration before sending progress updates
        if totalTime > 0 {
            sendEvent("onProgress", [
                "currentTime": currentTime,
                "duration": totalTime,
                "bufferTime": p.playableTime
            ])
        }
    }

    func player(layer: KSPlayerLayer, finish error: Error?) {
        if let error = error {
            sendEvent("onError", ["error": error.localizedDescription])
        }
    }

    func player(layer: KSPlayerLayer, bufferedCount: Int, consumeTime: TimeInterval) {
        // Handle buffering progress if needed
        sendEvent("onBufferingProgress", [
            "bufferedCount": bufferedCount,
            "consumeTime": consumeTime
        ])
    }
}

extension KSPlayerView {
    private func sendEvent(_ eventName: String, _ body: [String: Any]) {
        DispatchQueue.main.async {
            switch eventName {
            case "onLoad":
                self.onLoad?(body)
            case "onProgress":
                self.onProgress?(body)
            case "onBuffering":
                self.onBuffering?(body)
            case "onEnd":
                self.onEnd?([:])
            case "onError":
                self.onError?(body)
            case "onBufferingProgress":
                self.onBufferingProgress?(body)
            default:
                break
            }
        }
    }
    // Renamed to avoid clashing with React's UIView category method
    private func findHostViewController() -> UIViewController? {
        var responder: UIResponder? = self
        while let nextResponder = responder?.next {
            if let viewController = nextResponder as? UIViewController {
                return viewController
            }
            responder = nextResponder
        }
        return nil
    }
}
