// Prevent expo-libvlc-player from linking on iOS (Android only)
module.exports = {
  dependencies: {
    'expo-libvlc-player': {
      platforms: {
        ios: null,
      },
    },
    'react-native-vlc-media-player': {
      platforms: {
        ios: null,
      },
    },
  },
};


