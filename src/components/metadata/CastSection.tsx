import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { colors } from '../../styles/colors';
import { Cast } from '../../types/metadata';
import { tmdbService } from '../../services/tmdbService';

interface CastSectionProps {
  cast: Cast[];
  loadingCast: boolean;
  onSelectCastMember: (member: Cast) => void;
}

export const CastSection: React.FC<CastSectionProps> = ({
  cast,
  loadingCast,
  onSelectCastMember,
}) => {
  if (loadingCast) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (!cast.length) {
    return null;
  }

  return (
    <View style={styles.castSection}>
      <Text style={styles.sectionTitle}>Cast</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.castScrollContainer}
        contentContainerStyle={styles.castContainer}
        snapToAlignment="start"
      >
        {cast.map((member) => (
          <TouchableOpacity
            key={member.id}
            style={styles.castMember}
            onPress={() => onSelectCastMember(member)}
          >
            <View style={styles.castImageContainer}>
              {member.profile_path ? (
                <Image
                  source={{ 
                    uri: `https://image.tmdb.org/t/p/w185${member.profile_path}`
                  }}
                  style={styles.castImage}
                  contentFit="cover"
                />
              ) : (
                <MaterialIcons 
                  name="person" 
                  size={32} 
                  color={colors.textMuted} 
                />
              )}
            </View>
            <View style={styles.castTextContainer}>
              <Text style={styles.castName} numberOfLines={1}>{member.name}</Text>
              <Text style={styles.castCharacter} numberOfLines={1}>{member.character}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  castSection: {
    marginTop: 0,
    paddingLeft: 0,
  },
  sectionTitle: {
    color: colors.highEmphasis,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  castScrollContainer: {
    marginTop: 4,
  },
  castContainer: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  castMember: {
    width: 80,
    marginRight: 12,
    alignItems: 'center',
  },
  castImageContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.elevation2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  castImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  castTextContainer: {
    width: '100%',
    alignItems: 'center',
  },
  castName: {
    color: colors.highEmphasis,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  castCharacter: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.8,
  },
}); 