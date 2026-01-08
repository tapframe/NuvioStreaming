# Nuvio Streaming Project Documentation

This document provides a comprehensive, step-by-step guide on how to build, run, and develop the Nuvio Streaming application for both Android and iOS platforms. It covers prerequisites, initial setup, prebuilding, and native execution.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Understanding Prebuild](#understanding-prebuild)
4. [Running on Android](#running-on-android)
5. [Running on iOS](#running-on-ios)
6. [Troubleshooting](#troubleshooting)
7. [Useful Commands](#useful-commands)

---

## Prerequisites

Before you begin, ensure your development environment is correctly set up.

### General Tools
- **Node.js**: Install the Long Term Support (LTS) version (v18 or newer recommended). [Download Node.js](https://nodejs.org/)
- **Git**: For version control. [Download Git](https://git-scm.com/)
- **Watchman** (macOS users): Highly recommended for better file watching performance.
  ```bash
  brew install watchman
  ```

### Environment Configuration

**All environment variables are optional for development.**
The app is designed to run "out of the box" without a `.env` file. Features requiring API keys (like Trakt syncing) will simply be disabled or use default fallbacks.

3.  **Setup (Optional)**:
    If you wish to enable specific features, create a `.env` file:
    ```bash
    cp .env.example .env
    ```

    **Recommended Variables:**
    *   `EXPO_PUBLIC_TRAKT_CLIENT_ID` (etc): Enables Trakt integration.

### For Android Development

1. **Java Development Kit (JDK)**: Install JDK 11 or newer (JDK 17 is often recommended for modern React Native).
   - [OpenJDK](https://openjdk.org/) or [Azul Zulu](https://www.azul.com/downloads/).
   - Ensure your `JAVA_HOME` environment variable is set.
2. **Android Studio**:
   - Install [Android Studio](https://developer.android.com/studio).
   - During installation, ensure the **Android SDK**, **Android SDK Platform-Tools**, and **Android Virtual Device** are selected.
   - Set up your `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) environment variable pointing to your SDK location.

### For iOS Development (macOS only)
1. **Xcode**: Install the latest version of Xcode from the Mac App Store.
2. **Xcode Command Line Tools**:
   ```bash
  xcode-select --install
   ```
3. **CocoaPods**: Required for managing iOS dependencies.
   ```bash
   sudo gem install cocoapods
   ```
   *Note: On Apple Silicon (M1/M2/M3) Macs, you might need to use Homebrew to install Ruby or manage Cocoapods differently if you encounter issues.*

---

## Project Setup

1. **Clone the Repository**
   ```bash
   git clone https://github.com/tapframe/NuvioStreaming.git
   cd NuvioStreaming
   ```

2. **Install Dependencies**
   Install the project dependencies using `npm`.
   ```bash
   npm install
   ```
   *Note: If you encounter peer dependency conflicts, you can try `npm install --legacy-peer-deps`, but typically `npm install` should work if the `package.json` is well-maintained.*

---

## Understanding Prebuild

This project is built with **Expo**. Since it may use native modules that are not included in the standard Expo Go client (Custom Dev Client), we often need to "prebuild" the project to generate the native `android` and `ios` directories.

**What `npx expo prebuild` does:**
- It generates the native `android` and `ios` project directories based on your configuration in `app.json` / `app.config.js`.
- It applies any Config Plugins specified.
- It prepares the project to be built locally using Android Studio or Xcode tools (Gradle/Podfile).

You typically run this command before compiling the native app if you have made changes to the native configuration (e.g., icons, splash screens, permissions in `app.json`).

```bash
npx expo prebuild
```

> [!WARNING]
> **Important:** Running `npx expo prebuild --clean` will delete the `android` and `ios` directories.
> If you have manually modified files in these directories (that are not covered by Expo config plugins), they will be lost.
> **Recommendation:** Immediately after running prebuild, use `git status` to see what changed. If important files were deleted or reset, use `git checkout <path/to/file>` to revert them to your custom version.
> Example:
> ```bash
> git checkout android/build.gradle
> ```

To prebuild for a specific platform:
```bash
npx expo prebuild --platform android
npx expo prebuild --platform ios
```

---

## Running on Android

Follow these steps to build and run the app on an Android Emulator or connected physical device.

**Step 1: Start an Emulator or Connect a Device**
- **Emulator**: Open Android Studio, go to "Device Manager", and start a virtual device.
- **Physical Device**: Connect it via USB, enable **Developer Options** and **USB Debugging**. Verify connection with `adb devices`.

**Step 2: Generate Native Directories (Prebuild)**
If you haven't done so (or if you cleaned the project):
```bash
npx expo prebuild --platform android
```

**Step 3: Compile and Run**
Run the following command to build the Android app and launch it on your device/emulator:
```bash
npx expo run:android
```
*This command will start the Metro bundler in a new window/tab and begin the Gradle build process.*

**Alternative: Open in Android Studio**
If you prefer identifying build errors in the IDE:
1. Run `npx expo prebuild --platform android`.
2. Open Android Studio.
3. Select "Open an existing Android Studio Project" and choose the `android` folder inside `NuvioStreaming`.
4. Wait for Gradle sync to complete, then press the **Run** (green play) button.

---

## Running on iOS

**Note:** iOS development requires a Mac with Xcode.

**Step 1: Generate Native Directories (Prebuild)**
```bash
npx expo prebuild --platform ios
```
*This will generate the `ios` folder and automatically run `pod install` inside it.*

**Step 2: Compile and Run**
Run the following command to build the iOS app and launch it on the iOS Simulator:
```bash
npx expo run:ios
```
*To run on a specific simulator device:*
```bash
npx expo run:ios --device "iPhone 15 Pro"
```

**Step 3: Running on a Physical iOS Device**
1. You need an Apple Developer Account (a free account works for local testing, but requires re-signing every 7 days).
2. Open the project in Xcode:
   ```bash
   xcode-open ios/nuvio.xcworkspace
   ```
   *(Or simple open `ios/nuvio.xcworkspace` in Xcode manually)*.
3. In Xcode, select your project target, go to the **Signing & Capabilities** tab.
4. Select your **Team**.
5. Connect your device via USB.
6. Select your device from the build target dropdown (top bar).
7. Press **Cmd + R** to build and run.

---

## Troubleshooting

### "CocoaPods not found" or Pod install errors
If `npx expo run:ios` fails during pod installation:
```bash
cd ios
pod install
cd ..
```
If you are on an Apple Silicon Mac and have issues:
```bash
cd ios
arch -x86_64 pod install
cd ..
```

### Build Failures after changing dependencies
If you install a new library that includes native code, you must rebuild the native app.
1. Stop the Metro server.
2. Run the platform-specific run command again:
   ```bash
   npx expo run:android
   # or
   npx expo run:ios
   ```

### General Clean Up
If things are acting weird (stale cache, weird build errors), try cleaning the project:

**1. Clear Metro Cache:**
```bash
npx expo start -c
```

**2. Clean Native Directories (Drastic Measure):**
WARNING: This deletes the `android` and `ios` folders. Only do this if you can regenerate them with `prebuild`.
```bash
rm -rf android ios
npx expo prebuild
```
*Note: If you have manual changes in `android` or `ios` folders that usually shouldn't be there in a managed workflow, they will be lost. Ensure all native config is configured via Config Plugins in `app.json`.*

### "SDK location not found" (Android)
Create a `local.properties` file in the `android` directory with the path to your SDK:
```properties
# android/local.properties
sdk.dir=/Users/YOUR_USERNAME/Library/Android/sdk
```
(Replace `YOUR_USERNAME` with your actual username).

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm start` or `npx expo start` | Starts the Metro Bundler (development server). |
| `npx expo start --clear` | Starts the bundler with a clear cache. |
| `npx expo prebuild` | Generates native `android` and `ios` code. |
| `npx expo prebuild --clean` | Deletes existing native folders and regenerates them. |
| `npx expo run:android` | Builds and opens the app on Android. |
| `npx expo run:ios` | Builds and opens the app on iOS. |
| `npx expo install <package>` | Installs a library compatible with your Expo SDK version. |
