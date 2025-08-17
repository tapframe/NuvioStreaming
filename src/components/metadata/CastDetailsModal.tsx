import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { Cast } from '../../types/cast';
import { tmdbService } from '../../services/tmdbService';
import { useNavigation } from '@react-navigation/native';
import { NavigationProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';

interface CastDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  castMember: Cast | null;
}

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;
const MODAL_WIDTH = isTablet ? Math.min(width * 0.8, 800) : Math.min(width - 40, 400);
const MODAL_HEIGHT = isTablet ? Math.min(height * 0.85, 700) : height * 0.7;

interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  profile_path: string | null;
  also_known_as: string[];
}

export const CastDetailsModal: React.FC<CastDetailsModalProps> = ({
  visible,
  onClose,
  castMember,
}) => {
  const { currentTheme } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [personDetails, setPersonDetails] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const modalOpacity = useSharedValue(0);
  const modalScale = useSharedValue(0.9);

  useEffect(() => {
    if (visible && castMember) {
      modalOpacity.value = withTiming(1, { duration: 250 });
      modalScale.value = withSpring(1, { damping: 20, stiffness: 200 });
      
      if (!hasFetched || personDetails?.id !== castMember.id) {
        fetchPersonDetails();
      }
    } else {
      modalOpacity.value = withTiming(0, { duration: 200 });
      modalScale.value = withTiming(0.9, { duration: 200 });
      
      if (!visible) {
        setHasFetched(false);
        setPersonDetails(null);
      }
    }
  }, [visible, castMember]);

  const fetchPersonDetails = async () => {
    if (!castMember || loading) return;
    
    setLoading(true);
    try {
      const details = await tmdbService.getPersonDetails(castMember.id);
      setPersonDetails(details);
      setHasFetched(true);
    } catch (error) {
      console.error('Error fetching person details:', error);
    } finally {
      setLoading(false);
    }
  };

  const modalStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
    transform: [{ scale: modalScale.value }],
  }));

  const handleClose = () => {
    modalOpacity.value = withTiming(0, { duration: 200 });
    modalScale.value = withTiming(0.9, { duration: 200 }, () => {
      runOnJS(onClose)();
    });
  };

  const handleViewMovies = () => {
    if (castMember) {
      handleClose();
      // Navigate after modal is closed
      setTimeout(() => {
        navigation.navigate('CastMovies', { castMember });
      }, 300);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const calculateAge = (birthday: string | null) => {
    if (!birthday) return null;
    const today = new Date();
    const birthDate = new Date(birthday);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  if (!visible || !castMember) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        onPress={handleClose}
        activeOpacity={1}
      />

      <Animated.View
        style={[
          {
            width: MODAL_WIDTH,
            height: MODAL_HEIGHT,
            overflow: 'hidden',
            borderRadius: isTablet ? 32 : 24,
            backgroundColor: Platform.OS === 'android' 
              ? 'rgba(20, 20, 20, 0.95)' 
              : 'transparent',
          },
          modalStyle,
        ]}
      >
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={100}
            tint="dark"
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'rgba(20, 20, 20, 0.8)',
            }}
          >
            {renderContent()}
          </BlurView>
        ) : (
          renderContent()
        )}
      </Animated.View>
    </Animated.View>
  );

  function renderContent() {
    return (
      <>
        {/* Header */}
        <View style={{
          padding: isTablet ? 24 : 20,
          paddingTop: isTablet ? 28 : 24,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              width: isTablet ? 72 : 56,
              height: isTablet ? 72 : 56,
              borderRadius: isTablet ? 36 : 28,
              overflow: 'hidden',
              marginRight: isTablet ? 16 : 12,
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
            }}>
              {castMember?.profile_path ? (
                <Image
                  source={{
                    uri: `https://image.tmdb.org/t/p/w185${castMember.profile_path}`,
                  }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <View style={{
                  width: '100%',
                  height: '100%',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: isTablet ? 20 : 16,
                    fontWeight: '600',
                  }}>
                    {castMember?.name?.split(' ').reduce((prev: string, current: string) => prev + current[0], '').substring(0, 2)}
                  </Text>
                </View>
              )}
            </View>
            
            <View style={{ flex: 1 }}>
              <Text style={{
                color: '#fff',
                fontSize: isTablet ? 20 : 17,
                fontWeight: '700',
                marginBottom: 3,
              }} numberOfLines={2}>
                {castMember?.name}
              </Text>
              {castMember?.character && (
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.6)',
                  fontSize: isTablet ? 14 : 13,
                  fontWeight: '500',
                }} numberOfLines={2}>
                  as {castMember.character}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={{
                width: isTablet ? 36 : 32,
                height: isTablet ? 36 : 32,
                borderRadius: isTablet ? 18 : 16,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={isTablet ? 20 : 18} color="rgba(255, 255, 255, 0.8)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: isTablet ? 24 : 18 }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 40,
            }}>
              <ActivityIndicator size="large" color={currentTheme.colors.primary} />
              <Text style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 14,
                marginTop: 12,
              }}>
                Loading details...
              </Text>
            </View>
          ) : (
            <View>
              {/* Basic Info */}
              {(personDetails?.birthday || personDetails?.place_of_birth) && (
                <View style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.06)',
                }}>
                  {personDetails?.birthday && (
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center',
                      marginBottom: personDetails?.place_of_birth ? 10 : 0
                    }}>
                      <View style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'rgba(255, 255, 255, 0.4)',
                        marginRight: 12,
                      }} />
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 13,
                        fontWeight: '500',
                      }}>
                        {calculateAge(personDetails.birthday)} years old
                      </Text>
                    </View>
                  )}

                  {personDetails?.place_of_birth && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'rgba(255, 255, 255, 0.4)',
                        marginRight: 12,
                      }} />
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 13,
                        fontWeight: '500',
                        flex: 1,
                      }}>
                        Born in {personDetails.place_of_birth}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* View Movies Button */}
              <TouchableOpacity
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  marginBottom: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                }}
                onPress={handleViewMovies}
                activeOpacity={0.7}
              >
                <MaterialIcons name="movie" size={18} color="rgba(255, 255, 255, 0.9)" style={{ marginRight: 8 }} />
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: 15,
                  fontWeight: '600',
                  letterSpacing: 0.3,
                }}>
                  View Filmography
                </Text>
              </TouchableOpacity>

              {/* Biography */}
              {personDetails?.biography && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: isTablet ? 15 : 14,
                    lineHeight: isTablet ? 22 : 20,
                    fontWeight: '400',
                  }}>
                    {personDetails.biography}
                  </Text>
                </View>
              )}

              {/* Also Known As - Minimalistic */}
              {personDetails?.also_known_as && personDetails.also_known_as.length > 0 && (
                <View style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: 11,
                    fontWeight: '600',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>
                    Also Known As
                  </Text>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: isTablet ? 14 : 13,
                    lineHeight: isTablet ? 20 : 18,
                    fontWeight: '500',
                  }}>
                    {personDetails.also_known_as.slice(0, 3).join(' • ')}
                  </Text>
                </View>
              )}

              {/* No details available */}
              {!loading && !personDetails?.biography && !personDetails?.birthday && !personDetails?.place_of_birth && !personDetails?.also_known_as?.length && (
                <View style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 32,
                }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontSize: 13,
                    textAlign: 'center',
                    fontWeight: '500',
                  }}>
                    No additional information available
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </>
    );
  }
};

export default CastDetailsModal;