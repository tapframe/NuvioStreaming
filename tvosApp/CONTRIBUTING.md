# Contributing to the Apple TV app

Thank you for helping with the native Apple TV port. This is an initial implementation that works on physical hardware and still needs careful platform polish. Small, testable contributions are easier to review and merge.

The repository-wide [CONTRIBUTING.md](../CONTRIBUTING.md) remains authoritative. Large or directional work needs explicit maintainer approval before implementation.

## Good first contribution areas

- VoiceOver labels, reading order, and focus announcements
- Increase Contrast, Reduce Motion, and larger text behavior
- Siri Remote focus regressions with clear reproduction steps
- clipped cards, menus, or controls at supported television sizes
- tests for Stremio response decoding and account synchronization models
- subtitle discovery through Stremio subtitle resources
- next-episode autoplay with a cancellable countdown
- tracking provider synchronization after the data contract is agreed
- clear documentation corrections based on a reproduced setup issue

## Changes that need prior approval

- new providers or dependencies
- changes to account or synchronization contracts
- release signing, provisioning, or distribution changes
- major navigation or visual redesigns
- replacement of MPVKit or the player architecture
- new product behavior shared with mobile platforms

Open an issue first and wait for maintainer approval for these areas.

## Development workflow

1. Start from the current upstream default branch.
2. Create one branch for one problem.
3. Update `tvosApp/project.yml` before regenerating the Xcode project.
4. Keep every Swift source or test file at 400 lines or fewer.
5. Build with signing disabled before requesting review.
6. Test behavior on a physical Apple TV when the change affects focus, remote input, playback, audio routing, or device lifecycle.
7. Include exact commands and device class in the PR. Do not include a device name or identifier.
8. Include before and after screenshots or a short video for visible fixes.

## Physical-device setup

The documented setup uses a USB-C cable between the Mac and Apple TV. Confirm the device is awake and visible before building:

```sh
xcrun devicectl list devices
```

Run the helper with private values supplied through the environment:

```sh
TVOS_DEVICE_ID='YOUR-DEVICE-IDENTIFIER' \
TVOS_DEVELOPMENT_TEAM='YOURTEAMID' \
TVOS_BUNDLE_IDENTIFIER='com.example.nuvio.tvos' \
./scripts/run-tvos.sh
```

Never commit those values.

## Validation checklist

Run the checks relevant to the change:

```sh
xcodegen generate --spec tvosApp/project.yml

xcodebuild \
  -project tvosApp/NuvioTV.xcodeproj \
  -scheme NuvioTV \
  -configuration Debug \
  -destination 'generic/platform=tvOS' \
  CODE_SIGNING_ALLOWED=NO \
  build

xcodebuild \
  -project tvosApp/NuvioTV.xcodeproj \
  -scheme NuvioTV \
  -configuration Debug \
  -destination 'generic/platform=tvOS' \
  CODE_SIGNING_ALLOWED=NO \
  build-for-testing
```

Before committing:

```sh
git diff --check
find tvosApp/Sources tvosApp/Tests -name '*.swift' -print0 \
  | xargs -0 wc -l \
  | awk '$1 > 400 { print; failed=1 } END { exit failed }'
```

Review the final diff for:

- personal signing values
- device names and identifiers
- local file paths
- access tokens and full addon URLs
- generated user data
- unrelated mobile changes

## Copy rules

Use concise, literal interface text.

- Do not use em dashes or en dashes.
- Do not use an ampersand in titles, labels, or buttons.
- Prefer one clear primary action per surface.
- State what a feature does directly.
- Keep errors actionable and safe to share.

## Current platform gaps

The initial port intentionally leaves these areas for follow-up:

- addon subtitle resource discovery
- next-episode autoplay
- tracking-provider scrobble synchronization
- torrent and P2P playback
- broad accessibility testing across all settings
- production distribution and release automation

A focused contribution can address one gap after the data model and product direction are agreed with maintainers.
