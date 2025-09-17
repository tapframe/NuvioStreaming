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
        // Set up the player layer delegate
        playerView.playerLayer?.delegate = self

        // Configure KSOptions (use static defaults where required)
        KSOptions.isAutoPlay = false
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

        // Create KSPlayerResource
        let url = URL(string: uri)!
        let resource = KSPlayerResource(url: url, options: createOptions(with: headers), name: "Video")

        print("KSPlayerView: Setting source: \(uri)")
        playerView.set(resource: resource)

        // Apply current state
        if isPaused {
            playerView.pause()
        } else {
            playerView.play()
        }

        setVolume(currentVolume)
    }

    private func createOptions(with headers: [String: String]) -> KSOptions {
        let options = KSOptions()
        options.hardwareDecode = KSOptions.hardwareDecode
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
        playerView.seek(time: time) { _ in }
    }

    func setAudioTrack(_ trackId: Int) {
        if let player = playerView.playerLayer?.player {
            let audioTracks = player.tracks(mediaType: .audio)
            if trackId >= 0 && trackId < audioTracks.count {
                // Enable only the selected track
                for (index, track) in audioTracks.enumerated() {
                    track.isEnabled = (index == trackId)
                }
            }
        }
    }

    func setTextTrack(_ trackId: Int) {
        if let player = playerView.playerLayer?.player {
            let textTracks = player.tracks(mediaType: .subtitle)
            if trackId >= 0 && trackId < textTracks.count {
                for (index, track) in textTracks.enumerated() {
                    track.isEnabled = (index == trackId)
                }
            } else if trackId == -1 {
                // Disable all subtitles
                for track in textTracks { track.isEnabled = false }
            }
        }
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
            // Send onLoad event to React Native
            let p = layer.player
            sendEvent("onLoad", [
                "duration": p.duration,
                "currentTime": p.currentPlaybackTime,
                "naturalSize": [
                    "width": p.naturalSize.width,
                    "height": p.naturalSize.height
                ]
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
        sendEvent("onProgress", [
            "currentTime": currentTime,
            "duration": totalTime,
            "bufferTime": p.playableTime
        ])
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
