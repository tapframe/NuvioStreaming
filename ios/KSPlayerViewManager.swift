//
//  KSPlayerViewManager.swift
//  Nuvio
//
//  Created by KSPlayer integration
//

import Foundation
import KSPlayer
import React

@objc(KSPlayerViewManager)
class KSPlayerViewManager: RCTViewManager {
    
    // Not needed for RCTViewManager-based views; events are exported via Objective-C externs in KSPlayerManager.m
    override func view() -> UIView! {
        let view = KSPlayerView()
        view.viewManager = self
        return view
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func constantsToExport() -> [AnyHashable : Any]! {
        return [
            "EventTypes": [
                "onLoad": "onLoad",
                "onProgress": "onProgress",
                "onBuffering": "onBuffering",
                "onEnd": "onEnd",
                "onError": "onError",
                "onBufferingProgress": "onBufferingProgress"
            ]
        ]
    }

    // No-op: events are sent via direct event blocks on the view

    @objc func seek(_ node: NSNumber, toTime time: NSNumber) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.seek(to: TimeInterval(truncating: time))
            }
        }
    }

    @objc func setSource(_ node: NSNumber, source: NSDictionary) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setSource(source)
            }
        }
    }

    @objc func setPaused(_ node: NSNumber, paused: Bool) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setPaused(paused)
            }
        }
    }

    @objc func setVolume(_ node: NSNumber, volume: NSNumber) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setVolume(Float(truncating: volume))
            }
        }
    }

    @objc func setPlaybackRate(_ node: NSNumber, rate: NSNumber) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setPlaybackRate(Float(truncating: rate))
            }
        }
    }

    @objc func setAudioTrack(_ node: NSNumber, trackId: NSNumber) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setAudioTrack(Int(truncating: trackId))
            }
        }
    }

    @objc func setTextTrack(_ node: NSNumber, trackId: NSNumber) {
        NSLog("[KSPlayerViewManager] setTextTrack called - node: %@, trackId: %@", node, trackId)
        DispatchQueue.main.async {
            NSLog("[KSPlayerViewManager] setTextTrack on main queue - looking for view with tag: %@", node)
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                NSLog("[KSPlayerViewManager] Found view, calling setTextTrack(%d)", Int(truncating: trackId))
                view.setTextTrack(Int(truncating: trackId))
            } else {
                NSLog("[KSPlayerViewManager] ERROR - Could not find KSPlayerView for tag: %@", node)
            }
        }
    }
    
    @objc func getTracks(_ node: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                let tracks = view.getAvailableTracks()
                resolve(tracks)
            } else {
                reject("NO_VIEW", "KSPlayerView not found", nil)
            }
        }
    }
    
    // AirPlay methods
    @objc func setAllowsExternalPlayback(_ node: NSNumber, allows: Bool) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setAllowsExternalPlayback(allows)
            }
        }
    }
    
    @objc func setUsesExternalPlaybackWhileExternalScreenIsActive(_ node: NSNumber, uses: Bool) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setUsesExternalPlaybackWhileExternalScreenIsActive(uses)
            }
        }
    }
    
    @objc func getAirPlayState(_ node: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                let airPlayState = view.getAirPlayState()
                resolve(airPlayState)
            } else {
                reject("NO_VIEW", "KSPlayerView not found", nil)
            }
        }
    }
    
    @objc func showAirPlayPicker(_ node: NSNumber) {
        print("[KSPlayerViewManager] showAirPlayPicker called for node: \(node)")
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                print("[KSPlayerViewManager] Found KSPlayerView, calling showAirPlayPicker")
                view.showAirPlayPicker()
            } else {
                print("[KSPlayerViewManager] Could not find KSPlayerView for node: \(node)")
            }
        }
    }
}