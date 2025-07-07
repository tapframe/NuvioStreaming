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
const MODAL_WIDTH = Math.min(width - 32, 520);
const MODAL_MAX_HEIGHT = height * 0.85;

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

const InfoBadge = ({ 
  label, 
  value, 
  icon,
  color = '#6B7280',
  bgColor = 'rgba(107, 114, 128, 0.15)'
}: { 
  label: string;
  value: string;
  icon?: string;
  color?: string;
  bgColor?: string;
}) => (
  <View style={{
    backgroundColor: bgColor,
    borderColor: `${color}40`,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginRight: 8,
  }}>
    {icon && (
      <MaterialIcons name={icon as any} size={14} color={color} style={{ marginRight: 6 }} />
    )}
    <View>
      <Text style={{
        color: color,
        fontSize: 10,
        fontWeight: '600',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        marginBottom: 2,
      }}>
        {label}
      </Text>
      <Text style={{
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: -0.1,
      }}>
        {value}
      </Text>
    </View>
  </View>
);

export const CastDetailsModal: React.FC<CastDetailsModalProps> = ({
  visible,
  onClose,
  castMember,
}) => {
  const { currentTheme } = useTheme();
  const [personDetails, setPersonDetails] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const modalOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible && castMember) {
      modalOpacity.value = withTiming(1, { duration: 200 });
      fetchPersonDetails();
    } else {
      modalOpacity.value = withTiming(0, { duration: 150 });
    }
  }, [visible, castMember]);

  const fetchPersonDetails = async () => {
    if (!castMember) return;
    
    setLoading(true);
    try {
      const details = await tmdbService.getPersonDetails(castMember.id);
      setPersonDetails(details);
    } catch (error) {
      console.error('Error fetching person details:', error);
    } finally {
      setLoading(false);
    }
  };

  const modalStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
  }));

  const handleClose = () => {
    modalOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(onClose)();
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
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
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
        padding: 16,
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
            maxHeight: MODAL_MAX_HEIGHT,
            minHeight: height * 0.4,
            overflow: 'hidden',
            elevation: 25,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.4,
            shadowRadius: 25,
            alignSelf: 'center',
          },
          modalStyle,
        ]}
      >
        <BlurView
          intensity={100}
          tint="dark"
          style={{
            borderRadius: 28,
            overflow: 'hidden',
            backgroundColor: 'rgba(26, 26, 26, 0.8)',
            width: '100%',
            height: '100%',
          }}
        >
          <LinearGradient
            colors={[
              currentTheme.colors.primary + '95',
              currentTheme.colors.primaryVariant + '95',
              currentTheme.colors.primaryVariant + '90',
            ]}
            locations={[0, 0.6, 1]}
            style={{
              paddingHorizontal: 28,
              paddingVertical: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255, 255, 255, 0.1)',
              width: '100%',
            }}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
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
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
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
                  fontSize: 20,
                  fontWeight: '800',
                  letterSpacing: -0.6,
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                }} numberOfLines={1}>
                  {castMember.name}
                </Text>
                {castMember.character && (
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.85)',
                    fontSize: 14,
                    marginTop: 4,
                    fontWeight: '500',
                    letterSpacing: 0.2,
                  }} numberOfLines={1}>
                    as {castMember.character}
                  </Text>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                justifyContent: 'center',
                alignItems: 'center',
                marginLeft: 16,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.2)',
              }}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView
            style={{
              maxHeight: MODAL_MAX_HEIGHT - 120,
              backgroundColor: 'transparent',
              width: '100%',
            }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              padding: 24,
              paddingBottom: 32,
              width: '100%',
            }}
            bounces={false}
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
                  fontSize: 16,
                  marginTop: 16,
                  fontWeight: '500',
                }}>
                  Loading details...
                </Text>
              </View>
            ) : (
              <View style={{ width: '100%' }}>
                {/* Personal Information */}
                <View style={{ marginBottom: 24 }}>
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: 14,
                    fontWeight: '600',
                    letterSpacing: 0.3,
                    marginBottom: 16,
                    textTransform: 'uppercase',
                  }}>
                    Personal Information
                  </Text>

                  <View style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    marginBottom: 16,
                  }}>
                    {personDetails?.known_for_department && (
                      <InfoBadge
                        label="Department"
                        value={personDetails.known_for_department}
                        icon="work"
                        color={currentTheme.colors.primary}
                        bgColor={currentTheme.colors.primary + '15'}
                      />
                    )}
                    
                    {personDetails?.birthday && (
                      <InfoBadge
                        label="Age"
                        value={`${calculateAge(personDetails.birthday)} years old`}
                        icon="cake"
                        color="#22C55E"
                        bgColor="rgba(34, 197, 94, 0.15)"
                      />
                    )}
                    
                    {personDetails?.place_of_birth && (
                      <InfoBadge
                        label="Birth Place"
                        value={personDetails.place_of_birth}
                        icon="place"
                        color="#F59E0B"
                        bgColor="rgba(245, 158, 11, 0.15)"
                      />
                    )}
                  </View>

                  {personDetails?.birthday && (
                    <View style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.08)',
                      marginBottom: 16,
                    }}>
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}>
                        <MaterialIcons name="event" size={16} color="rgba(255, 255, 255, 0.7)" />
                        <Text style={{
                          color: 'rgba(255, 255, 255, 0.7)',
                          fontSize: 12,
                          fontWeight: '600',
                          marginLeft: 6,
                          textTransform: 'uppercase',
                          letterSpacing: 0.3,
                        }}>
                          Born
                        </Text>
                      </View>
                      <Text style={{
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: '600',
                      }}>
                        {formatDate(personDetails.birthday)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Biography */}
                {personDetails?.biography && (
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: 14,
                      fontWeight: '600',
                      letterSpacing: 0.3,
                      marginBottom: 16,
                      textTransform: 'uppercase',
                    }}>
                      Biography
                    </Text>
                    
                    <View style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 20,
                      padding: 20,
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.08)',
                    }}>
                      <Text style={{
                        color: 'rgba(255, 255, 255, 0.9)',
                        fontSize: 14,
                        lineHeight: 22,
                        fontWeight: '400',
                        letterSpacing: 0.1,
                      }}>
                        {personDetails.biography}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Also Known As */}
                {personDetails?.also_known_as && personDetails.also_known_as.length > 0 && (
                  <View style={{ marginBottom: 24 }}>
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: 14,
                      fontWeight: '600',
                      letterSpacing: 0.3,
                      marginBottom: 16,
                      textTransform: 'uppercase',
                    }}>
                      Also Known As
                    </Text>
                    
                    <View style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}>
                      {personDetails.also_known_as.slice(0, 6).map((alias, index) => (
                        <View
                          key={index}
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: 12,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderWidth: 1,
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                          }}
                        >
                          <Text style={{
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontSize: 12,
                            fontWeight: '500',
                          }}>
                            {alias}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* No details available */}
                {!loading && !personDetails?.biography && !personDetails?.birthday && !personDetails?.place_of_birth && (
                  <View style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 40,
                  }}>
                    <MaterialIcons name="info" size={48} color="rgba(255, 255, 255, 0.3)" />
                    <Text style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      fontSize: 16,
                      marginTop: 16,
                      fontWeight: '500',
                      textAlign: 'center',
                    }}>
                      No additional details available
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </BlurView>
      </Animated.View>
    </Animated.View>
  );
};

export default CastDetailsModal;