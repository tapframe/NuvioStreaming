import React, { useEffect, useRef } from 'react';
import { NavigationContainer, DefaultTheme as NavigationDefaultTheme, DarkTheme as NavigationDarkTheme, Theme, NavigationProp } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackNavigationOptions, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useColorScheme, Platform, Animated, StatusBar, TouchableOpacity, View, Text } from 'react-native';
import { PaperProvider, MD3DarkTheme, MD3LightTheme, adaptNavigationTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../styles/colors';
import { NuvioHeader } from '../components/NuvioHeader';
import { Stream } from '../types/streams';

// Import screens with their proper types
import HomeScreen from '../screens/HomeScreen';
import DiscoverScreen from '../screens/DiscoverScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MetadataScreen from '../screens/MetadataScreen';
import VideoPlayer from '../screens/VideoPlayer';
import CatalogScreen from '../screens/CatalogScreen';
import AddonsScreen from '../screens/AddonsScreen';
import SearchScreen from '../screens/SearchScreen';
import ShowRatingsScreen from '../screens/ShowRatingsScreen';
import CatalogSettingsScreen from '../screens/CatalogSettingsScreen';
import StreamsScreen from '../screens/StreamsScreen';
import CalendarScreen from '../screens/CalendarScreen';
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';

// Stack navigator types
export type RootStackParamList = {
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
    id?: string;
    type?: string;
    episodeId?: string;
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
};

export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Tab navigator types
export type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Library: undefined;
  Addons: undefined;
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

// Tab Navigator
const MainTabs = () => {
  // Always use dark mode
  const isDarkMode = true;
  
  const renderTabBar = (props: BottomTabBarProps) => {
    return (
      <View style={{ 
        position: 'absolute', 
        bottom: 0, 
        left: 0, 
        right: 0,
        height: 75,
        backgroundColor: 'transparent',
      }}>
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
        <View
          style={{
            height: '100%',
            paddingBottom: 10,
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
                case 'Addons':
                  iconName = 'puzzle';
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
                    color={isFocused ? colors.primary : '#FFFFFF'} 
                    iconName={iconName}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      marginTop: 4,
                      color: isFocused ? colors.primary : '#FFFFFF',
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
            case 'Addons':
              iconName = 'puzzle';
              break;
            case 'Settings':
              iconName = 'cog';
              break;
          }
          
          return <TabIcon focused={focused} color={color} iconName={iconName} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 75,
          paddingBottom: 10,
          paddingTop: 12,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 0,
        },
        tabBarBackground: () => (
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
        ),
        header: () => route.name === 'Home' ? <NuvioHeader /> : null,
        headerShown: route.name === 'Home',
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen as any}
        options={{ 
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen 
        name="Discover" 
        component={DiscoverScreen as any}
        options={{ 
          tabBarLabel: 'Discover'
        }}
      />
      <Tab.Screen 
        name="Library" 
        component={LibraryScreen as any}
        options={{ 
          tabBarLabel: 'Library'
        }}
      />
      <Tab.Screen 
        name="Addons" 
        component={AddonsScreen as any}
        options={{ 
          tabBarLabel: 'Addons'
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen as any}
        options={{ 
          tabBarLabel: 'Settings'
        }}
      />
    </Tab.Navigator>
  );
};

// Stack Navigator
const AppNavigator = () => {
  // Always use dark mode
  const isDarkMode = true;
  
  return (
    <>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <PaperProvider theme={CustomDarkTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
          }}
        >
          <Stack.Screen 
            name="MainTabs" 
            component={MainTabs as any} 
          />
          <Stack.Screen 
            name="Metadata" 
            component={MetadataScreen as any} 
          />
          <Stack.Screen 
            name="Streams" 
            component={StreamsScreen as any} 
            options={{
              headerShown: false,
              animation: Platform.OS === 'ios' ? 'slide_from_bottom' : 'fade_from_bottom',
              ...(Platform.OS === 'ios' && { presentation: 'modal' }),
            }}
          />
          <Stack.Screen 
            name="Player" 
            component={VideoPlayer as any} 
          />
          <Stack.Screen 
            name="Catalog" 
            component={CatalogScreen as any} 
          />
          <Stack.Screen 
            name="Addons" 
            component={AddonsScreen as any} 
          />
          <Stack.Screen 
            name="Search" 
            component={SearchScreen as any} 
          />
          <Stack.Screen 
            name="CatalogSettings" 
            component={CatalogSettingsScreen as any} 
          />
          <Stack.Screen 
            name="ShowRatings" 
            component={ShowRatingsScreen}
            options={{
              animation: 'fade',
              animationDuration: 200,
              presentation: 'card',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
              headerShown: false,
              contentStyle: {
                backgroundColor: colors.darkBackground,
              },
            }}
          />
          <Stack.Screen 
            name="Calendar" 
            component={CalendarScreen as any} 
          />
          <Stack.Screen 
            name="NotificationSettings" 
            component={NotificationSettingsScreen as any} 
          />
        </Stack.Navigator>
      </PaperProvider>
    </>
  );
};

export default AppNavigator; 