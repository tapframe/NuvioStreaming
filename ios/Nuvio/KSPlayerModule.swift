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

    @objc func getTracks(_ nodeTag: NSNumber, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        DispatchQueue.main.async {
            if let viewManager = self.bridge.module(for: KSPlayerViewManager.self) as? KSPlayerViewManager {
                viewManager.getTracks(nodeTag, resolve: resolve, reject: reject)
            } else {
                reject("NO_VIEW_MANAGER", "KSPlayerViewManager not found", nil)
            }
        }
    }
}
