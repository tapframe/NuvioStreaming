import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, Dimensions, Animated, Easing, Keyboard } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAccount } from '../contexts/AccountContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useToast } from '../contexts/ToastContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const AuthScreen: React.FC = () => {
  const { currentTheme } = useTheme();
  const { signIn, signUp } = useAccount();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const fromOnboarding = !!route?.params?.fromOnboarding;
  const insets = useSafeAreaInsets();
  const { showError, showSuccess } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const signupDisabled = true; // Signup disabled due to upcoming system replacement
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showWarningDetails, setShowWarningDetails] = useState(false);
  const authCardOpacity = useRef(new Animated.Value(1)).current;

  // Subtle, performant animations
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introTranslateY = useRef(new Animated.Value(10)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(12)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(1)).current;
  const titleTranslateY = useRef(new Animated.Value(0)).current;
  const ctaTextOpacity = useRef(new Animated.Value(1)).current;
  const ctaTextTranslateY = useRef(new Animated.Value(0)).current;
  const modeAnim = useRef(new Animated.Value(0)).current; // 0 = signin, 1 = signup
  const [switchWidth, setSwitchWidth] = useState(0);
  // Legacy local toast state removed in favor of global toast
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHideAnim = useRef(new Animated.Value(0)).current; // 0 visible, 1 hidden
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(introOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(introTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 360,
        delay: 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: 360,
        delay: 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardOpacity, cardTranslateY, introOpacity, introTranslateY]);

  // Animate on mode change
  useEffect(() => {
    Animated.timing(modeAnim, {
      toValue: mode === 'signin' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(titleTranslateY, { toValue: -6, duration: 120, useNativeDriver: true }),
        Animated.timing(ctaTextOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(ctaTextTranslateY, { toValue: -4, duration: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(titleTranslateY, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(ctaTextOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(ctaTextTranslateY, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]),
    ]).start();
  }, [mode, ctaTextOpacity, ctaTextTranslateY, modeAnim, titleOpacity, titleTranslateY]);

  // Hide/show header when keyboard toggles
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: any) => {
      const kh = e?.endCoordinates?.height ?? 0;
      setKeyboardHeight(kh);
      Animated.timing(headerHideAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    const onHide = () => {
      setKeyboardHeight(0);
      Animated.timing(headerHideAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    const subShow = Keyboard.addListener(showEvt, onShow as any);
    const subHide = Keyboard.addListener(hideEvt, onHide as any);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [headerHideAnim]);

  const isEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const isPasswordValid = useMemo(() => password.length >= 6, [password]);
  const isConfirmValid = useMemo(() => (mode === 'signin') || confirmPassword.length >= 6, [confirmPassword, mode]);
  const passwordsMatch = useMemo(() => (mode === 'signin') || confirmPassword === password, [confirmPassword, password, mode]);
  const canSubmit = isEmailValid && isPasswordValid && (mode === 'signin' || (isConfirmValid && passwordsMatch));

  const handleSubmit = async () => {
    if (loading) return;
    
    // Prevent signup if disabled
    if (mode === 'signup' && signupDisabled) {
      const msg = 'Sign up is currently disabled due to upcoming system changes';
      setError(msg);
      showError('Sign Up Disabled', 'Sign up is currently disabled due to upcoming system changes');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    
    if (!isEmailValid) {
      const msg = 'Enter a valid email address';
      setError(msg);
      showError('Invalid Email', 'Enter a valid email address');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    if (!isPasswordValid) {
      const msg = 'Password must be at least 6 characters';
      setError(msg);
      showError('Password Too Short', 'Password must be at least 6 characters');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    if (mode === 'signup' && !passwordsMatch) {
      const msg = 'Passwords do not match';
      setError(msg);
      showError('Passwords Don\'t Match', 'Passwords do not match');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setLoading(true);
    setError(null);
    const err = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    if (err) {
      setError(err);
      showError('Authentication Failed', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else {
      const msg = mode === 'signin' ? 'Logged in successfully' : 'Sign up successful';
      showSuccess('Success', msg);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // Navigate to main tabs after successful authentication
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' as never }] } as any);
    }
    setLoading(false);
  };

  const handleSkipAuth = async () => {
    try {
      await AsyncStorage.setItem('showLoginHintToastOnce', 'true');
    } catch {}
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' as never }] } as any);
  };

  const toggleWarningDetails = () => {
    if (showWarningDetails) {
      // Fade in auth card
      Animated.timing(authCardOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      // Fade out auth card
      Animated.timing(authCardOpacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    setShowWarningDetails(!showWarningDetails);
  };

  // showToast helper replaced with direct calls to toast.* API

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS !== 'android' ? (
        <LinearGradient
          colors={['#0D1117', '#161B22', '#21262D']}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0D1117' }]} />
      )}

      {/* Background Pattern (iOS only) */}
      {Platform.OS !== 'android' && (
        <View style={styles.backgroundPattern}>
          {Array.from({ length: 20 }).map((_, i) => (
            <View 
              key={i}
              style={[
                styles.patternDot,
                {
                  left: (i % 5) * (width / 4),
                  top: Math.floor(i / 5) * (height / 4),
                  opacity: 0.03 + (i % 3) * 0.02,
                }
              ]}
            />
          ))}
        </View>
      )}

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header outside KeyboardAvoidingView to avoid being overlapped */}
        <Animated.View
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          style={[
            styles.header,
            {
              opacity: Animated.multiply(
                introOpacity,
                headerHideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })
              ),
              transform: [
                {
                  translateY: Animated.add(
                    introTranslateY,
                    headerHideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -12] })
                  ),
                },
              ],
            },
          ]}
        >
          {navigation.canGoBack() && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, Platform.OS === 'android' ? { top: Math.max(insets.top + 6, 18) } : null]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="arrow-back" size={22} color={currentTheme.colors.white} />
            </TouchableOpacity>
          )}
          <Animated.Text style={[styles.heading, { color: currentTheme.colors.white, opacity: titleOpacity, transform: [{ translateY: titleTranslateY }] }]}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </Animated.Text>
          <Text style={[styles.subheading, { color: currentTheme.colors.textMuted }] }>
            Sync your addons, progress and settings across devices
          </Text>
        </Animated.View>

        {/* Important Warning Message */}
        <Animated.View
          style={[
            styles.warningContainer,
            {
              opacity: introOpacity,
              transform: [{ translateY: introTranslateY }],
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.warningCard, { backgroundColor: 'rgba(255, 193, 7, 0.1)', borderColor: 'rgba(255, 193, 7, 0.3)' }]}
            onPress={toggleWarningDetails}
            activeOpacity={0.8}
          >
            <MaterialIcons name="warning" size={20} color="#FFC107" style={styles.warningIcon} />
            <View style={styles.warningContent}>
              <Text style={[styles.warningTitle, { color: '#FFC107' }]}>
                Important Notice
              </Text>
              <Text style={[styles.warningText, { color: currentTheme.colors.white }]}>
                This authentication system will be completely replaced by local backup/restore functionality by October 8th. Please create backup files as your cloud data will be permanently destroyed.
              </Text>
              <Text style={[styles.readMoreText, { color: '#FFC107' }]}>
                Read more {showWarningDetails ? '▼' : '▶'}
              </Text>
            </View>
          </TouchableOpacity>
          
          {/* Expanded Details */}
          {showWarningDetails && (
            <Animated.View style={[styles.warningDetails, { backgroundColor: 'rgba(255, 193, 7, 0.05)', borderColor: 'rgba(255, 193, 7, 0.2)' }]}>
              <View style={styles.detailsContent}>
                <Text style={[styles.detailsTitle, { color: '#FFC107' }]}>
                  Why is this system being discontinued?
                </Text>
                <Text style={[styles.detailsText, { color: currentTheme.colors.white }]}>
                  • Lack of real-time support for addon synchronization{'\n'}
                  • Database synchronization issues with addons and settings{'\n'}
                  • Unreliable cloud data management{'\n'}
                  • Performance problems with remote data access
                </Text>
                
                <Text style={[styles.detailsTitle, { color: '#FFC107', marginTop: 16 }]}>
                  Benefits of Local Backup System:
                </Text>
                <Text style={[styles.detailsText, { color: currentTheme.colors.white }]}>
                  • Instant addon synchronization across devices{'\n'}
                  • Reliable offline access to all your data{'\n'}
                  • Complete control over your backup files{'\n'}
                  • Faster performance with local data storage{'\n'}
                  • No dependency on external servers{'\n'}
                  • Easy migration between devices
                </Text>
              </View>
            </Animated.View>
          )}
        </Animated.View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
        >
          {/* Main Card - Hide when warning details are expanded */}
          <Animated.View style={[styles.centerContainer, { opacity: authCardOpacity }]}>
            <Animated.View style={[styles.card, { 
              backgroundColor: Platform.OS === 'android' ? '#121212' : 'rgba(255,255,255,0.02)',
              borderColor: Platform.OS === 'android' ? '#1f1f1f' : 'rgba(255,255,255,0.06)',
              ...(Platform.OS !== 'android' ? {
                shadowColor: currentTheme.colors.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.1,
                shadowRadius: 20,
              } : {}),
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslateY }],
            }]}>                
              
              {/* Mode Toggle */}
              <View
                onLayout={(e) => setSwitchWidth(e.nativeEvent.layout.width)}
                style={[styles.switchRow, { backgroundColor: Platform.OS === 'android' ? '#1a1a1a' : 'rgba(255,255,255,0.04)' }]}
              >
                {/* Animated indicator */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.switchIndicator,
                    {
                      width: Math.max(0, (switchWidth - 6) / 2),
                      backgroundColor: Platform.OS === 'android' ? '#2a2a2a' : currentTheme.colors.primary,
                      transform: [
                        {
                          translateX: modeAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, Math.max(0, (switchWidth - 6) / 2)],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <TouchableOpacity
                  style={[
                    styles.switchButton,
                  ]}
                  onPress={() => setMode('signin')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.switchText, { color: mode === 'signin' ? '#fff' : currentTheme.colors.textMuted }]}>
                    Sign In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.switchButton,
                    signupDisabled && styles.disabledButton,
                  ]}
                  onPress={() => !signupDisabled && setMode('signup')}
                  activeOpacity={signupDisabled ? 1 : 0.8}
                  disabled={signupDisabled}
                >
                  <Text style={[
                    styles.switchText, 
                    { 
                      color: mode === 'signup' ? '#fff' : (signupDisabled ? 'rgba(255,255,255,0.3)' : currentTheme.colors.textMuted)
                    }
                  ]}>
                    Sign Up {signupDisabled && '(Disabled)'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Email Input */}
              <View style={[styles.inputContainer]}>
                <View style={[styles.inputRow, { 
                  backgroundColor: Platform.OS === 'android' ? '#1a1a1a' : 'rgba(255,255,255,0.03)', 
                  borderColor: Platform.OS === 'android' ? '#2a2a2a' : (isEmailValid || !email ? 'rgba(255,255,255,0.08)' : 'rgba(255,107,107,0.4)'),
                  borderWidth: 1,
                }]}>                
                  <View style={[styles.iconContainer, { backgroundColor: Platform.OS === 'android' ? '#222' : (isEmailValid ? 'rgba(46,160,67,0.15)' : 'rgba(255,255,255,0.05)') }]}>                
                    <MaterialIcons 
                      name="mail-outline" 
                      size={18} 
                      color={Platform.OS === 'android' ? currentTheme.colors.textMuted : (isEmailValid ? '#2EA043' : currentTheme.colors.textMuted)} 
                    />
                  </View>
                  <TextInput
                    placeholder="Email address"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    style={[styles.input, { color: currentTheme.colors.white }]}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    returnKeyType="next"
                  />
                  {Platform.OS !== 'android' && isEmailValid && (
                    <MaterialIcons name="check-circle" size={16} color="#2EA043" style={{ marginRight: 12 }} />
                  )}
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <View style={[styles.inputRow, { 
                  backgroundColor: Platform.OS === 'android' ? '#1a1a1a' : 'rgba(255,255,255,0.03)', 
                  borderColor: Platform.OS === 'android' ? '#2a2a2a' : (isPasswordValid || !password ? 'rgba(255,255,255,0.08)' : 'rgba(255,107,107,0.4)'),
                  borderWidth: 1,
                }]}>                
                  <View style={[styles.iconContainer, { backgroundColor: Platform.OS === 'android' ? '#222' : (isPasswordValid ? 'rgba(46,160,67,0.15)' : 'rgba(255,255,255,0.05)') }]}>                
                    <MaterialIcons 
                      name="lock-outline" 
                      size={18} 
                      color={Platform.OS === 'android' ? currentTheme.colors.textMuted : (isPasswordValid ? '#2EA043' : currentTheme.colors.textMuted)} 
                    />
                  </View>
                  <TextInput
                    placeholder="Password (min 6 characters)"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    style={[styles.input, { color: currentTheme.colors.white }]}
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={styles.eyeButton}>
                    <MaterialIcons 
                      name={showPassword ? 'visibility-off' : 'visibility'} 
                      size={16} 
                      color={currentTheme.colors.textMuted} 
                    />
                  </TouchableOpacity>
                  {Platform.OS !== 'android' && isPasswordValid && (
                    <MaterialIcons name="check-circle" size={16} color="#2EA043" style={{ marginRight: 12 }} />
                  )}
                </View>
              </View>

              {/* Confirm Password (signup only) */}
              {mode === 'signup' && (
                <View style={styles.inputContainer}>
                  <View style={[styles.inputRow, { 
                    backgroundColor: Platform.OS === 'android' ? '#1a1a1a' : 'rgba(255,255,255,0.03)', 
                    borderColor: Platform.OS === 'android' ? '#2a2a2a' : ((passwordsMatch && (isConfirmValid || !confirmPassword)) ? 'rgba(255,255,255,0.08)' : 'rgba(255,107,107,0.4)'),
                    borderWidth: 1,
                  }]}>                
                    <View style={[styles.iconContainer, { backgroundColor: Platform.OS === 'android' ? '#222' : ((passwordsMatch && isConfirmValid) ? 'rgba(46,160,67,0.15)' : 'rgba(255,255,255,0.05)') }]}>                
                      <MaterialIcons 
                        name="lock-outline" 
                        size={18} 
                        color={Platform.OS === 'android' ? currentTheme.colors.textMuted : ((passwordsMatch && isConfirmValid) ? '#2EA043' : currentTheme.colors.textMuted)} 
                      />
                    </View>
                    <TextInput
                      placeholder="Confirm password"
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      style={[styles.input, { color: currentTheme.colors.white }]}
                      secureTextEntry={!showConfirm}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                    <TouchableOpacity onPress={() => setShowConfirm(p => !p)} style={styles.eyeButton}>
                      <MaterialIcons 
                        name={showConfirm ? 'visibility-off' : 'visibility'} 
                        size={16} 
                        color={currentTheme.colors.textMuted} 
                      />
                    </TouchableOpacity>
                    {Platform.OS !== 'android' && passwordsMatch && isConfirmValid && (
                      <MaterialIcons name="check-circle" size={16} color="#2EA043" style={{ marginRight: 12 }} />
                    )}
                  </View>
                </View>
              )}

              {/* Error */}
              {!!error && (
                <View style={styles.errorRow}>
                  <MaterialIcons name="error-outline" size={16} color="#ff6b6b" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Submit Button */}
              <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
                <TouchableOpacity
                  style={[
                    styles.ctaButton, 
                    { 
                      backgroundColor: canSubmit ? currentTheme.colors.primary : 'rgba(255,255,255,0.08)',
                      ...(Platform.OS !== 'android' ? {
                        shadowColor: canSubmit ? currentTheme.colors.primary : 'transparent',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: canSubmit ? 0.3 : 0,
                        shadowRadius: 12,
                      } : {}),
                    }
                  ]}
                  onPress={handleSubmit}
                  onPressIn={() => {
                    Animated.spring(ctaScale, {
                      toValue: 0.98,
                      useNativeDriver: true,
                      speed: 20,
                      bounciness: 0,
                    }).start();
                  }}
                  onPressOut={() => {
                    Animated.spring(ctaScale, {
                      toValue: 1,
                      useNativeDriver: true,
                      speed: 20,
                      bounciness: 6,
                    }).start();
                  }}
                  activeOpacity={0.85}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Animated.Text style={[styles.ctaText, { opacity: ctaTextOpacity, transform: [{ translateY: ctaTextTranslateY }] }]}>
                      {mode === 'signin' ? 'Sign In' : 'Create Account'}
                    </Animated.Text>
                  )}
                </TouchableOpacity>
              </Animated.View>

              {/* Switch Mode */}
              {!signupDisabled && (
                <TouchableOpacity 
                  onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} 
                  activeOpacity={0.7}
                  style={{ marginTop: 16 }}
                >
                  <Text style={[styles.switchModeText, { color: currentTheme.colors.textMuted }]}>
                    {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                    <Text style={{ color: currentTheme.colors.primary, fontWeight: '600' }}>
                      {mode === 'signin' ? 'Sign up' : 'Sign in'}
                    </Text>
                  </Text>
                </TouchableOpacity>
              )}
              
              {/* Signup disabled message */}
              {signupDisabled && mode === 'signin' && (
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={[styles.switchModeText, { color: 'rgba(255,255,255,0.5)', fontSize: 13 }]}>
                    New account creation is temporarily disabled
                  </Text>
                </View>
              )}

              {/* Skip sign in - more prominent when coming from onboarding */}
              <TouchableOpacity
                onPress={handleSkipAuth}
                activeOpacity={0.85}
                style={[
                  { marginTop: 12, alignSelf: 'center' },
                  fromOnboarding && {
                    marginTop: 18,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                  },
                ]}
              >
                <Text style={{ 
                  color: fromOnboarding ? currentTheme.colors.white : currentTheme.colors.textMuted, 
                  textAlign: 'center',
                  fontWeight: fromOnboarding ? '700' : '500',
                }}>
                  Continue without an account
                </Text>
              </TouchableOpacity>
            </Animated.View>

          </Animated.View>
        </KeyboardAvoidingView>
        {/* Toasts rendered globally in App root */}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  backgroundPattern: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  patternDot: {
    position: 'absolute',
    width: 2,
    height: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 8,
  },
  logoContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 180,
    height: 54,
    zIndex: 2,
  },
  logoGlow: {
    position: 'absolute',
    width: 200,
    height: 70,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderRadius: 35,
    zIndex: 1,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 20,
  },
  switchRow: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
    marginBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  switchIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 12,
  },
  switchButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 0,
  },
  switchText: {
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 4,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
    fontWeight: '500',
  },
  eyeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  errorText: {
    color: '#ff6b6b',
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '500',
  },
  ctaButton: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    elevation: 0,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 8,
  },
  switchModeText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  warningContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  warningCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  warningIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
  readMoreText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  warningDetails: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailsContent: {
    padding: 16,
  },
  detailsTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  detailsText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});

export default AuthScreen;

