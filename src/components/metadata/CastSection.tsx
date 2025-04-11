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
              {member.profile_path && tmdbService.getImageUrl(member.profile_path, 'w185') ? (
                <Image
                  source={{ 
                    uri: tmdbService.getImageUrl(member.profile_path, 'w185')!
                  }}
                  style={styles.castImage}
                  contentFit="cover"
                />
              ) : (
                <MaterialIcons 
                  name="person" 
                  size={40} 
                  color={colors.textMuted} 
                />
              )}
            </View>
            <Text style={styles.castName} numberOfLines={1}>{member.name}</Text>
            <Text style={styles.castCharacter} numberOfLines={2}>{member.character}</Text>
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
    padding: 20,
  },
  castSection: {
    marginTop: 0,
    paddingLeft: 0,
  },
  sectionTitle: {
    color: colors.highEmphasis,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  castScrollContainer: {
    marginTop: 8,
  },
  castContainer: {
    marginVertical: 8,
  },
  castMember: {
    width: 100,
    marginRight: 16,
    alignItems: 'center',
  },
  castImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.elevation2,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  castImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  castName: {
    color: colors.highEmphasis,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  castCharacter: {
    color: colors.mediumEmphasis,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
}); 