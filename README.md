#  Nuvio Streaming App

<p align="center">
  <img src="assets/titlelogo.png" alt="Nuvio Logo" width="300"/>
</p>

<p align="center">
  A cross‑platform streaming client built with React Native and Expo, featuring Stremio addon support and Trakt synchronization.
</p>

---

## Status and Downloads
- This project is currently in Beta. Issues and PRs are welcome.
- Download: [Releases](https://github.com/tapframe/NuvioStreaming/tags)

---

## Installation

### AltStore
<img src="https://upload.wikimedia.org/wikipedia/commons/2/20/AltStore_logo.png" width="16" height="16" align="left"> [Add to AltStore](https://tinyurl.com/NuvioAltstore)

### SideStore
<img src="https://github.com/SideStore/assets/blob/main/icon.png?raw=true" width="16" height="16" align="left"> [Add to SideStore](https://tinyurl.com/NuvioSidestore)

Manual source URL: `https://raw.githubusercontent.com/tapframe/NuvioStreaming/main/nuvio-source.json`

---

## Core Capabilities

- **Streaming and Playback**
  - Built‑in React Native Video player with gesture controls
  - External player handoff for broader compatibility
  - Subtitle selection and basic quality preferences

- **Discovery and Library**
  - Search with filters and rich title/episode metadata
  - Continue watching and progress tracking
  - Cast and crew details, similar titles

- **Integrations**
  - Trakt: watch history, ratings, library sync (foreground and background)
  - Stremio addons: multiple content sources and addon management
  - TMDB: imagery and metadata; MDBList ratings support
  - Local scraper provider support

- **UX and Performance**
  - Modern UI with dynamic theming from artwork
  - Optimized image caching and list virtualization
  - iOS and Android support

---

## Screenshots

| Home | Details | Library |
|:----:|:-------:|:-------:|
| ![Home](screesnhots/Simulator%20Screenshot%20-%20iPhone%2016%20Pro%20-%202025-08-27%20at%2021.08.32-portrait.png) | ![Details](screesnhots/WhatsApp%20Image%202025-09-02%20at%2000.24.31-portrait.png) | ![Library](screesnhots/Simulator%20Screenshot%20-%20iPhone%2016%20Pro%20-%202025-08-27%20at%2021.10.14-portrait.png) |

Additional images are available in `screesnhots/`.

---

## Tech Stack
- React Native, Expo, TypeScript
- React Navigation, Reanimated/Gesture Handler
- react-native-video, MMKV/AsyncStorage, FastImage
- Tooling: Metro, EAS, GitHub Actions

---

## Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Android Studio (Android) and/or Xcode (iOS)

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/tapframe/NuvioStreaming.git
   cd NuvioStreaming
   ```
2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```
3. Start development server:
   ```bash
   npx expo start
   ```
4. Run on device/simulator:
   ```bash
   npx expo run:android
   # or
   npx expo run:ios
   ```

---

## Contributing
Contributions are welcome. Please open an issue to discuss significant changes before submitting a PR.

---

## Support and Feedback
For bugs and feature requests, open an issue: `https://github.com/tapframe/NuvioStreaming/issues`

Please include a clear description, reproduction steps, expected behavior, and screenshots if applicable.

---

## License

[![GNU GPLv3 Image](https://www.gnu.org/graphics/gplv3-127x51.png)](http://www.gnu.org/licenses/gpl-3.0.en.html)

This application is distributed under the [GNU GPLv3 or later](https://www.gnu.org/licenses/gpl.html).

---

## Legal
- No content is hosted by this repository or the Nuvio application.
- Any content accessed is hosted by third‑party websites. Users are responsible for compliance with local laws.
- For takedown requests, contact the hosting providers, not the Nuvio developers.

---

## Acknowledgments
- React Native & Expo
- TMDB
- Trakt.tv
- Stremio