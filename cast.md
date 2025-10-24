nstallation

$ npm install react-native-google-cast --save

or

$ yarn add react-native-google-cast

Expo

Since Expo SDK 42, you can use this library in a custom-built Expo app. There is a config plugin included to auto-configure react-native-google-cast when the native code is generated (npx expo prebuild).

This package cannot be used in Expo Go because it requires custom native code. You need to build a standalone app instead.
Add the config plugin to the plugins array of your app.json or app.config.js/ts:

{
  "expo": {
    "plugins": ["react-native-google-cast"]
  }
}
Next, rebuild your app as described in the "Adding custom native code" guide.

Then ignore the rest of this page and continue to Setup.

iOS

Thanks to autolinking, the package and its Google Cast SDK dependency are automatically installed when you run pod install.

The latest Google Cast SDK (currently 4.8.3) requires iOS 14 or newer. However, React Native 0.76+ already requires iOS 15.1 or higher. If you need to support older iOS versions, use an older version of the library but note that some features might not be available.
Before v4.8.1, Google Cast used to publish different variants of the SDK based on whether they included Guest Mode support. That feature has been removed in the latest versions so now there's only a single SDK variant.
Android

The react-native-google-cast library is autolinked but we need to add the Google Cast SDK dependency to android/app/build.gradle:

dependencies {
  // ...
  implementation "com.google.android.gms:play-services-cast-framework:+"
}
By default, the latest version (+) of the Cast SDK is used.

To use a specific version, add castFrameworkVersion in the root android/build.gradle:

buildscript {
  ext {
    buildToolsVersion = "34.0.0"
    minSdkVersion = 22
    compileSdkVersion = 34
    targetSdkVersion = 34
    castFrameworkVersion = "22.1.0" // <-- Cast SDK version
  }
}
and update android/app/build.gradle:

dependencies {
  // ...
  implementation "com.google.android.gms:play-services-cast-framework:${safeExtGet('castFrameworkVersion', '+')}"
}

def safeExtGet(prop, fallback) {
  rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
}
etup

Expo

If you're using Expo, you can configure your build using the included plugin (see below) and then continue to Usage.

The plugin provides props for extra customization. Every time you change the props or plugins, you'll need to rebuild (and prebuild) the native app. If no extra properties are added, defaults will be used.

receiverAppId (string): custom receiver app id. Default CC1AD845 (default receiver provided by Google). Sets both iosReceiverAppId and androidReceiverAppId.
expandedController (boolean): Whether to use the default expanded controller. Default true.
androidReceiverAppId (string): custom receiver app id. Default CC1AD845.
androidPlayServicesCastFrameworkVersion (string): Version for the Android Cast SDK. Default + (latest).
iosReceiverAppId (string): custom receiver app id. Default CC1AD845.
iosDisableDiscoveryAutostart (boolean): Whether the discovery of Cast devices should not start automatically at context initialization time. Default false. if set to true, you'll need to start it later by calling DiscoveryManager.startDiscovery.
iosStartDiscoveryAfterFirstTapOnCastButton (boolean): Whether cast devices discovery start only after a user taps on the Cast button for the first time. Default true. If set to false, discovery will start as soon as the SDK is initialized. Note that this will ask the user for network permissions immediately when the app is opened for the first time.
iosSuspendSessionsWhenBackgrounded (boolean): Whether sessions should be suspended when the sender application goes into the background (and resumed when it returns to the foreground). Default true. It is appropriate to set this to false in applications that are able to maintain network connections indefinitely while in the background.
{
  "expo": {
    "plugins": [
      [
        "react-native-google-cast",
        {
          "receiverAppId": "...",
          "iosStartDiscoveryAfterFirstTapOnCastButton": false
        }
      ]
    ]
  }
}
iOS

In AppDelegate.swift (or AppDelegate.mm) add

Swift
Objective-C
// 1.1. add import at the top
import GoogleCast

class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // ...
    // 1.2. add inside application:didFinishLaunchingWithOptions
    let receiverAppID = kGCKDefaultMediaReceiverApplicationID // or "ABCD1234"
    let criteria = GCKDiscoveryCriteria(applicationID: receiverAppID)
    let options = GCKCastOptions(discoveryCriteria: criteria)
    GCKCastContext.setSharedInstanceWith(options)
    // ...
  }
  // ...
}
If using a custom web receiver, replace kGCKDefaultMediaReceiverApplicationID with your receiver app id.

You need to add local network permissions to Info.plist:

<key>NSBonjourServices</key>
<array>
  <string>_googlecast._tcp</string>
  <string>_CC1AD845._googlecast._tcp</string>
</array>
<key>NSLocalNetworkUsageDescription</key>
<string>${PRODUCT_NAME} uses the local network to discover Cast-enabled devices on your WiFi network.</string>
If using a custom receiver, make sure to replace CC1AD845 with your custom receiver app id.

You may also customize the local network usage description (See #355).

Furthermore, a dialog asking the user for the local network permission will now be displayed immediately when the app is opened.

(optional) By default, Cast device discovery is initiated when the user taps the Cast button. If it's the first time, the local network access interstitial will appear, followed by the iOS Local Network Access permissions dialog.

You may customize this behavior in AppDelegate.m by either:

setting disableDiscoveryAutostart to true:

options.disableDiscoveryAutostart = true
Note: If you disable discovery autostart, you'll need to start it later by calling startDiscovery.
or setting startDiscoveryAfterFirstTapOnCastButton to false. In this case, discovery will start as soon as the SDK is initialized.

options.startDiscoveryAfterFirstTapOnCastButton = false
Android

Add to AndroidManifest.xml (in android/app/src/main):

<application ...>
  ...
  <meta-data
    android:name="com.google.android.gms.cast.framework.OPTIONS_PROVIDER_CLASS_NAME"
    android:value="com.reactnative.googlecast.GoogleCastOptionsProvider" />
</application>
Additionally, if you're using a custom receiver, also add (replace ABCD1234 with your receiver app id):

  <meta-data
    android:name="com.reactnative.googlecast.RECEIVER_APPLICATION_ID"
    android:value="ABCD1234" />
Alternatively, you may provide your own OptionsProvider class. See GoogleCastOptionsProvider.java for inspiration.

In your MainActivity.kt or MainActivity.java, initialize CastContext by overriding the onCreate method.

Kotlin
Java
import android.os.Bundle
import androidx.annotation.Nullable
import com.reactnative.googlecast.api.RNGCCastContext

class MainActivity : ReactActivity() {
  // ...

  override fun onCreate(@Nullable savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // lazy load Google Cast context (if supported on this device)
    RNGCCastContext.getSharedInstance(this)
  }
}
This works if you're extending ReactActivity (or NavigationActivity if you're using react-native-navigation). If you're extending a different activity, make sure it is a descendant of androidx.appcompat.app.AppCompatActivity.

The Cast framework requires Google Play Services to be available on your device. If your device doesn't have them by default, you can install them either from the Play Store, from OpenGApps or follow tutorials online.

Usage

First, render Cast button which handles session and enables users to connect to Cast devices. You can then get the current connected client, and call loadMedia as needed.

import React from 'react'
import { CastButton, useRemoteMediaClient } from 'react-native-google-cast'

function MyComponent() {
  // This will automatically rerender when client is connected to a device
  // (after pressing the button that's rendered below)
  const client = useRemoteMediaClient()

  if (client) {
    // Send the media to your Cast device as soon as we connect to a device
    // (though you'll probably want to call this later once user clicks on a video or something)
    client.loadMedia({
      mediaInfo: {
        contentUrl:
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/CastVideos/mp4/BigBuckBunny.mp4',
        contentType: 'video/mp4',
      },
    })
  }

  // This will render native Cast button.
  // When a user presses it, a Cast dialog will prompt them to select a Cast device to connect to.
  return <CastButton style={{ width: 24, height: 24, tintColor: 'black' }} />
}
You can provide many different attributes, such as in this example:

client.loadMedia({
  mediaInfo: {
    contentUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/CastVideos/mp4/BigBuckBunny.mp4',
    contentType: 'video/mp4',
    metadata: {
      images: [
        {
          url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/CastVideos/images/480x270/BigBuckBunny.jpg',
        },
      ],
      title: 'Big Buck Bunny',
      subtitle:
        'A large and lovable rabbit deals with three tiny bullies, led by a flying squirrel, who are determined to squelch his happiness.',
      studio: 'Blender Foundation',
      type: 'movie',
    },
    streamDuration: 596, // seconds
  },
  startTime: 10, // seconds
})
Please see the MediaLoadRequest documentation for available options.

(Android) Handle missing Google Play Services

On Android, you can use CastContext.getPlayServicesState() to check if Google Play Services are installed on the device. You can then call CastContext.showPlayServicesErrorDialog to inform the user and prompt them to install.

CastContext.getPlayServicesState().then((state) => {
  if (state && state !== PlayServicesState.SUCCESS)
    CastContext.showPlayServicesErrorDialog(state)
})