# Native Modifications Guide - SDK 54 Upgrade

**Created:** October 14, 2025
**From SDK:** 52
**To SDK:** 54

## Overview

This document records all custom native modifications made to the Nuvio app that need to be preserved during the Expo SDK 54 upgrade.

---

## iOS Modifications

### 1. KSPlayer Bridge Integration

**Purpose:** Custom video player for iOS using KSPlayer library

**Files Added/Modified:**
- `ios/KSPlayerManager.m` - Objective-C bridge header
- `ios/KSPlayerModule.swift` - Swift module for KSPlayer
- `ios/KSPlayerView.swift` - Main player view implementation
- `ios/KSPlayerViewManager.swift` - React Native view manager

**Location in Xcode Project:**
- Files are in `ios/Nuvio/` directory
- Referenced in `ios/Nuvio.xcodeproj/project.pbxproj`

**Podfile Dependencies (lines 52-56):**
```ruby
# KSPlayer dependencies
pod 'KSPlayer',:git => 'https://github.com/kingslay/KSPlayer.git', :branch => 'main', :modular_headers => true
pod 'DisplayCriteria',:git => 'https://github.com/kingslay/KSPlayer.git', :branch => 'main', :modular_headers => true
pod 'FFmpegKit',:git => 'https://github.com/kingslay/FFmpegKit.git', :branch => 'main', :modular_headers => true
pod 'Libass',:git => 'https://github.com/kingslay/FFmpegKit.git', :branch => 'main', :modular_headers => true
```

**Features:**
- Custom video player with multi-codec support
- Audio track selection
- Subtitle track selection
- Advanced playback controls
- Header injection for streaming
- Multi-channel audio downmixing

**Restoration Steps:**
1. Copy KSPlayer bridge files to `ios/` directory after prebuild
2. Add Podfile dependencies
3. Run `pod install`
4. Ensure files are linked in Xcode project

---

## Android Modifications

### 1. FFmpeg Audio Decoder Extension

**Purpose:** Enable ExoPlayer to play AC3, E-AC3, DTS, TrueHD audio codecs via FFmpeg

**Files Added:**
- `android/app/libs/lib-decoder-ffmpeg-release.aar` - FFmpeg decoder AAR from Media3

**build.gradle Modifications (line 189):**
```gradle
// Include only FFmpeg decoder AAR to avoid duplicates with Maven Media3
implementation files("libs/lib-decoder-ffmpeg-release.aar")
```

**proguard-rules.pro Additions (lines 16-18):**
```proguard
# Media3 / ExoPlayer keep (extensions and reflection)
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**
```

**Node Modules Modification:**
- File: `node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer/ReactExoplayerView.java`
- Change: Set extension renderer mode to PREFER to use FFmpeg decoders
```java
new DefaultRenderersFactory(getContext())
  .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER)
```

**Important Notes:**
- FFmpeg module provides AUDIO decoders only (AC3, E-AC3, DTS, TrueHD)
- Does NOT provide video decoders (HEVC/Dolby Vision rely on device hardware or VLC fallback)
- The AAR is from Just Player base (`exobase/app/libs`)

**Restoration Steps:**
1. Copy `lib-decoder-ffmpeg-release.aar` to `android/app/libs/`
2. Add implementation line to `android/app/build.gradle`
3. Add keep rules to `android/app/proguard-rules.pro`
4. Modify `ReactExoplayerView.java` in node_modules (after npm install)

---

## Application Logic Changes

### Player Fallback Strategy

**Modified Files:**
- `src/screens/StreamsScreen.tsx` - Removed MKV pre-forcing to VLC
- `src/components/player/AndroidVideoPlayer.tsx` - Error handler toggles `forceVlc`

**Behavior:**
- Start with ExoPlayer + FFmpeg audio decoders by default
- On decoder errors (codec not supported), automatically switch to VLC
- Do not pre-force VLC based on file extension

---

## Backup Location

All backups are stored in: `/Users/nayifnoushad/Documents/Projects/NuvioStreaming/backup_sdk54_upgrade/`

**Backup Contents:**
- `android_original/` - Complete Android directory
- `ios_original/` - Complete iOS directory (partial - Pods symlinks failed)
- `KSPlayerManager.m` - iOS bridge file
- `KSPlayerModule.swift` - iOS module file
- `KSPlayerView.swift` - iOS view file
- `KSPlayerViewManager.swift` - iOS view manager file
- `lib-decoder-ffmpeg-release.aar` - FFmpeg AAR
- `build.gradle.backup` - Android build.gradle
- `proguard-rules.pro.backup` - ProGuard rules
- `Podfile.backup` - iOS Podfile
- `package.json.backup` - Original package.json
- `ReactExoplayerView.java.backup` - Modified react-native-video file

---

## SDK 54 Upgrade Process

### Pre-Upgrade Checklist
- ✅ All native files backed up
- ✅ Custom modifications documented
- ✅ FFmpeg AAR preserved
- ✅ KSPlayer bridge files preserved
- ✅ Build configuration files backed up

### Upgrade Steps
1. Update package.json to SDK 54
2. Run `npx expo install` to update compatible packages
3. Run `npx expo prebuild --clean` to regenerate native projects
4. Restore Android FFmpeg integration
5. Restore iOS KSPlayer integration
6. Test builds on both platforms

### Post-Upgrade Verification
- [ ] Android: FFmpeg audio decoders working (test AC3/DTS stream)
- [ ] iOS: KSPlayer bridge working
- [ ] Audio track selection functional
- [ ] Subtitle track selection functional
- [ ] VLC fallback working on decoder errors
- [ ] App builds successfully for both platforms

---

## Critical Notes

1. **react-native-video modification:** This must be reapplied after every `npm install` or package update
2. **FFmpeg limitations:** Audio codecs only - video codecs require hardware decoder or VLC
3. **KSPlayer Podfile:** Uses git branches, may need version pinning for stability
4. **Xcode project:** KSPlayer files must be linked in project.pbxproj after prebuild

---

## References

- FFmpeg integration guide: `ffmpegreadme.md`
- KSPlayer repo: https://github.com/kingslay/KSPlayer
- Expo SDK 54 changelog: https://expo.dev/changelog/2025/

