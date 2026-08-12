# Apple TV validation record

Reviewed: 2026-08-11
Contributor: Francesco Frapporti

## Scope

This record covers the initial native SwiftUI Apple TV port under `tvosApp`.

## Toolchain reviewed

- XcodeGen 2.45.4
- Xcode 27.0, build 27A5228h
- AppleTVOS 27.0 SDK
- Apple Swift 6.4 compiler in Swift 5 language mode
- CoreDevice `devicectl` 642.4
- deployment target tvOS 18.0

Installed help and SDK interfaces were reviewed for XcodeGen project generation, CoreDevice listing, app installation, process launch, SwiftUI focus, navigation, search, and AVKit audio routing.

## Sources reviewed

- Apple SwiftUI focus: https://developer.apple.com/documentation/swiftui/focus
- Apple navigation stack: https://developer.apple.com/documentation/swiftui/understanding-the-navigation-stack
- Apple playback experience: https://developer.apple.com/documentation/avkit/customizing-the-tvos-playback-experience
- Apple AVRoutePickerView: https://developer.apple.com/documentation/avkit/avroutepickerview
- libmpv client API: https://mpv.io/manual/master/#client-api
- XcodeGen project specification: https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md
- Stremio addon protocol: https://stremio.github.io/stremio-addon-sdk/protocol.html
- Stremio manifest format: https://stremio.github.io/stremio-addon-sdk/api/responses/manifest.html

## Build verification

The following checks passed during development:

- XcodeGen project generation
- generic tvOS Debug build with signing disabled
- generic tvOS test build
- signed physical-device Debug build
- installation and launch on a physical Apple TV
- running-process check after launch
- 1920 by 1080 screenshot capture from the physical device
- QR account-session start and polling against the production account service
- email sign-in, session refresh, sign-out, guest mode, and account addon pull
- MPVKit GPL package integration, including libmpv, FFmpeg, VideoToolbox, MoltenVK, libplacebo, and libass

The physical-device workflow used a USB-C cable between the Mac and Apple TV. Private signing identifiers, provisioning details, device names, and device identifiers are intentionally omitted.

## Runtime verification

Verified behaviors included:

- Home catalog loading and refresh
- account library pull
- profile and collection decoding
- addon manifest loading and concurrent stream lookup
- request-header forwarding to MPV
- progress resume after the MPV file-loaded event
- local and account-backed progress persistence
- phone-first QR sign-in
- native tab navigation and search
- player transport, timeline, menus, subtitle controls, audio routing, and Now Playing commands

## Current limitations

- XCTest execution requires a compatible installed tvOS Simulator runtime. Test compilation and linking passed when runtime execution was unavailable.
- addon subtitle resource discovery remains deferred
- next-episode autoplay remains deferred
- tracking-provider scrobble synchronization remains deferred
- torrent and P2P playback remains deferred
- production release signing and distribution remain maintainer-owned work

## Reproduction

Public setup and validation commands are documented in `tvosApp/README.md`. Device installation is documented through `scripts/run-tvos.sh`, with private values supplied through environment variables.
