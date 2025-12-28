/**
 * Platform detection utilities for desktop platforms
 * Supports iOS, Android, Web, Windows, and macOS
 */

import { Platform } from 'react-native';

// Platform identifiers
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';
export const isWeb = Platform.OS === 'web';
export const isWindows = Platform.OS === 'windows';
export const isMacOS = Platform.OS === 'macos';

// Platform groups
export const isMobile = isIOS || isAndroid;
export const isDesktop = isWindows || isMacOS;
export const isNative = !isWeb;

// TV detection (already exists in Platform but wrapped for consistency)
export const isTV = Platform.isTV ?? false;

// Desktop-specific features
export const supportsKeyboardShortcuts = isDesktop || isWeb;
export const supportsWindowManagement = isDesktop;
export const supportsTouchGestures = isMobile || isTV;

/**
 * Get platform-specific value
 * @example
 * const padding = selectPlatform({ ios: 16, android: 12, windows: 20, default: 16 });
 */
export function selectPlatform<T>(options: {
    ios?: T;
    android?: T;
    web?: T;
    windows?: T;
    macos?: T;
    mobile?: T;
    desktop?: T;
    default: T;
}): T {
    if (isIOS && options.ios !== undefined) return options.ios;
    if (isAndroid && options.android !== undefined) return options.android;
    if (isWeb && options.web !== undefined) return options.web;
    if (isWindows && options.windows !== undefined) return options.windows;
    if (isMacOS && options.macos !== undefined) return options.macos;
    if (isMobile && options.mobile !== undefined) return options.mobile;
    if (isDesktop && options.desktop !== undefined) return options.desktop;
    return options.default;
}

/**
 * Check if a native module is supported on the current platform
 */
export function isModuleSupported(moduleName: string): boolean {
    // Modules that are NOT supported on Windows
    const windowsUnsupported = [
        'react-native-video',
        'react-native-google-cast',
        'react-native-immersive-mode',
        '@adrianso/react-native-device-brightness',
        'react-native-boost',
        'expo-glass-effect',
    ];

    // Modules that are NOT supported on Web
    const webUnsupported = [
        ...windowsUnsupported,
        '@react-native-community/blur',
        '@d11/react-native-fast-image',
        'react-native-mmkv',
        '@react-native-community/slider',
        '@react-native-picker/picker',
        'react-native-bottom-tabs',
    ];

    if (isWindows && windowsUnsupported.includes(moduleName)) {
        return false;
    }
    if (isWeb && webUnsupported.includes(moduleName)) {
        return false;
    }

    return true;
}

export default {
    isIOS,
    isAndroid,
    isWeb,
    isWindows,
    isMacOS,
    isMobile,
    isDesktop,
    isNative,
    isTV,
    supportsKeyboardShortcuts,
    supportsWindowManagement,
    supportsTouchGestures,
    selectPlatform,
    isModuleSupported,
};
