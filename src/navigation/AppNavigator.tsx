import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme as NavigationDefaultTheme, DarkTheme as NavigationDarkTheme, Theme, NavigationProp } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationOptions, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useColorScheme, Platform, Animated, StatusBar, TouchableOpacity, View, Text, AppState } from 'react-native';
import { PaperProvider, MD3DarkTheme, MD3LightTheme, adaptNavigationTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors } from '../styles/colors';
import { NuvioHeader } from '../components/NuvioHeader';
import { Stream } from '../types/streams';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';

// Import screens with their proper types
import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MetadataScreen from '../screens/MetadataScreen';
import VideoPlayer from '../components/player/VideoPlayer';
import CatalogScreen from '../screens/CatalogScreen';
import AddonsScreen from '../screens/AddonsScreen';
import SearchScreen from '../screens/SearchScreen';
import ShowRatingsScreen from '../screens/ShowRatingsScreen';
import CatalogSettingsScreen from '../screens/CatalogSettingsScreen';
import StreamsScreen from '../screens/StreamsScreen';
import CalendarScreen from '../screens/CalendarScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import MDBListSettingsScreen from '../screens/MDBListSettingsScreen';
import TMDBSettingsScreen from '../screens/TMDBSettingsScreen';
import HomeScreenSettings from '../screens/HomeScreenSettings';
import HeroCatalogsScreen from '../screens/HeroCatalogsScreen';
import TraktSettingsScreen from '../screens/TraktSettingsScreen';
import PlayerSettingsScreen from '../screens/PlayerSettingsScreen';
import LogoSourceSettings from '../screens/LogoSourceSettings';
import ThemeScreen from '../screens/ThemeScreen';
import ProfilesScreen from '../screens/ProfilesScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

// Stack navigator types
export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: undefined;
  Home: undefined;
  Discover: undefined;
  Library: undefined;
  Settings: undefined;
  Search: undefined;
  Calendar: undefined;
  Metadata: { 
    id: string; 
    type: string;
    episodeId?: string;
    addonId?: string;
  };
  Streams: { 
    id: string; 
    type: string;
    episodeId?: string;
  };
  VideoPlayer: { 
    id: string; 
    type: string; 
    stream: Stream;
    episodeId?: string;
  };
  Player: { 
    uri: string; 
    title?: string; 
    season?: number; 
    episode?: number; 
    episodeTitle?: string; 
    quality?: string; 
    year?: number; 
    streamProvider?: string;
    streamName?: string;
    id?: string;
    type?: string;
    episodeId?: string;
    imdbId?: string;
    availableStreams?: { [providerId: string]: { streams: any[]; addonName: string } };
  };
  Catalog: { id: string; type: string; addonId?: string; name?: string; genreFilter?: string };
  Credits: { mediaId: string; mediaType: string };
  ShowRatings: { showId: number };
  Account: undefined;
  Payment: undefined;
  PrivacyPolicy: undefined;
  About: undefined;
  Addons: undefined;
  CatalogSettings: undefined;
  NotificationSettings: undefined;
  MDBListSettings: undefined;
  TMDBSettings: undefined;
  HomeScreenSettings: undefined;
  HeroCatalogs: undefined;
  TraktSettings: undefined;
  PlayerSettings: undefined;
  LogoSourceSettings: undefined;
  ThemeSettings: undefined;
  ProfilesSettings: undefined;
};

export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Tab navigator types
export type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Library: undefined;
  Settings: undefined;
};

// Custom fonts that satisfy both theme types
const fonts = {
  regular: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
  },
  medium: {
    fontFamily: 'sans-serif-medium',
    fontWeight: '500' as const,
  },
  bold: {
    fontFamily: 'sans-serif',
    fontWeight: '700' as const,
  },
  heavy: {
    fontFamily: 'sans-serif',
    fontWeight: '900' as const,
  },
  // MD3 specific fonts
  displayLarge: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 64,
    fontSize: 57,
  },
  displayMedium: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 52,
    fontSize: 45,
  },
  displaySmall: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 44,
    fontSize: 36,
  },
  headlineLarge: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 40,
    fontSize: 32,
  },
  headlineMedium: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 36,
    fontSize: 28,
  },
  headlineSmall: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 32,
    fontSize: 24,
  },
  titleLarge: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0,
    lineHeight: 28,
    fontSize: 22,
  },
  titleMedium: {
    fontFamily: 'sans-serif-medium',
    fontWeight: '500' as const,
    letterSpacing: 0.15,
    lineHeight: 24,
    fontSize: 16,
  },
  titleSmall: {
    fontFamily: 'sans-serif-medium',
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    lineHeight: 20,
    fontSize: 14,
  },
  labelLarge: {
    fontFamily: 'sans-serif-medium',
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    lineHeight: 20,
    fontSize: 14,
  },
  labelMedium: {
    fontFamily: 'sans-serif-medium',
    fontWeight: '500' as const,
    letterSpacing: 0.5,
    lineHeight: 16,
    fontSize: 12,
  },
  labelSmall: {
    fontFamily: 'sans-serif-medium',
    fontWeight: '500' as const,
    letterSpacing: 0.5,
    lineHeight: 16,
    fontSize: 11,
  },
  bodyLarge: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0.15,
    lineHeight: 24,
    fontSize: 16,
  },
  bodyMedium: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0.25,
    lineHeight: 20,
    fontSize: 14,
  },
  bodySmall: {
    fontFamily: 'sans-serif',
    fontWeight: '400' as const,
    letterSpacing: 0.4,
    lineHeight: 16,
    fontSize: 12,
  },
} as const;

// Create navigators
const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

// Create custom paper themes
export const CustomLightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
  },
  fonts: MD3LightTheme.fonts,
};

export const CustomDarkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.primary,
  },
  fonts: MD3DarkTheme.fonts,
};

// Create custom navigation theme
const { LightTheme, DarkTheme } = adaptNavigationTheme({
  reactNavigationLight: NavigationDefaultTheme,
  reactNavigationDark: NavigationDarkTheme,
});

// Add fonts to navigation themes
export const CustomNavigationLightTheme: Theme = {
  ...LightTheme,
  colors: {
    ...LightTheme.colors,
    background: colors.white,
    card: colors.white,
    text: colors.textDark,
    border: colors.border,
  },
  fonts,
};

export const CustomNavigationDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.darkBackground,
    card: colors.darkBackground,
    text: colors.text,
    border: colors.border,
  },
  fonts,
};

type IconNameType = 'home' | 'home-outline' | 'compass' | 'compass-outline' | 
                   'play-box-multiple' | 'play-box-multiple-outline' | 
                   'puzzle' | 'puzzle-outline' | 
                   'cog' | 'cog-outline';

// Add TabIcon component
const TabIcon = React.memo(({ focused, color, iconName }: { 
  focused: boolean; 
  color: string; 
  iconName: IconNameType;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.1 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 100
    }).start();
  }, [focused]);

  const finalIconName = focused ? iconName : `${iconName}-outline` as IconNameType;

  return (
    <Animated.View style={{ 
      alignItems: 'center', 
      justifyContent: 'center',
      transform: [{ scale: scaleAnim }]
    }}>
      <MaterialCommunityIcons 
        name={finalIconName}
        size={24} 
        color={color} 
      />
    </Animated.View>
  );
});

// Update the TabScreenWrapper component with fixed layout dimensions
const TabScreenWrapper: React.FC<{children: React.ReactNode}> = ({ children }) => {
  // Force consistent status bar settings
  useEffect(() => {
    const applyStatusBarConfig = () => {
      StatusBar.setBarStyle('light-content');
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent');
    };
    
    applyStatusBarConfig();
    
    // Apply status bar config on every focus
    const subscription = Platform.OS === 'android' 
      ? AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            applyStatusBarConfig();
          }
        })
      : { remove: () => {} };
      
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={{ 
      flex: 1, 
      backgroundColor: colors.darkBackground,
      // Lock the layout to prevent shifts
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Reserve consistent space for the header area on all screens */}
      <View style={{ 
        height: Platform.OS === 'android' ? 80 : 60, 
        width: '100%', 
        backgroundColor: colors.darkBackground,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: -1
      }} />
      {children}
    </View>
  );
};

// Add this component to wrap each screen in the tab navigator
const WrappedScreen: React.FC<{Screen: React.ComponentType<any>}> = ({ Screen }) => {
  return (
    <TabScreenWrapper>
      <Screen />
    </TabScreenWrapper>
  );
};

// Tab Navigator
const MainTabs = () => {
  // Always use dark mode
  const isDarkMode = true;
  const { currentTheme } = useTheme();
  
  const renderTabBar = (props: BottomTabBarProps) => {
    return (
      <View style={{ 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0,
        height: 85,
        backgroundColor: 'transparent',
        overflow: 'hidden',
      }}>
        {Platform.OS === 'ios' ? (
          <BlurView
            tint="dark"
            intensity={75}
            style={{
              position: 'absolute',
              height: '100%',
              width: '100%',
              borderTopColor: currentTheme.colors.border,
              borderTopWidth: 0.5,
              shadowColor: currentTheme.colors.black,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.1,
              shadowRadius: 3,
            }}
          />
        ) : (
          <LinearGradient
            colors={[
              'rgba(0, 0, 0, 0)',
              'rgba(0, 0, 0, 0.65)',
              'rgba(0, 0, 0, 0.85)',
              'rgba(0, 0, 0, 0.98)',
            ]}
            locations={[0, 0.2, 0.4, 0.8]}
            style={{
              position: 'absolute',
              height: '100%',
              width: '100%',
            }}
          />
        )}
        <View
          style={{
            height: '100%',
            paddingBottom: 20,
            paddingTop: 12,
            backgroundColor: 'transparent',
          }}
        >
          <View style={{ flexDirection: 'row', paddingTop: 4 }}>
            {props.state.routes.map((route, index) => {
              const { options } = props.descriptors[route.key];
              const label =
                options.tabBarLabel !== undefined
                  ? options.tabBarLabel
                  : options.title !== undefined
                  ? options.title
                  : route.name;

              const isFocused = props.state.index === index;

              const onPress = () => {
                const event = props.navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!isFocused && !event.defaultPrevented) {
                  props.navigation.navigate(route.name);
                }
              };

              let iconName: IconNameType = 'home';
              switch (route.name) {
                case 'Home':
                  iconName = 'home';
                  break;
                case 'Discover':
                  iconName = 'compass';
                  break;
                case 'Library':
                  iconName = 'play-box-multiple';
                  break;
                case 'Settings':
                  iconName = 'cog';
                  break;
              }

              return (
                <TouchableOpacity
                  key={route.key}
                  activeOpacity={0.7}
                  onPress={onPress}
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                  }}
                >
                  <TabIcon 
                    focused={isFocused} 
                    color={isFocused ? currentTheme.colors.primary : currentTheme.colors.white} 
                    iconName={iconName}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 4,
                      color: isFocused ? currentTheme.colors.primary : currentTheme.colors.white,
                      opacity: isFocused ? 1 : 0.7,
                    }}
                  >
                    {typeof label === 'string' ? label : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };
  
  return (
    <View style={{ flex: 1, backgroundColor: currentTheme.colors.darkBackground }}>
      {/* Common StatusBar for all tabs */}
      <StatusBar
        translucent
        barStyle="light-content"
        backgroundColor="transparent"
      />
      
      <Tab.Navigator
        tabBar={renderTabBar}
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: IconNameType = 'home';
            
            switch (route.name) {
              case 'Home':
                iconName = 'home';
                break;
              case 'Discover':
                iconName = 'compass';
                break;
              case 'Library':
                iconName = 'play-box-multiple';
                break;
              case 'Settings':
                iconName = 'cog';
                break;
            }
            
            return <TabIcon focused={focused} color={color} iconName={iconName} />;
          },
          tabBarActiveTintColor: currentTheme.colors.primary,
          tabBarInactiveTintColor: currentTheme.colors.white,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            height: 85,
            paddingBottom: 20,
            paddingTop: 12,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: 0,
          },
          // Completely disable animations between tabs for better performance
          animationEnabled: false,
          // Keep all screens mounted and active
          lazy: false,
          freezeOnBlur: false,
          detachPreviousScreen: false,
          // Configure how the screen renders
          detachInactiveScreens: false,
          tabBarBackground: () => (
            Platform.OS === 'ios' ? (
              <BlurView
                tint="dark"
                intensity={75}
                style={{
                  position: 'absolute',
                  height: '100%',
                  width: '100%',
                  borderTopColor: currentTheme.colors.border,
                  borderTopWidth: 0.5,
                  shadowColor: currentTheme.colors.black,
                  shadowOffset: { width: 0, height: -2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 3,
                }}
              />
            ) : (
              <LinearGradient
                colors={[
                  'rgba(0, 0, 0, 0)',
                  'rgba(0, 0, 0, 0.65)',
                  'rgba(0, 0, 0, 0.85)',
                  'rgba(0, 0, 0, 0.98)',
                ]}
                locations={[0, 0.2, 0.4, 0.8]}
                style={{
                  position: 'absolute',
                  height: '100%',
                  width: '100%',
                }}
              />
            )
          ),
          header: () => route.name === 'Home' ? <NuvioHeader /> : null,
          headerShown: route.name === 'Home',
          // Add fixed screen styling to help with consistency
          contentStyle: {
            backgroundColor: currentTheme.colors.darkBackground,
          },
        })}
        // Global configuration for the tab navigator
        detachInactiveScreens={false}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ 
            tabBarLabel: 'Home',
          }}
        />
        <Tab.Screen 
          name="Discover"
          component={DiscoverScreen}
          options={{ 
            tabBarLabel: 'Discover',
            headerShown: false
          }}
        />
        <Tab.Screen 
          name="Library" 
          component={LibraryScreen}
          options={{ 
            tabBarLabel: 'Library',
            headerShown: false
          }}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ 
            tabBarLabel: 'Settings',
            headerShown: false
          }}
        />
      </Tab.Navigator>
    </View>
  );
};

// Create custom fade animation interpolator for MetadataScreen
const customFadeInterpolator = ({ current, layouts }: any) => {
  return {
    cardStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          scale: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.95, 1],
          }),
        },
      ],
    },
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.3],
      }),
    },
  };
};

// Stack Navigator
const AppNavigator = ({ initialRouteName }: { initialRouteName?: keyof RootStackParamList }) => {
  const { currentTheme } = useTheme();
  
  // Handle Android-specific optimizations
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Ensure consistent background color for Android
      StatusBar.setBackgroundColor('transparent', true);
      StatusBar.setTranslucent(true);
    }
  }, []);
  
  return (
    <SafeAreaProvider>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <PaperProvider theme={CustomDarkTheme}>
        <View style={{ 
          flex: 1, 
          backgroundColor: currentTheme.colors.darkBackground,
          ...(Platform.OS === 'android' && {
            // Prevent white flashes on Android
            opacity: 1,
          })
        }}>
          <Stack.Navigator
            initialRouteName={initialRouteName || 'MainTabs'}
            screenOptions={{
              headerShown: false,
              // Use slide_from_right for consistency and smooth transitions
              animation: Platform.OS === 'android' ? 'slide_from_right' : 'slide_from_right',
              animationDuration: Platform.OS === 'android' ? 250 : 300,
              // Ensure consistent background during transitions
              contentStyle: {
                backgroundColor: currentTheme.colors.darkBackground,
              },
              // Improve Android performance with custom interpolator
              ...(Platform.OS === 'android' && {
                cardStyleInterpolator: ({ current, layouts }: any) => {
                  return {
                    cardStyle: {
                      transform: [
                        {
                          translateX: current.progress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [layouts.screen.width, 0],
                          }),
                        },
                      ],
                      backgroundColor: currentTheme.colors.darkBackground,
                    },
                  };
                },
              }),
            }}
          >
            <Stack.Screen 
              name="Onboarding" 
              component={OnboardingScreen}
              options={{
                headerShown: false,
                animation: 'fade',
                animationDuration: 300,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="MainTabs" 
              component={MainTabs as any} 
              options={{
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="Metadata" 
              component={MetadataScreen}
              options={{ 
                headerShown: false, 
                animation: 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 300,
                ...(Platform.OS === 'ios' && {
                  cardStyleInterpolator: customFadeInterpolator,
                  animationTypeForReplace: 'push',
                  gestureEnabled: true,
                  gestureDirection: 'horizontal',
                }),
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="Streams" 
              component={StreamsScreen as any} 
              options={{
                headerShown: false,
                animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'none',
                animationDuration: Platform.OS === 'android' ? 0 : 300,
                gestureEnabled: true,
                gestureDirection: Platform.OS === 'ios' ? 'vertical' : 'horizontal',
                ...(Platform.OS === 'ios' && { presentation: 'modal' }),
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="Player" 
              component={VideoPlayer as any} 
              options={{ 
                animation: 'slide_from_right',
                animationDuration: Platform.OS === 'android' ? 200 : 300,
                contentStyle: {
                  backgroundColor: '#000000', // Pure black for video player
                },
              }}
            />
            <Stack.Screen 
              name="Catalog" 
              component={CatalogScreen as any} 
              options={{ 
                animation: 'slide_from_right',
                animationDuration: Platform.OS === 'android' ? 250 : 300,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="Addons" 
              component={AddonsScreen as any} 
              options={{ 
                animation: 'slide_from_right',
                animationDuration: Platform.OS === 'android' ? 250 : 300,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="Search" 
              component={SearchScreen as any} 
              options={{ 
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 350,
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                ...(Platform.OS === 'android' && {
                  cardStyleInterpolator: ({ current, layouts }: any) => {
                    return {
                      cardStyle: {
                        transform: [
                          {
                            translateX: current.progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [layouts.screen.width, 0],
                            }),
                          },
                        ],
                        opacity: current.progress.interpolate({
                          inputRange: [0, 0.3, 1],
                          outputRange: [0, 0.85, 1],
                        }),
                      },
                    };
                  },
                }),
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="CatalogSettings" 
              component={CatalogSettingsScreen as any} 
              options={{ 
                animation: 'slide_from_right',
                animationDuration: Platform.OS === 'android' ? 250 : 300,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="HomeScreenSettings" 
              component={HomeScreenSettings}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="HeroCatalogs" 
              component={HeroCatalogsScreen}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="ShowRatings" 
              component={ShowRatingsScreen}
              options={{
                animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'fade',
                animationDuration: Platform.OS === 'android' ? 200 : 200,
                ...(Platform.OS === 'ios' && { presentation: 'modal' }),
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: 'transparent',
                },
              }}
            />
            <Stack.Screen 
              name="Calendar" 
              component={CalendarScreen as any} 
              options={{ 
                animation: 'slide_from_right',
                animationDuration: Platform.OS === 'android' ? 250 : 300,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="NotificationSettings" 
              component={NotificationSettingsScreen as any} 
              options={{ 
                animation: 'slide_from_right',
                animationDuration: Platform.OS === 'android' ? 250 : 300,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="MDBListSettings" 
              component={MDBListSettingsScreen}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="TMDBSettings" 
              component={TMDBSettingsScreen}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="TraktSettings" 
              component={TraktSettingsScreen}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="PlayerSettings" 
              component={PlayerSettingsScreen}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="LogoSourceSettings" 
              component={LogoSourceSettings}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="ThemeSettings" 
              component={ThemeScreen}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
            <Stack.Screen 
              name="ProfilesSettings" 
              component={ProfilesScreen}
              options={{
                animation: Platform.OS === 'android' ? 'slide_from_right' : 'fade',
                animationDuration: Platform.OS === 'android' ? 250 : 200,
                presentation: 'card',
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                headerShown: false,
                contentStyle: {
                  backgroundColor: currentTheme.colors.darkBackground,
                },
              }}
            />
          </Stack.Navigator>
        </View>
      </PaperProvider>
    </SafeAreaProvider>
  );
};

export default AppNavigator; 