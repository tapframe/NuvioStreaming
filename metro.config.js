// Metro configuration for Nuvio - supports iOS, Android, Web, and Windows
const fs = require('fs');
const path = require('path');

// Windows-specific paths
let rnwPath = null;
try {
  rnwPath = fs.realpathSync(
    path.resolve(require.resolve('react-native-windows/package.json'), '..'),
  );
} catch (e) {
  // react-native-windows not available on this machine
}

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
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: true,
    },
  }),
};

// Build blockList for Windows
const blockList = [];
if (rnwPath) {
  // This stops "npx @react-native-community/cli run-windows" from causing the metro server to crash if its already running
  blockList.push(
    new RegExp(`${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`)
  );
  // This prevents "npx @react-native-community/cli run-windows" from hitting: EBUSY: resource busy or locked
  blockList.push(new RegExp(`${rnwPath}/build/.*`));
  blockList.push(new RegExp(`${rnwPath}/target/.*`));
  blockList.push(/.*\.ProjectImports\.zip/);
}

// Native-only modules that should be excluded on web/windows
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

// Optimize resolver for better tree shaking and SVG support
config.resolver = {
  ...config.resolver,
  assetExts: [...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'zip'],
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  resolverMainFields: ['react-native', 'browser', 'main'],
  platforms: ['ios', 'android', 'web', 'windows'],
  blockList: blockList.length > 0 ? blockList : undefined,
  resolveRequest: (context, moduleName, platform) => {
    // Prevent bundling native-only modules for web and windows
    if ((platform === 'web' || platform === 'windows') && nativeOnlyModules.includes(moduleName)) {
      return {
        type: 'empty',
      };
    }
    // Default resolution
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
