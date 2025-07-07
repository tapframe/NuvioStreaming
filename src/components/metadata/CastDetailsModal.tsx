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

interface CastDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  castMember: Cast | null;
}

const { width, height } = Dimensions.get('window');
const MODAL_WIDTH = Math.min(width - 40, 400);
const MODAL_HEIGHT = height * 0.7;

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
            borderRadius: 24,
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
        <LinearGradient
          colors={[
            currentTheme.colors.primary + 'DD',
            currentTheme.colors.primaryVariant + 'CC',
          ]}
          style={{
            padding: 20,
            paddingTop: 24,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              overflow: 'hidden',
              marginRight: 16,
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            }}>
              {castMember.profile_path ? (
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
                    color: '#fff',
                    fontSize: 18,
                    fontWeight: '700',
                  }}>
                    {castMember.name.split(' ').reduce((prev: string, current: string) => prev + current[0], '').substring(0, 2)}
                  </Text>
                </View>
              )}
            </View>
            
            <View style={{ flex: 1 }}>
              <Text style={{
                color: '#fff',
                fontSize: 18,
                fontWeight: '800',
                marginBottom: 4,
              }} numberOfLines={2}>
                {castMember.name}
              </Text>
              {castMember.character && (
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: 14,
                  fontWeight: '500',
                }} numberOfLines={2}>
                  as {castMember.character}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20 }}
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
              {/* Quick Info */}
              {(personDetails?.known_for_department || personDetails?.birthday || personDetails?.place_of_birth) && (
                <View style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 20,
                }}>
                  {personDetails?.known_for_department && (
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center',
                      marginBottom: personDetails?.birthday || personDetails?.place_of_birth ? 12 : 0
                    }}>
                      <MaterialIcons name="work" size={16} color={currentTheme.colors.primary} />
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 12,
                        marginLeft: 8,
                        marginRight: 12,
                      }}>
                        Department
                      </Text>
                      <Text style={{
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: '600',
                      }}>
                        {personDetails.known_for_department}
                      </Text>
                    </View>
                  )}

                  {personDetails?.birthday && (
                    <View style={{ 
                      flexDirection: 'row', 
                      alignItems: 'center',
                      marginBottom: personDetails?.place_of_birth ? 12 : 0
                    }}>
                      <MaterialIcons name="cake" size={16} color="#22C55E" />
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 12,
                        marginLeft: 8,
                        marginRight: 12,
                      }}>
                        Age
                      </Text>
                      <Text style={{
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: '600',
                      }}>
                        {calculateAge(personDetails.birthday)} years old
                      </Text>
                    </View>
                  )}

                  {personDetails?.place_of_birth && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="place" size={16} color="#F59E0B" />
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 12,
                        marginLeft: 8,
                        marginRight: 12,
                      }}>
                        Born in
                      </Text>
                      <Text style={{
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: '600',
                        flex: 1,
                      }}>
                        {personDetails.place_of_birth}
                      </Text>
                    </View>
                  )}

                  {personDetails?.birthday && (
                    <View style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: 'rgba(255, 255, 255, 0.1)',
                    }}>
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 12,
                        marginBottom: 4,
                      }}>
                        Born on {formatDate(personDetails.birthday)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Biography */}
              {personDetails?.biography && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: '700',
                    marginBottom: 12,
                  }}>
                    Biography
                  </Text>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: '400',
                  }}>
                    {personDetails.biography}
                  </Text>
                </View>
              )}

              {/* Also Known As - Compact */}
              {personDetails?.also_known_as && personDetails.also_known_as.length > 0 && (
                <View>
                  <Text style={{
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: '700',
                    marginBottom: 12,
                  }}>
                    Also Known As
                  </Text>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 14,
                    lineHeight: 20,
                  }}>
                    {personDetails.also_known_as.slice(0, 4).join(' • ')}
                  </Text>
                </View>
              )}

              {/* No details available */}
              {!loading && !personDetails?.biography && !personDetails?.birthday && !personDetails?.place_of_birth && (
                <View style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 40,
                }}>
                  <MaterialIcons name="info" size={32} color="rgba(255, 255, 255, 0.3)" />
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: 14,
                    marginTop: 12,
                    textAlign: 'center',
                  }}>
                    No additional details available
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