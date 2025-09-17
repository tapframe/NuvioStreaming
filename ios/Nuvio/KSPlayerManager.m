//
//  KSPlayerManager.m
//  Nuvio
//
//  Created by KSPlayer integration
//

#import <React/RCTViewManager.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(KSPlayerViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(source, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(paused, BOOL)
RCT_EXPORT_VIEW_PROPERTY(volume, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(audioTrack, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(textTrack, NSNumber)

// Event properties
RCT_EXPORT_VIEW_PROPERTY(onLoad, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onProgress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onBuffering, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onEnd, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onBufferingProgress, RCTDirectEventBlock)

RCT_EXTERN_METHOD(seek:(nonnull NSNumber *)node toTime:(nonnull NSNumber *)time)
RCT_EXTERN_METHOD(setSource:(nonnull NSNumber *)node source:(nonnull NSDictionary *)source)
RCT_EXTERN_METHOD(setPaused:(nonnull NSNumber *)node paused:(BOOL)paused)
RCT_EXTERN_METHOD(setVolume:(nonnull NSNumber *)node volume:(nonnull NSNumber *)volume)
RCT_EXTERN_METHOD(setAudioTrack:(nonnull NSNumber *)node trackId:(nonnull NSNumber *)trackId)
RCT_EXTERN_METHOD(setTextTrack:(nonnull NSNumber *)node trackId:(nonnull NSNumber *)trackId)

@end

@interface RCT_EXTERN_MODULE(KSPlayerModule, RCTEventEmitter)

RCT_EXTERN_METHOD(getTracks:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)

@end
