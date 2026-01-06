//
//  KSPlayerView.swift
//  Nuvio
//
//  Created by KSPlayer integration
//

import Foundation
import KSPlayer
import React
import AVKit

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
    
    @objc var rate: NSNumber = 1.0 {
        didSet {
            setPlaybackRate(rate.floatValue)
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
    
    // AirPlay properties
    @objc var allowsExternalPlayback: Bool = true {
        didSet {
            setAllowsExternalPlayback(allowsExternalPlayback)
        }
    }

    @objc var usesExternalPlaybackWhileExternalScreenIsActive: Bool = true {
        didSet {
            setUsesExternalPlaybackWhileExternalScreenIsActive(usesExternalPlaybackWhileExternalScreenIsActive)
        }
    }
    
    // Subtitle customization props removed - using native KSPlayer styling
    @objc var subtitleBottomOffset: NSNumber = 60
    @objc var subtitleFontSize: NSNumber = 16
    @objc var subtitleTextColor: NSString = "#FFFFFF"
    @objc var subtitleBackgroundColor: NSString = "rgba(0,0,0,0.7)"
    
    @objc var resizeMode: NSString = "contain" {
        didSet {
            print("KSPlayerView: [PROP SETTER] resizeMode setter called with value: \(resizeMode)")
            applyVideoGravity()
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

        // Let KSPlayer handle subtitles natively - no custom positioning
        // Just set up player delegates and callbacks
        setupPlayerCallbacks()
    }
    
    private func applyVideoGravity() {
        print("KSPlayerView: [VIDEO GRAVITY] Applying resizeMode: \(resizeMode)")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            let contentMode: UIViewContentMode
            switch self.resizeMode.lowercased {
            case "cover":
                contentMode = .scaleAspectFill
            case "stretch":
                contentMode = .scaleToFill
            case "contain":
                contentMode = .scaleAspectFit
            default:
                contentMode = .scaleAspectFit
            }
            
            // Set contentMode on the player itself, not the view
            self.playerView.playerLayer?.player.contentMode = contentMode
            print("KSPlayerView: [VIDEO GRAVITY] Set player contentMode to: \(contentMode)")
        }
    }

    private func setupPlayerCallbacks() {
        // Configure KSOptions
        KSOptions.isAutoPlay = false
        KSOptions.asynchronousDecompression = true
        KSOptions.hardwareDecode = true
        
        // Set default subtitle font size - use smaller size for mobile
        SubtitleModel.textFontSize = 16.0
        SubtitleModel.textBold = false
        
        print("KSPlayerView: [PERF] Global settings: asyncDecomp=\(KSOptions.asynchronousDecompression), hwDecode=\(KSOptions.hardwareDecode)")
    }

    func setSource(_ source: NSDictionary) {
        currentSource = source

        guard let uri = source["uri"] as? String else {
            print("KSPlayerView: No URI provided")
            sendEvent("onError", ["error": "No URI provided in source"])
            return
        }

        // Validate URL before proceeding
        guard let url = URL(string: uri), url.scheme != nil else {
            print("KSPlayerView: Invalid URL format: \(uri)")
            sendEvent("onError", ["error": "Invalid URL format: \(uri)"])
            return
        }

        var headers: [String: String] = [:]
        if let headersDict = source["headers"] as? [String: String] {
            headers = headersDict
        }

        // Choose player pipeline based on format
        let isMKV = uri.lowercased().contains(".mkv")
        if isMKV {
            // Prefer MEPlayer (FFmpeg) for MKV
            KSOptions.firstPlayerType = KSMEPlayer.self
            KSOptions.secondPlayerType = nil
        } else {
            KSOptions.firstPlayerType = KSAVPlayer.self
            KSOptions.secondPlayerType = KSMEPlayer.self
        }

        // Create KSPlayerResource with validated URL
        let resource = KSPlayerResource(url: url, options: createOptions(with: headers), name: "Video")

        print("KSPlayerView: Setting source: \(uri)")
        print("KSPlayerView: URL scheme: \(url.scheme ?? "unknown"), host: \(url.host ?? "unknown")")
        
        playerView.set(resource: resource)
        
        // Set up delegate after setting the resource
        if let playerLayer = playerView.playerLayer {
            playerLayer.delegate = self
            print("KSPlayerView: Delegate set successfully on playerLayer")
            
            // Apply video gravity after player is set up
            applyVideoGravity()
        } else {
            print("KSPlayerView: ERROR - playerLayer is nil, cannot set delegate")
        }

        // Apply current state
        if isPaused {
            playerView.pause()
        } else {
            playerView.play()
        }

        setVolume(currentVolume)

        // Ensure AirPlay is properly configured after setting source
        DispatchQueue.main.async {
            self.setAllowsExternalPlayback(self.allowsExternalPlayback)
            self.setUsesExternalPlaybackWhileExternalScreenIsActive(self.usesExternalPlaybackWhileExternalScreenIsActive)
        }
    }

    private func createOptions(with headers: [String: String]) -> KSOptions {
        // Use custom HighPerformanceOptions subclass for frame buffer optimization
        let options = HighPerformanceOptions()
        // Disable native player remote control center integration; use RN controls
        options.registerRemoteControll = false
        
        // PERFORMANCE OPTIMIZATION: Buffer durations for smooth high bitrate playback
        // preferredForwardBufferDuration = 5.0s: Increased to prevent stalling on network hiccups
        options.preferredForwardBufferDuration = 5.0
        // maxBufferDuration = 300.0s: Increased to allow 5 minutes of cache ahead
        options.maxBufferDuration = 300.0
        
        // Enable "second open" to relax startup/seek buffering thresholds (already enabled)
        options.isSecondOpen = true
        
        // PERFORMANCE OPTIMIZATION: Fast stream analysis for high bitrate content
        // Reduces startup latency significantly for large high-bitrate streams
        options.probesize = 50_000_000  // 50MB for faster format detection
        options.maxAnalyzeDuration = 5_000_000  // 5 seconds in microseconds for faster stream structure analysis
        
        // PERFORMANCE OPTIMIZATION: Decoder thread optimization
        // Use all available CPU cores for parallel decoding
        options.decoderOptions["threads"] = "0"  // Use all CPU cores instead of "auto"
        // refcounted_frames already set to "1" in KSOptions init for memory efficiency
        
        // PERFORMANCE OPTIMIZATION: Hardware decode explicitly enabled
        // Ensure VideoToolbox hardware acceleration is always preferred for non-simulator
        // Hardware decode and async decompression
        options.hardwareDecode = true
        options.asynchronousDecompression = true
        
        // HDR handling: Let KSPlayer automatically detect content's native dynamic range
        // Setting destinationDynamicRange to nil allows KSPlayer to use the content's actual HDR/SDR mode
        // This prevents forcing HDR tone mapping on SDR content (which causes oversaturation)
        // KSPlayer will automatically detect HDR10/Dolby Vision/HLG from the video format description
        options.destinationDynamicRange = nil
        
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
        
        if !headers.isEmpty {
            // Clean and validate headers before adding
            var cleanHeaders: [String: String] = [:]
            for (key, value) in headers {
                // Remove any null or empty values
                if !value.isEmpty && value != "null" {
                    cleanHeaders[key] = value
                }
            }
            
            if !cleanHeaders.isEmpty {
                options.appendHeader(cleanHeaders)
                print("KSPlayerView: Added headers: \(cleanHeaders.keys.joined(separator: ", "))")
                
                if let referer = cleanHeaders["Referer"] ?? cleanHeaders["referer"] {
                    options.referer = referer
                    print("KSPlayerView: Set referer: \(referer)")
                }
            }
        }
        
        print("KSPlayerView: [PERF] High-performance options configured: asyncDecomp=\(options.asynchronousDecompression), hwDecode=\(options.hardwareDecode), buffer=\(options.preferredForwardBufferDuration)s/\(options.maxBufferDuration)s, HDR=\(options.destinationDynamicRange?.description ?? "auto")")
        
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

    func setPlaybackRate(_ rate: Float) {
        playerView.playerLayer?.player.playbackRate = rate
        print("KSPlayerView: Set playback rate to \(rate)x")
    }

    func seek(to time: TimeInterval) {
        guard let playerLayer = playerView.playerLayer,
              playerLayer.player.isReadyToPlay,
              playerLayer.player.seekable else {
            print("KSPlayerView: Cannot seek - player not ready or not seekable")
            return
        }
        
        // Capture the current paused state before seeking
        let wasPaused = isPaused
        print("KSPlayerView: Seeking to \(time), paused state before seek: \(wasPaused)")
        
        playerView.seek(time: time) { [weak self] success in
            guard let self = self else { return }
            
            if success {
                print("KSPlayerView: Seek successful to \(time)")
                
                // Restore the paused state after seeking
                // KSPlayer's seek may resume playback, so we need to re-apply the paused state
                if wasPaused {
                    DispatchQueue.main.async {
                        self.playerView.pause()
                        print("KSPlayerView: Restored paused state after seek")
                    }
                }
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
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
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
        NSLog("KSPlayerView: [SET TEXT TRACK] Starting setTextTrack with trackId: %d", trackId)
        
        // Small delay to ensure player is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            guard let self = self else { 
                NSLog("KSPlayerView: [SET TEXT TRACK] self is nil, aborting")
                return 
            }
            
            NSLog("KSPlayerView: [SET TEXT TRACK] Executing track selection")
            
            if let player = self.playerView.playerLayer?.player {
                let textTracks = player.tracks(mediaType: .subtitle)
                NSLog("KSPlayerView: Available text tracks count: %d", textTracks.count)
                NSLog("KSPlayerView: Requested text track ID: %d", trackId)

                // First try to find track by trackID (proper way)
                var selectedTrack: MediaPlayerTrack? = nil
                var trackIndex: Int = -1

                // Try to find by exact trackID match
                if let track = textTracks.first(where: { Int($0.trackID) == trackId }) {
                    selectedTrack = track
                    trackIndex = textTracks.firstIndex(where: { $0.trackID == track.trackID }) ?? -1
                    NSLog("KSPlayerView: Found text track by trackID %d at index %d", trackId, trackIndex)
                }
                // Fallback: treat trackId as array index
                else if trackId >= 0 && trackId < textTracks.count {
                    selectedTrack = textTracks[trackId]
                    trackIndex = trackId
                    NSLog("KSPlayerView: Found text track by array index %d (fallback)", trackId)
                }

                if let track = selectedTrack {
                    NSLog("KSPlayerView: Selecting text track %d (index: %d): '%@' (ID: %d)", trackId, trackIndex, track.name, track.trackID)

                    // Disable all tracks first
                    for t in textTracks {
                        t.isEnabled = false
                    }
                    
                    // Enable the selected track
                    track.isEnabled = true
                    
                    // Use KSPlayer's select method to update player state
                    player.select(track: track)
                    
                    // CRITICAL: Cast MediaPlayerTrack to SubtitleInfo and set on srtControl
                    // FFmpegAssetTrack conforms to SubtitleInfo via extension
                    if let subtitleInfo = track as? SubtitleInfo {
                        self.playerView.srtControl.selectedSubtitleInfo = subtitleInfo
                        NSLog("KSPlayerView: Set srtControl.selectedSubtitleInfo to track '%@'", track.name)
                    } else {
                        NSLog("KSPlayerView: Warning - track could not be cast to SubtitleInfo")
                    }
                    
                    // Ensure subtitle views are visible
                    self.playerView.subtitleLabel.isHidden = false
                    self.playerView.subtitleBackView.isHidden = false

                    NSLog("KSPlayerView: Successfully selected and enabled text track %d", trackId)
                } else if trackId == -1 {
                    // Disable all subtitles
                    for track in textTracks { 
                        track.isEnabled = false 
                    }
                    self.playerView.srtControl.selectedSubtitleInfo = nil
                    self.playerView.subtitleLabel.isHidden = true
                    self.playerView.subtitleBackView.isHidden = true
                    NSLog("KSPlayerView: Disabled all text tracks")
                } else {
                    NSLog("KSPlayerView: Text track %d not found. Available count: %d", trackId, textTracks.count)
                }
            } else {
                NSLog("KSPlayerView: No player available for text track selection")
            }
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
            // Create a better display name for subtitles
            var displayName = track.name
            if displayName.isEmpty || displayName == "Unknown" {
                if let language = track.language, !language.isEmpty && language != "Unknown" {
                    displayName = language
                } else if let languageCode = track.languageCode, !languageCode.isEmpty {
                    displayName = languageCode.uppercased()
                } else {
                    displayName = "Subtitle \(index + 1)"
                }
            }
            
            // Add language info if not already in the name
            if let language = track.language, !language.isEmpty && language != "Unknown" && !displayName.lowercased().contains(language.lowercased()) {
                displayName += " (\(language))"
            }
            
            return [
                "id": Int(track.trackID), // Use actual track ID, not array index
                "index": index, // Keep index for backward compatibility
                "name": displayName,
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

    // AirPlay methods
    func setAllowsExternalPlayback(_ allows: Bool) {
        print("[KSPlayerView] Setting allowsExternalPlayback: \(allows)")
        playerView.playerLayer?.player.allowsExternalPlayback = allows
    }

    func setUsesExternalPlaybackWhileExternalScreenIsActive(_ uses: Bool) {
        print("[KSPlayerView] Setting usesExternalPlaybackWhileExternalScreenIsActive: \(uses)")
        playerView.playerLayer?.player.usesExternalPlaybackWhileExternalScreenIsActive = uses
    }

    func showAirPlayPicker() {
        print("[KSPlayerView] showAirPlayPicker called")

        DispatchQueue.main.async {
            // Create a temporary route picker view for triggering AirPlay
            let routePickerView = AVRoutePickerView()
            routePickerView.tintColor = .white
            routePickerView.alpha = 0.01 // Nearly invisible but still interactive

            // Find the current view controller
            guard let viewController = self.findHostViewController() else {
                print("[KSPlayerView] Could not find view controller for AirPlay picker")
                return
            }

            // Add to the view controller's view temporarily
            viewController.view.addSubview(routePickerView)

            // Position it off-screen but still in the view hierarchy
            routePickerView.frame = CGRect(x: -100, y: -100, width: 44, height: 44)

            // Force layout
            viewController.view.setNeedsLayout()
            viewController.view.layoutIfNeeded()

            // Wait a bit for the view to be ready, then trigger
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                // Find and trigger the AirPlay button
                self.triggerAirPlayButton(routePickerView)

                // Clean up after a delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    routePickerView.removeFromSuperview()
                    print("[KSPlayerView] Cleaned up temporary AirPlay picker")
                }
            }
        }
    }

    private func triggerAirPlayButton(_ routePickerView: AVRoutePickerView) {
        // Recursively find the button in the route picker view
        func findButton(in view: UIView) -> UIButton? {
            if let button = view as? UIButton {
                return button
            }
            for subview in view.subviews {
                if let button = findButton(in: subview) {
                    return button
                }
            }
            return nil
        }

        if let button = findButton(in: routePickerView) {
            print("[KSPlayerView] Found AirPlay button, triggering tap")
            button.sendActions(for: .touchUpInside)
        } else {
            print("[KSPlayerView] Could not find AirPlay button in route picker")
        }
    }
    
    func getAirPlayState() -> [String: Any] {
        guard let player = playerView.playerLayer?.player else {
            return [
                "allowsExternalPlayback": false,
                "usesExternalPlaybackWhileExternalScreenIsActive": false,
                "isExternalPlaybackActive": false
            ]
        }
        
        return [
            "allowsExternalPlayback": player.allowsExternalPlayback,
            "usesExternalPlaybackWhileExternalScreenIsActive": player.usesExternalPlaybackWhileExternalScreenIsActive,
            "isExternalPlaybackActive": player.isExternalPlaybackActive
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
    
    // MARK: - Performance Optimization Helpers
}

// MARK: - High Performance KSOptions Subclass

/// Custom KSOptions subclass that overrides frame buffer capacity for high bitrate content
/// More buffered frames absorb decode spikes and network hiccups without quality loss
private class HighPerformanceOptions: KSOptions {
    /// Override to increase frame buffer capacity for high bitrate content
    /// - Parameters:
    ///   - fps: Video frame rate
    ///   - naturalSize: Video resolution
    ///   - isLive: Whether this is a live stream
    /// - Returns: Number of frames to buffer
    override func videoFrameMaxCount(fps: Float, naturalSize: CGSize, isLive: Bool) -> UInt8 {
        if isLive {
            // Increased from 4 to 8 for better live stream stability
            return 8
        }
        
        // For high bitrate VOD: increase buffer based on resolution
        if naturalSize.width >= 3840 || naturalSize.height >= 2160 {
            // 4K needs more buffer frames to handle decode spikes
            return 32
        } else if naturalSize.width >= 1920 || naturalSize.height >= 1080 {
            // 1080p benefits from more frames
            return 24
        }
        
        // Default for lower resolutions
        return 16
    }
}

extension KSPlayerView: KSPlayerLayerDelegate {
    func player(layer: KSPlayerLayer, state: KSPlayerState) {
        switch state {
        case .readyToPlay:
            // Ensure AirPlay is properly configured when player is ready
            layer.player.allowsExternalPlayback = allowsExternalPlayback
            layer.player.usesExternalPlaybackWhileExternalScreenIsActive = usesExternalPlaybackWhileExternalScreenIsActive

            // Debug: Check subtitle data source connection
            let hasSubtitleDataSource = layer.player.subtitleDataSouce != nil
            print("KSPlayerView: [READY TO PLAY] subtitle data source available: \(hasSubtitleDataSource)")
            
            // Keep subtitle views hidden until actual content is displayed
            // They will be shown in the subtitle rendering callback when there's text to display
            playerView.subtitleLabel.isHidden = true
            playerView.subtitleBackView.isHidden = true
            print("KSPlayerView: [READY TO PLAY] Subtitle views kept hidden until content available")
            
            // Manually connect subtitle data source to srtControl (this is the missing piece!)
            if let subtitleDataSouce = layer.player.subtitleDataSouce {
                print("KSPlayerView: [READY TO PLAY] Connecting subtitle data source to srtControl")
                print("KSPlayerView: [READY TO PLAY] subtitleDataSouce type: \(type(of: subtitleDataSouce))")

                // Check if subtitle data source has any subtitle infos
                print("KSPlayerView: [READY TO PLAY] subtitleDataSouce has \(subtitleDataSouce.infos.count) subtitle infos")

                for (index, info) in subtitleDataSouce.infos.enumerated() {
                    print("KSPlayerView: [READY TO PLAY] subtitleDataSouce info[\(index)]: ID=\(info.subtitleID), Name='\(info.name)', Enabled=\(info.isEnabled)")
                }
                // Wait 1 second like the original KSPlayer code does
                DispatchQueue.main.asyncAfter(deadline: DispatchTime.now() + 1) { [weak self] in
                    guard let self = self else { return }
                    print("KSPlayerView: [READY TO PLAY] About to add subtitle data source to srtControl")
                    self.playerView.srtControl.addSubtitle(dataSouce: subtitleDataSouce)
                    print("KSPlayerView: [READY TO PLAY] Subtitle data source connected to srtControl")
                    print("KSPlayerView: [READY TO PLAY] srtControl.subtitleInfos.count: \(self.playerView.srtControl.subtitleInfos.count)")

                    // Log all subtitle infos
                    for (index, info) in self.playerView.srtControl.subtitleInfos.enumerated() {
                        print("KSPlayerView: [READY TO PLAY] SubtitleInfo[\(index)]: name=\(info.name), isEnabled=\(info.isEnabled), subtitleID=\(info.subtitleID)")
                    }
                    
                    // Try to manually trigger subtitle parsing for the current time
                    let currentTime = self.playerView.playerLayer?.player.currentPlaybackTime ?? 0
                    print("KSPlayerView: [READY TO PLAY] Current playback time: \(currentTime)")
                    
                    // Force subtitle search for current time
                    let hasSubtitle = self.playerView.srtControl.subtitle(currentTime: currentTime)
                    print("KSPlayerView: [READY TO PLAY] Manual subtitle search result: \(hasSubtitle)")
                    print("KSPlayerView: [READY TO PLAY] Parts count after manual search: \(self.playerView.srtControl.parts.count)")
                    
                    if let firstPart = self.playerView.srtControl.parts.first {
                        print("KSPlayerView: [READY TO PLAY] Found subtitle part: start=\(firstPart.start), end=\(firstPart.end), text='\(firstPart.text?.string ?? "nil")'")
                    }
                    
                    // Only auto-select first enabled subtitle if textTrack prop is NOT set to -1 (disabled)
                    // If React Native explicitly set textTrack=-1, user wants subtitles off
                    if self.textTrack.intValue != -1 {
                        // Auto-select first enabled subtitle if none selected
                        if self.playerView.srtControl.selectedSubtitleInfo == nil {
                            self.playerView.srtControl.selectedSubtitleInfo = self.playerView.srtControl.subtitleInfos.first { $0.isEnabled }
                            if let selected = self.playerView.srtControl.selectedSubtitleInfo {
                                print("KSPlayerView: [READY TO PLAY] Auto-selected subtitle: \(selected.name)")
                            } else {
                                print("KSPlayerView: [READY TO PLAY] No enabled subtitle found for auto-selection")
                            }
                        } else {
                            print("KSPlayerView: [READY TO PLAY] Subtitle already selected: \(self.playerView.srtControl.selectedSubtitleInfo?.name ?? "unknown")")
                        }
                    } else {
                        print("KSPlayerView: [READY TO PLAY] textTrack=-1 (disabled), skipping auto-selection")
                        // Ensure subtitles are disabled
                        self.playerView.srtControl.selectedSubtitleInfo = nil
                        self.playerView.subtitleLabel.isHidden = true
                        self.playerView.subtitleBackView.isHidden = true
                    }
                }
            } else {
                print("KSPlayerView: [READY TO PLAY] ERROR: No subtitle data source available")
            }

            // Determine player backend type from actual player instance
            let playerBackend: String
            if let _ = layer.player as? KSMEPlayer {
                playerBackend = "KSMEPlayer"
            } else {
                playerBackend = "KSAVPlayer"
            }

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
                "textTracks": tracks["textTracks"] ?? [],
                "playerBackend": playerBackend
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
        // Debug: Confirm delegate method is being called
        if currentTime.truncatingRemainder(dividingBy: 10.0) < 0.1 {
            print("KSPlayerView: [DELEGATE CALLED] time=\(currentTime), total=\(totalTime)")
        }
        
        // Manually implement subtitle rendering logic from VideoPlayerView
        // This is the critical missing piece that was preventing subtitle rendering
        
        // Debug: Check srtControl state
        let subtitleInfoCount = playerView.srtControl.subtitleInfos.count
        let selectedSubtitle = playerView.srtControl.selectedSubtitleInfo
        
        // Always log subtitle state every 10 seconds to see when it gets populated
        if currentTime.truncatingRemainder(dividingBy: 10.0) < 0.1 {
            print("KSPlayerView: [SUBTITLE DEBUG] time=\(currentTime.truncatingRemainder(dividingBy: 10.0)), subtitleInfos=\(subtitleInfoCount), selected=\(selectedSubtitle?.name ?? "none")")
            
            // Also check if player has subtitle data source
            let player = layer.player
            let hasSubtitleDataSource = player.subtitleDataSouce != nil
            print("KSPlayerView: [SUBTITLE DEBUG] player has subtitle data source: \(hasSubtitleDataSource)")
            
            // Log subtitle view states
            print("KSPlayerView: [SUBTITLE DEBUG] subtitleLabel.isHidden: \(playerView.subtitleLabel.isHidden)")
            print("KSPlayerView: [SUBTITLE DEBUG] subtitleBackView.isHidden: \(playerView.subtitleBackView.isHidden)")
            print("KSPlayerView: [SUBTITLE DEBUG] subtitleLabel.text: '\(playerView.subtitleLabel.text ?? "nil")'")
            print("KSPlayerView: [SUBTITLE DEBUG] subtitleLabel.attributedText: \(playerView.subtitleLabel.attributedText != nil ? "exists" : "nil")")
            print("KSPlayerView: [SUBTITLE DEBUG] subtitleBackView.image: \(playerView.subtitleBackView.image != nil ? "exists" : "nil")")
            
            // Log all subtitle infos
            for (index, info) in playerView.srtControl.subtitleInfos.enumerated() {
                print("KSPlayerView: [SUBTITLE DEBUG] SubtitleInfo[\(index)]: name=\(info.name), isEnabled=\(info.isEnabled)")
            }
        }
        
        let hasSubtitleParts = playerView.srtControl.subtitle(currentTime: currentTime)
        
        // Debug: Check subtitle timing every 10 seconds
        if currentTime.truncatingRemainder(dividingBy: 10.0) < 0.1 && subtitleInfoCount > 0 {
            print("KSPlayerView: [SUBTITLE TIMING] time=\(currentTime), hasParts=\(hasSubtitleParts), partsCount=\(playerView.srtControl.parts.count)")
            if let firstPart = playerView.srtControl.parts.first {
                print("KSPlayerView: [SUBTITLE TIMING] firstPart start=\(firstPart.start), end=\(firstPart.end)")
                print("KSPlayerView: [SUBTITLE TIMING] firstPart text='\(firstPart.text?.string ?? "nil")'")
                print("KSPlayerView: [SUBTITLE TIMING] firstPart hasImage=\(firstPart.image != nil)")
            } else {
                print("KSPlayerView: [SUBTITLE TIMING] No parts available")
            }
        }
        
        if hasSubtitleParts {
            if let part = playerView.srtControl.parts.first {
                print("KSPlayerView: [SUBTITLE RENDER] time=\(currentTime), text='\(part.text?.string ?? "nil")', hasImage=\(part.image != nil)")
                playerView.subtitleBackView.image = part.image
                
                // Normalize font size for all subtitles to ensure consistent display
                if let originalText = part.text {
                    let mutableText = NSMutableAttributedString(attributedString: originalText)
                    // Apply consistent font across the entire text
                    let font = UIFont.systemFont(ofSize: 20.0)
                    mutableText.addAttributes([.font: font], range: NSRange(location: 0, length: mutableText.length))
                    playerView.subtitleLabel.attributedText = mutableText
                } else {
                    playerView.subtitleLabel.attributedText = nil
                }
                
                playerView.subtitleBackView.isHidden = false
                playerView.subtitleLabel.isHidden = false
                print("KSPlayerView: [SUBTITLE RENDER] Set subtitle text and made views visible")
                print("KSPlayerView: [SUBTITLE RENDER] subtitleLabel.isHidden after: \(playerView.subtitleLabel.isHidden)")
                print("KSPlayerView: [SUBTITLE RENDER] subtitleBackView.isHidden after: \(playerView.subtitleBackView.isHidden)")
            } else {
                print("KSPlayerView: [SUBTITLE RENDER] hasParts=true but no parts available - hiding views")
                playerView.subtitleBackView.image = nil
                playerView.subtitleLabel.attributedText = nil
                playerView.subtitleBackView.isHidden = true
                playerView.subtitleLabel.isHidden = true
            }
        } else {
            // Only log this occasionally to avoid spam
            if currentTime.truncatingRemainder(dividingBy: 30.0) < 0.1 {
                print("KSPlayerView: [SUBTITLE RENDER] time=\(currentTime), hasParts=false - no subtitle at this time")
            }
        }
        
        let p = layer.player
        // Ensure we have valid duration before sending progress updates
        if totalTime > 0 {
            sendEvent("onProgress", [
                "currentTime": currentTime,
                "duration": totalTime,
                "bufferTime": p.playableTime,
                "airPlayState": getAirPlayState()
            ])
        }
    }

    func player(layer: KSPlayerLayer, finish error: Error?) {
        if let error = error {
            let errorMessage = error.localizedDescription
            print("KSPlayerView: Player finished with error: \(errorMessage)")
            
            // Provide more specific error messages for common issues
            var detailedError = errorMessage
            if errorMessage.contains("avformat can't open input") {
                detailedError = "Unable to open video stream. This could be due to:\n• Invalid or malformed URL\n• Network connectivity issues\n• Server blocking the request\n• Unsupported video format\n• Missing required headers"
            } else if errorMessage.contains("timeout") {
                detailedError = "Stream connection timed out. The server may be slow or unreachable."
            } else if errorMessage.contains("404") || errorMessage.contains("Not Found") {
                detailedError = "Video stream not found. The URL may be expired or incorrect."
            } else if errorMessage.contains("403") || errorMessage.contains("Forbidden") {
                detailedError = "Access denied. The server may be blocking requests or require authentication."
            }
            
            sendEvent("onError", ["error": detailedError])
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

