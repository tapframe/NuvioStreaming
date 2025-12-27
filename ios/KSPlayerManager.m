//
//  KSPlayerManager.m
//  Nuvio
//
//  Created by KSPlayer integration
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE (KSPlayerViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(source, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(paused, BOOL)
RCT_EXPORT_VIEW_PROPERTY(volume, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(rate, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(audioTrack, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(textTrack, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(allowsExternalPlayback, BOOL)
RCT_EXPORT_VIEW_PROPERTY(usesExternalPlaybackWhileExternalScreenIsActive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(subtitleBottomOffset, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(subtitleFontSize, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(subtitleTextColor, NSString)
RCT_EXPORT_VIEW_PROPERTY(subtitleBackgroundColor, NSString)
RCT_EXPORT_VIEW_PROPERTY(resizeMode, NSString)

// Event properties
RCT_EXPORT_VIEW_PROPERTY(onLoad, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onProgress, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onBuffering, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onEnd, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onBufferingProgress, RCTDirectEventBlock)

RCT_EXTERN_METHOD(seek : (nonnull NSNumber *)node toTime : (nonnull NSNumber *)
                      time)
RCT_EXTERN_METHOD(setSource : (nonnull NSNumber *)
                      node source : (nonnull NSDictionary *)source)
RCT_EXTERN_METHOD(setPaused : (nonnull NSNumber *)node paused : (BOOL)paused)
RCT_EXTERN_METHOD(setVolume : (nonnull NSNumber *)
                      node volume : (nonnull NSNumber *)volume)
RCT_EXTERN_METHOD(setPlaybackRate : (nonnull NSNumber *)
                      node rate : (nonnull NSNumber *)rate)
RCT_EXTERN_METHOD(setAudioTrack : (nonnull NSNumber *)
                      node trackId : (nonnull NSNumber *)trackId)
RCT_EXTERN_METHOD(setTextTrack : (nonnull NSNumber *)
                      node trackId : (nonnull NSNumber *)trackId)
RCT_EXTERN_METHOD(getTracks : (nonnull NSNumber *)node resolve : (
    RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(setAllowsExternalPlayback : (nonnull NSNumber *)
                      node allows : (BOOL)allows)
RCT_EXTERN_METHOD(setUsesExternalPlaybackWhileExternalScreenIsActive : (
    nonnull NSNumber *)node uses : (BOOL)uses)
RCT_EXTERN_METHOD(getAirPlayState : (nonnull NSNumber *)node resolve : (
    RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(showAirPlayPicker : (nonnull NSNumber *)node)

@end

@interface RCT_EXTERN_MODULE (KSPlayerModule, RCTEventEmitter)

RCT_EXTERN_METHOD(getTracks : (NSNumber *)nodeTag resolve : (
    RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getAirPlayState : (NSNumber *)nodeTag resolve : (
    RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(showAirPlayPicker : (NSNumber *)nodeTag)

@end
