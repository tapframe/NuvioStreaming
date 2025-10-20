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
    
    // Store constraint references for dynamic updates
    private var subtitleBottomConstraint: NSLayoutConstraint?

    // AirPlay properties (removed duplicate declarations)
    
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
    
    @objc var subtitleBottomOffset: NSNumber = 60 {
        didSet {
            print("KSPlayerView: [PROP SETTER] subtitleBottomOffset setter called with value: \(subtitleBottomOffset.floatValue)")
            updateSubtitlePositioning()
        }
    }

    @objc var subtitleFontSize: NSNumber = 16 {
        didSet {
            let size = CGFloat(truncating: subtitleFontSize)
            print("KSPlayerView: [PROP SETTER] subtitleFontSize setter called with value: \(size)")
            updateSubtitleFont(size: size)
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupPlayerView()
        setupCustomSubtitlePositioning()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupPlayerView()
        setupCustomSubtitlePositioning()
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

        // Ensure subtitle views are visible and on top
        // KSPlayer's subtitleLabel renders internal subtitles
        playerView.subtitleLabel.isHidden = false
        playerView.subtitleBackView.isHidden = false
        playerView.bringSubviewToFront(playerView.subtitleBackView)
        print("KSPlayerView: [SETUP] Subtitle views made visible")
        print("KSPlayerView: [SETUP] subtitleLabel.isHidden: \(playerView.subtitleLabel.isHidden)")
        print("KSPlayerView: [SETUP] subtitleBackView.isHidden: \(playerView.subtitleBackView.isHidden)")
        print("KSPlayerView: [SETUP] subtitleLabel.frame: \(playerView.subtitleLabel.frame)")
        print("KSPlayerView: [SETUP] subtitleBackView.frame: \(playerView.subtitleBackView.frame)")

        // Set up player delegates and callbacks
        setupPlayerCallbacks()
    }
    
    private func setupCustomSubtitlePositioning() {
        // Wait for the player view to be fully set up before modifying subtitle positioning
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.adjustSubtitlePositioning()
        }
    }
    
    private func adjustSubtitlePositioning() {
        // Remove existing constraints for subtitle positioning
        playerView.subtitleBackView.removeFromSuperview()
        playerView.addSubview(playerView.subtitleBackView)
        
        // Re-add subtitle label to subtitle back view
        playerView.subtitleBackView.addSubview(playerView.subtitleLabel)
        
        // Set up new constraints for better mobile visibility
        playerView.subtitleBackView.translatesAutoresizingMaskIntoConstraints = false
        playerView.subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        
        // Store the bottom constraint reference for dynamic updates
        subtitleBottomConstraint = playerView.subtitleBackView.bottomAnchor.constraint(equalTo: playerView.bottomAnchor, constant: -CGFloat(subtitleBottomOffset.floatValue))
        
        NSLayoutConstraint.activate([
            // Position subtitles using dynamic offset from React Native
            subtitleBottomConstraint!,
            playerView.subtitleBackView.centerXAnchor.constraint(equalTo: playerView.centerXAnchor),
            playerView.subtitleBackView.widthAnchor.constraint(lessThanOrEqualTo: playerView.widthAnchor, constant: -20),
            playerView.subtitleBackView.heightAnchor.constraint(lessThanOrEqualToConstant: 100),
            
            // Subtitle label constraints within the back view
            playerView.subtitleLabel.leadingAnchor.constraint(equalTo: playerView.subtitleBackView.leadingAnchor, constant: 10),
            playerView.subtitleLabel.trailingAnchor.constraint(equalTo: playerView.subtitleBackView.trailingAnchor, constant: -10),
            playerView.subtitleLabel.topAnchor.constraint(equalTo: playerView.subtitleBackView.topAnchor, constant: 5),
            playerView.subtitleLabel.bottomAnchor.constraint(equalTo: playerView.subtitleBackView.bottomAnchor, constant: -5),
        ])
        
        // Ensure subtitle views are initially hidden
        playerView.subtitleBackView.isHidden = true
        playerView.subtitleLabel.isHidden = true
        
        print("KSPlayerView: Custom subtitle positioning applied - positioned \(subtitleBottomOffset.floatValue)pts from bottom for mobile visibility")
    }
    
    private func updateSubtitlePositioning() {
        // Update subtitle positioning when offset changes
        print("KSPlayerView: [OFFSET UPDATE] subtitleBottomOffset changed to: \(subtitleBottomOffset.floatValue)")
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            print("KSPlayerView: [OFFSET UPDATE] Applying new positioning with offset: \(self.subtitleBottomOffset.floatValue)")
            
            // Update the existing constraint instead of recreating everything
            if let bottomConstraint = self.subtitleBottomConstraint {
                bottomConstraint.constant = -CGFloat(self.subtitleBottomOffset.floatValue)
                print("KSPlayerView: [OFFSET UPDATE] Updated constraint constant to: \(bottomConstraint.constant)")
            } else {
                // Fallback: recreate positioning if constraint reference is missing
                print("KSPlayerView: [OFFSET UPDATE] No constraint reference found, recreating positioning")
                self.adjustSubtitlePositioning()
            }
        }
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

    private func updateSubtitleFont(size: CGFloat) {
        // Update KSPlayer subtitle font size via SubtitleModel
        SubtitleModel.textFontSize = size
        // Also directly apply to current label for immediate effect
        playerView.subtitleLabel.font = SubtitleModel.textFont
        // Re-render current subtitle parts to apply font
        if let currentTime = playerView.playerLayer?.player.currentPlaybackTime {
            _ = playerView.srtControl.subtitle(currentTime: currentTime)
        }
        print("KSPlayerView: [FONT UPDATE] Applied subtitle font size: \(size)")
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

        // Create KSPlayerResource with validated URL
        let resource = KSPlayerResource(url: url, options: createOptions(with: headers), name: "Video")

        print("KSPlayerView: Setting source: \(uri)")
        print("KSPlayerView: URL scheme: \(url.scheme ?? "unknown"), host: \(url.host ?? "unknown")")
        
        playerView.set(resource: resource)
        
        // Set up delegate after setting the resource
        if let playerLayer = playerView.playerLayer {
            playerLayer.delegate = self
            print("KSPlayerView: Delegate set successfully on playerLayer")
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
        let options = KSOptions()
        // Disable native player remote control center integration; use RN controls
        options.registerRemoteControll = false
        // Reduce prebuffer to speed up start/seeks; keep a modest upper cap
        options.preferredForwardBufferDuration = 0.5
        options.maxBufferDuration = 10.0
        // Enable "second open" to relax startup/seek buffering thresholds
        options.isSecondOpen = true
        
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
        print("KSPlayerView: [SET TEXT TRACK] Starting setTextTrack with trackId: \(trackId)")
        
        // Wait slightly longer than the 1-second delay for subtitle data source connection
        // This ensures srtControl.addSubtitle(dataSouce:) has been called in VideoPlayerView
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self = self else { 
                print("KSPlayerView: [SET TEXT TRACK] self is nil, aborting")
                return 
            }
            
            print("KSPlayerView: [SET TEXT TRACK] Executing delayed track selection")
            
            if let player = self.playerView.playerLayer?.player {
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

                    // First disable all tracks to ensure only one is active
                    for t in textTracks {
                        t.isEnabled = false
                    }
                    
                    // Use KSPlayer's select method which properly handles track selection
                    player.select(track: track)
                    
                    // Sync srtControl with player track selection
                    // Find the corresponding SubtitleInfo in srtControl and select it
                    if let matchingSubtitleInfo = self.playerView.srtControl.subtitleInfos.first(where: { subtitleInfo in
                        // Try to match by name or track ID
                        subtitleInfo.name.lowercased() == track.name.lowercased() ||
                        subtitleInfo.subtitleID == String(track.trackID)
                    }) {
                        print("KSPlayerView: Found matching SubtitleInfo: \(matchingSubtitleInfo.name) (ID: \(matchingSubtitleInfo.subtitleID))")
                        self.playerView.srtControl.selectedSubtitleInfo = matchingSubtitleInfo
                        print("KSPlayerView: Set srtControl.selectedSubtitleInfo to: \(matchingSubtitleInfo.name)")
                    } else {
                        print("KSPlayerView: No matching SubtitleInfo found for track '\(track.name)' (ID: \(track.trackID))")
                        print("KSPlayerView: Available SubtitleInfos:")
                        for (index, info) in self.playerView.srtControl.subtitleInfos.enumerated() {
                            print("KSPlayerView:   [\(index)] name='\(info.name)', subtitleID='\(info.subtitleID)'")
                        }
                    }
                    
                    // Ensure subtitle views are visible after selection
                    self.playerView.subtitleLabel.isHidden = false
                    self.playerView.subtitleBackView.isHidden = false

                    // Debug: Check the enabled state of all tracks after selection
                    print("KSPlayerView: Track states after selection:")
                    for (index, t) in textTracks.enumerated() {
                        print("KSPlayerView:   Track \(index): ID=\(t.trackID), Name='\(t.name)', Enabled=\(t.isEnabled)")
                    }

                    // Verify the selection worked after a delay
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                        let tracksAfter = player.tracks(mediaType: .subtitle)
                        print("KSPlayerView: Verification after subtitle selection:")
                        for (index, track) in tracksAfter.enumerated() {
                            print("KSPlayerView:   Track \(index) (ID: \(track.trackID)) isEnabled: \(track.isEnabled)")
                        }
                        
                        // Also verify srtControl selection
                        if let selectedInfo = self.playerView.srtControl.selectedSubtitleInfo {
                            print("KSPlayerView: srtControl.selectedSubtitleInfo: \(selectedInfo.name) (ID: \(selectedInfo.subtitleID))")
                        } else {
                            print("KSPlayerView: srtControl.selectedSubtitleInfo is nil")
                        }
                    }

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
            
            // Ensure subtitle views are visible
            playerView.subtitleLabel.isHidden = false
            playerView.subtitleBackView.isHidden = false
            print("KSPlayerView: [READY TO PLAY] Verified subtitle views are visible")
            print("KSPlayerView: [READY TO PLAY] subtitleLabel.isHidden: \(playerView.subtitleLabel.isHidden)")
            print("KSPlayerView: [READY TO PLAY] subtitleBackView.isHidden: \(playerView.subtitleBackView.isHidden)")
            print("KSPlayerView: [READY TO PLAY] subtitleLabel.frame: \(playerView.subtitleLabel.frame)")
            print("KSPlayerView: [READY TO PLAY] subtitleBackView.frame: \(playerView.subtitleBackView.frame)")
            
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
                }
            } else {
                print("KSPlayerView: [READY TO PLAY] ERROR: No subtitle data source available")
            }

            // Determine player backend type
            let uriString = currentSource?["uri"] as? String
            let isMKV = uriString?.lowercased().contains(".mkv") ?? false
            let playerBackend = isMKV ? "KSMEPlayer" : "KSAVPlayer"

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
                playerView.subtitleLabel.attributedText = part.text
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

