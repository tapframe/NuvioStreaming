# Native Apple TV app

The `tvosApp` directory contains an initial native SwiftUI port for Apple TV. It is intentionally separate from the Compose mobile app because the Compose version used by this repository does not provide the tvOS UI and Foundation targets required by the app.

The port is functional and has been tested on physical hardware. It is an early contribution with room for focused polish and broader testing. Contributions to navigation, accessibility, playback, synchronization, and platform parity are welcome.

## Current scope

Implemented:

- phone-first QR sign-in, email sign-in, and guest mode
- account profiles, library, collections, addons, Home preferences, and progress synchronization
- Home, Search, Library, details, episodes, and stream selection
- native tvOS focus and navigation
- MPV playback, request headers, Now Playing controls, subtitles, audio tracks, speed, video sizing, source switching, and manual episode selection
- addon management and playback integration settings

Planned follow-up work is listed in [CONTRIBUTING.md](CONTRIBUTING.md).

## Requirements

- macOS with Xcode 27 or a compatible Xcode release that includes the tvOS 27 SDK
- XcodeGen
- an Apple Developer team for physical-device signing
- the repository submodules, including `MPVKit`
- an Apple TV connected to the Mac through a USB-C cable for the documented device workflow

Install XcodeGen with Homebrew:

```sh
brew install xcodegen
```

Clone the repository with submodules, or initialize them in an existing checkout:

```sh
git submodule update --init --recursive
```

## Generate the Xcode project

The checked-in Xcode project is generated from `tvosApp/project.yml`. Update the specification first, then regenerate:

```sh
xcodegen generate --spec tvosApp/project.yml
```

The specification uses public development defaults:

- `TVOS_BUNDLE_IDENTIFIER = com.nuvio.app.tvos.dev`
- `TVOS_TEST_BUNDLE_IDENTIFIER = com.nuvio.app.tvos.dev.tests`

Override these as Xcode build settings when signing with your own Apple Developer account. Generated project changes should match the specification change that produced them.

## Build without signing

A generic build verifies the app and package integration without requiring private signing values:

```sh
xcodegen generate --spec tvosApp/project.yml

xcodebuild \
  -project tvosApp/NuvioTV.xcodeproj \
  -scheme NuvioTV \
  -configuration Debug \
  -destination 'generic/platform=tvOS' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## Run on a physical Apple TV through USB-C

1. Connect the Apple TV to the Mac with a USB-C cable.
2. Wake the Apple TV and approve trust or developer prompts in Xcode if requested.
3. Confirm that CoreDevice can see it:

```sh
xcrun devicectl list devices
```

4. Copy the device identifier from that output.
5. Set your signing values and run the helper:

```sh
export TVOS_DEVICE_ID='YOUR-DEVICE-IDENTIFIER'
export TVOS_DEVELOPMENT_TEAM='YOURTEAMID'
export TVOS_BUNDLE_IDENTIFIER='com.example.nuvio.tvos'
./scripts/run-tvos.sh
```

The helper generates the project, builds the signed app, installs it through CoreDevice, and launches it. It does not contain a developer team, provisioning profile, device name, device identifier, or personal bundle identifier.

## Tests

Build the test bundle with:

```sh
xcodebuild \
  -project tvosApp/NuvioTV.xcodeproj \
  -scheme NuvioTV \
  -configuration Debug \
  -destination 'generic/platform=tvOS' \
  CODE_SIGNING_ALLOWED=NO \
  build-for-testing
```

Run the tests on an installed compatible tvOS simulator when one is available in Xcode.

## Architecture

- `project.yml` is the project source of truth.
- `Sources/NuvioTVApp.swift` creates the app stores and services.
- `Sources/AppShellView.swift` owns top-level tabs and routing.
- service and store files own account, catalog, addon, collection, profile, and progress behavior.
- player files own MPV, Metal output, controls, menus, Now Playing integration, and progress persistence.
- `Tests/StremioServiceTests.swift` covers protocol decoding, URL construction, focus contracts, and progress persistence.

See [PLAYER_PARITY.md](Documentation/PLAYER_PARITY.md) for the implemented playback matrix and intentional platform boundaries.

## Security and privacy

- Never commit signing teams, provisioning profile names, device names, device identifiers, or personal bundle identifiers.
- Treat provider URLs as user data. Do not add logs that expose addon tokens or full manifest URLs.
- Authentication sessions belong in Keychain-backed storage. See the contributor checklist before extending credential handling.
- Keep release signing and distribution configuration in maintainer-owned CI or Xcode settings.
