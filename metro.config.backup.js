// Conditionally use Sentry config for native platforms only
let config;
try {
  const { getSentryExpoConfig } = require("@sentry/react-native/metro");
  config = getSentryExpoConfig(__dirname);
} catch (e) {
  // Fallback to default expo config for web
  const { getDefaultConfig } = require('expo/metro-config');
  config = getDefaultConfig(__dirname);
}

// Enable tree shaking and better minification
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
  minifierConfig: {
    ecma: 8,
    keep_fnames: true,
    mangle: {
      keep_fnames: true,
    },
    compress: {
      drop_console: true,
      drop_debugger: true,
      pure_funcs: ['console.log', 'console.info', 'console.debug'],
    },
  },
};

// Optimize resolver for better tree shaking and SVG support
config.resolver = {
  ...config.resolver,
  assetExts: [...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'zip'],
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  resolverMainFields: ['react-native', 'browser', 'main'],
  platforms: ['ios', 'android', 'web'],
  resolveRequest: (context, moduleName, platform) => {
    // Prevent bundling native-only modules for web
    const nativeOnlyModules = [
      '@react-native-community/blur',
      '@d11/react-native-fast-image',
      'react-native-fast-image',
      'react-native-video',
      'react-native-immersive-mode',
      'react-native-google-cast',
      '@adrianso/react-native-device-brightness',
      'react-native-image-colors',
      'react-native-boost',
      'react-native-nitro-modules',
      '@sentry/react-native',
      'expo-glass-effect',
      'react-native-mmkv',
      '@react-native-community/slider',
      '@react-native-picker/picker',
      'react-native-bottom-tabs',
      '@bottom-tabs/react-navigation',
      'posthog-react-native',
      '@backpackapp-io/react-native-toast',
    ];

    if (platform === 'web' && nativeOnlyModules.includes(moduleName)) {
      return {
        type: 'empty',
      };
    }
    // Default resolution
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;