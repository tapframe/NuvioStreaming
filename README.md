<div align="center">

  <img src="https://nuvio.tv/assets/nuvio-app-logo-wordmark.webp" alt="Nuvio" width="320" />

  <p>
    A free, open-source media app for your phone, your desktop, and the TV you already own.
    <br />
    Bring your own sources. Nuvio turns them into a library with artwork, ratings, subtitles, and your place saved on every screen.
  </p>

  [Website](https://nuvio.tv) · [GitHub releases](https://github.com/NuvioMedia/NuvioMobile/releases/latest) · [Support Nuvio](https://nuvio.tv/support)

</div>

## Get Nuvio Mobile

- [Android on Google Play](https://play.google.com/store/apps/details?id=com.nuvio.app)
- [Android APK](https://github.com/NuvioMedia/NuvioMobile/releases/latest)
- [iOS IPA](https://github.com/NuvioMedia/NuvioMobile/releases/latest) for sideloading

## Build from source

```bash
git clone https://github.com/NuvioMedia/NuvioMobile.git
cd NuvioMobile
```

### Android

Android development requires Android Studio and the Android SDK.

```bash
./gradlew :androidApp:assembleFullDebug
```

### iOS

iOS development requires macOS and Xcode.

```bash
./scripts/prepare-ios-dependencies.sh
./scripts/build-ios-ipa.sh
```

The resulting IPA in `build/ios-ipa` is unsigned so AltStore, SideStore, or another sideloader can sign it with the installing user's Apple account.

### Releases

Run the `Build Mobile Release` workflow from GitHub Actions. `dry-run` validates the version and release notes without building, while `draft` and `publish` build the full Android APKs and unsigned iOS IPA in parallel and attach them to one GitHub release. The workflow uses the existing Android release-property and keystore secrets; the IPA does not require Apple signing secrets.

Run the `Build Test IPA` workflow to compile the current branch on a macOS runner and download the unsigned IPA from the workflow artifacts. Test artifacts are retained for seven days and do not create a tag or GitHub release.

The shared app is built with Kotlin Multiplatform and Compose Multiplatform.

## License

[GNU General Public License v3.0](./LICENSE)
