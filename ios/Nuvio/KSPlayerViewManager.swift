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
    
    // Not needed for RCTViewManager-based views; events are exported via RCT_EXPORT_VIEW_PROPERTY
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

    @objc func setAudioTrack(_ node: NSNumber, trackId: NSNumber) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setAudioTrack(Int(truncating: trackId))
            }
        }
    }

    @objc func setTextTrack(_ node: NSNumber, trackId: NSNumber) {
        DispatchQueue.main.async {
            if let view = self.bridge.uiManager.view(forReactTag: node) as? KSPlayerView {
                view.setTextTrack(Int(truncating: trackId))
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
}
