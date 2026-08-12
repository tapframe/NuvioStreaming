# Native tvOS playback parity

Reviewed: 2026-08-11

The reference is the established Compose player under `composeApp/src/commonMain/kotlin/com/nuvio/app/features/player` plus the iOS MPV bridge implementation. This matrix records the native tvOS scope and intentional platform boundaries.

| Capability | Compose reference | Native tvOS status |
|---|---|---|
| Play, pause, seek 10 seconds | `PlayerControls.kt` | Implemented with focused buttons and remote play/pause |
| Timeline seeking | `PlayerControls.kt` | Implemented with explicit 10-second and 30-second focused buttons |
| Playback lifecycle and system controls | iOS `NowPlayingController.swift` | Implemented with tvOS Now Playing metadata, toggle, skip, and position commands |
| Loading and playback errors | `PlayerEngine.kt` | Implemented through MPV events and overlay states |
| Playback speed | `PlayerEngine.kt`, `PlayerControls.kt` | Implemented for 0.5x through 2x |
| Video resize | `PlayerResizeMode` | Implemented as Fit, Fill, and Original |
| Embedded audio tracks | `SubtitleAudioModels.kt` | Implemented from MPV `track-list` |
| Embedded subtitle tracks and Off | `SubtitleAudioModels.kt` | Implemented from MPV `track-list` |
| Source switching | `PlayerSourcesPanel.kt` | Implemented for playable sources already fetched for the title |
| Episode navigation | `PlayerEpisodesPanel.kt` | Implemented by returning to details with the selected episode active |
| Resume and progress persistence | `PlayerScreenRuntimePlaybackActions.kt` | Implemented locally, resumes from 15 seconds through 92 percent, keeps the newest 250 items |
| Source and episode metadata | `PlayerScreenArgs.kt` | Implemented in the player header and option panels |
| Network request headers | stream `behaviorHints.proxyHeaders.request` | Implemented with validation and MPV `http-header-fields` |
| Skip intro, recap, and ending | `SkipIntroRepository.kt`, Anime Skip, AniSkip | Implemented with synchronized mobile integration settings and focused in-player skip actions |
| Addon subtitle discovery | `SubtitleRepository.kt` | Deferred until the tvOS service implements the subtitle resource endpoint |
| Subtitle size and delay | `SubtitleStylePanel.kt` | Implemented with native MPV font-size controls and 100 ms delay adjustment |
| Next-episode autoplay | `PlayerNextEpisodeAutoPlay.kt` | Deferred, manual episode selection is available |
| Tracking scrobble sync | `PlayerScreenRuntimePlaybackActions.kt` | Deferred because native tvOS currently has no tracking provider repository |
| Picture in Picture | Android platform manager | Outside tvOS fullscreen television scope |
| Mobile gestures and control lock | `PlayerSurfaceGestures.kt` | Outside remote-first tvOS scope |
| External mobile players | platform launchers | Outside native Apple TV app scope |
| Torrent and P2P playback | platform P2P engines | Deferred until a tvOS-compatible engine is available |

## Focus decision

`AppShellView` marks the sidebar and content containers as separate SwiftUI `focusSection()` regions. This gives the tvOS focus engine a geometric bridge from the vertical menu to dynamic poster rails while preserving native directional propagation. Explicit `onMoveCommand` routing was rejected because a handler consumes commands even when its closure takes no action, which breaks up, down, and left behavior.

## Player UI structure

The player copies the iOS Compose capability set into the tvOS-native layout above while using tvOS-native controls instead of mobile-style sheets:

- `PlayerControlsOverlay.swift` owns the title header, focused playback timeline, transport buttons, skip action, and the lower control row.
- `PlaybackTimelineScrubber.swift` owns the remote-first focused timeline. tvOS has no standard SwiftUI `Slider` equivalent, so the timeline is a native focusable scrubber driven by Siri Remote left and right navigation.
- `PlayerControlMenus.swift` owns native SwiftUI `Menu` pickers for video size, playback speed, subtitles, audio tracks, sources, and episodes. This replaces the old desktop-style settings sheet with standard tvOS popover-style menus.
- `SubtitleAppearanceView.swift` owns the only remaining modal surface, limited to subtitle delay and text size adjustments.
- `PlayerView.swift` owns auto-hiding playback chrome. Tapping the Siri Remote touch surface reveals the controls for 5 seconds; any player interaction resets the timer. Menu and Back first hide the chrome, then leave playback on a second press. This matches Apple TV video player behavior where controls appear on demand and retreat during uninterrupted playback.

The previous `PlayerOptionsView.swift` sheet was removed because it duplicated the iOS capability list in a settings-page metaphor that felt dated on tvOS. Native menus keep the same capabilities closer to Apple TV system playback UI.

## Verification

- Apple TV system player conventions reviewed against [Apple HIG: Playing video](https://developer.apple.com/design/human-interface-guidelines/playing-video) and the installed AVKit/SwiftUI tvOS interfaces.
- Xcode 27.0 build 27A5228h and AppleTVOS 27.0 SDK reviewed.
- SwiftUI installed interface confirms `focusSection()` is available on tvOS.
- Generic tvOS Debug build with signing disabled passes after replacing the dated settings sheet with native menus, a focused Siri Remote timeline scrubber, and auto-hiding player chrome.
- Integration settings decode from the mobile profile settings blob, including Anime Skip enablement and client ID.
- AniSkip and Anime Skip segment lookup drives contextual skip actions in the native player controls.
- Signed physical Apple TV Debug build, install, launch, and running-process verification passed after the 2026 interface review. The device was connected to the Mac through USB-C. Broader hands-on Siri Remote and accessibility testing remains follow-up work.
