module.exports = {
  dependencies: {
    'react-native-vlc-media-player': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-vlc-media-player/android',
          packageImportPath: 'import io.github.react_native_vlc_media_player.ReactNativeVlcMediaPlayerPackage;',
          // Disable autolinking for Android
          disable: true,
        },
      },
    },
  },
};