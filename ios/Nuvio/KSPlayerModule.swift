//
//  KSPlayerModule.swift
//  Nuvio
//
//  Created by KSPlayer integration
//

import Foundation
import KSPlayer
import React

@objc(KSPlayerModule)
class KSPlayerModule: RCTEventEmitter {
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    override func supportedEvents() -> [String]! {
        return [
            "KSPlayer-onLoad",
            "KSPlayer-onProgress",
            "KSPlayer-onBuffering",
            "KSPlayer-onEnd",
            "KSPlayer-onError"
        ]
    }

    @objc func getTracks(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        // This method can be expanded to get track information
        // For now, return empty tracks
        resolve([
            "audioTracks": [],
            "textTracks": []
        ])
    }
}
