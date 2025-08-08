import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, Dimensions, Animated, Easing, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAccount } from '../contexts/AccountContext';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const AuthScreen: React.FC = () => {
  const { currentTheme } = useTheme();
  const { signIn, signUp } = useAccount();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(16)).current;
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' | 'info' }>({ visible: false, message: '', type: 'info' });
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerHideAnim = useRef(new Animated.Value(0)).current; // 0 visible, 1 hidden

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
    const onShow = () => {
      Animated.timing(headerHideAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    const onHide = () => {
      Animated.timing(headerHideAnim, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [headerHideAnim]);

  const isEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const isPasswordValid = useMemo(() => password.length >= 6, [password]);
  const canSubmit = isEmailValid && isPasswordValid;

  const handleSubmit = async () => {
    if (loading) return;
    if (!isEmailValid) {
      const msg = 'Enter a valid email address';
      setError(msg);
      showToast(msg, 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    if (!isPasswordValid) {
      const msg = 'Password must be at least 6 characters';
      setError(msg);
      showToast(msg, 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    setLoading(true);
    setError(null);
    const err = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    if (err) {
      setError(err);
      showToast(err, 'error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else {
      const msg = mode === 'signin' ? 'Logged in successfully' : 'Sign up successful';
      showToast(msg, 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setLoading(false);
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
    toastOpacity.setValue(0);
    toastTranslateY.setValue(16);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(toastTranslateY, { toValue: 16, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        ]).start(() => setToast(prev => ({ ...prev, visible: false })));
      }, 2200);
    });
  };

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

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
        >
          {/* Main Card */}
          <View style={styles.centerContainer}>
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
                  ]}
                  onPress={() => setMode('signup')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.switchText, { color: mode === 'signup' ? '#fff' : currentTheme.colors.textMuted }]}>
                    Sign Up
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
            </Animated.View>

            {/* Toast */}
            {toast.visible && (
              <Animated.View 
                pointerEvents="none"
                style={[styles.toast, {
                  opacity: toastOpacity,
                  transform: [{ translateY: toastTranslateY }],
                  backgroundColor: toast.type === 'success' ? 'rgba(46,160,67,0.95)' : toast.type === 'error' ? 'rgba(229, 62, 62, 0.95)' : 'rgba(99, 102, 241, 0.95)'
                }]}
              >
                <MaterialIcons name={toast.type === 'success' ? 'check-circle' : toast.type === 'error' ? 'error-outline' : 'info-outline'} size={16} color="#fff" />
                <Text style={styles.toastText}>{toast.message}</Text>
              </Animated.View>
            )}
          </View>
        </KeyboardAvoidingView>
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
    justifyContent: 'center',
    paddingHorizontal: 20,
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
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toastText: {
    color: '#fff',
    fontWeight: '600',
    flex: 1,
  },
  switchModeText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default AuthScreen;

