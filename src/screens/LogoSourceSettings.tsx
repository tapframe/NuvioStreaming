import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  SafeAreaView,
  Image,
  Alert,
  StatusBar,
  Platform
} from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../styles/colors';
import { useSettings } from '../hooks/useSettings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LogoSourceSettings = () => {
  const { settings, updateSetting } = useSettings();
  const navigation = useNavigation<NavigationProp<any>>();
  const insets = useSafeAreaInsets();
  
  // Get current preference
  const [logoSource, setLogoSource] = useState<'metahub' | 'tmdb'>(
    settings.logoSourcePreference || 'metahub'
  );

  // Apply setting and show confirmation
  const applyLogoSourceSetting = (source: 'metahub' | 'tmdb') => {
    setLogoSource(source);
    updateSetting('logoSourcePreference', source);
    
    // Clear any cached logo data in storage
    try {
      AsyncStorage.removeItem('_last_logos_');
    } catch (e) {
      console.error('Error clearing logo cache:', e);
    }
    
    // Show confirmation alert
    Alert.alert(
      'Settings Updated',
      `Logo and background source preference set to ${source === 'metahub' ? 'Metahub' : 'TMDB'}. Changes will apply when you navigate to content.`,
      [{ text: 'OK' }]
    );
  };
  
  // Handle back navigation
  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <TouchableOpacity 
          onPress={handleBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Logo Source</Text>
        <View style={styles.headerRight} />
      </View>
      
      <ScrollView style={styles.scrollView}>
        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>
            Choose the primary source for content logos and background images. This affects the appearance
            of titles in the metadata screen.
          </Text>
        </View>
        
        {/* Options */}
        <View style={styles.optionsContainer}>
          <TouchableOpacity
            style={[
              styles.optionCard,
              logoSource === 'metahub' && styles.selectedCard
            ]}
            onPress={() => applyLogoSourceSetting('metahub')}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>Metahub</Text>
              {logoSource === 'metahub' && (
                <MaterialIcons name="check-circle" size={24} color={colors.primary} />
              )}
            </View>
            
            <Text style={styles.optionDescription}>
              Prioritizes high-quality title logos from the Metahub image repository.
              Offers good coverage for popular titles.
            </Text>
            
            <View style={styles.exampleContainer}>
              <Text style={styles.exampleLabel}>Example:</Text>
              <Image 
                source={{ uri: 'https://images.metahub.space/logo/medium/tt1475582/img' }}
                style={styles.exampleImage}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.optionCard,
              logoSource === 'tmdb' && styles.selectedCard
            ]}
            onPress={() => applyLogoSourceSetting('tmdb')}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>TMDB</Text>
              {logoSource === 'tmdb' && (
                <MaterialIcons name="check-circle" size={24} color={colors.primary} />
              )}
            </View>
            
            <Text style={styles.optionDescription}>
              Uses logos from The Movie Database. Often includes more localized and newer logos,
              with better coverage for recent content.
            </Text>
            
            <View style={styles.exampleContainer}>
              <Text style={styles.exampleLabel}>Example:</Text>
              <Image 
                source={{ uri: 'https://image.tmdb.org/t/p/original/wwemzKWzjKYJFfCeiB57q3r4Bcm.svg' }}
                style={styles.exampleImage}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        </View>
        
        {/* Additional Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            If a logo is not available from your preferred source, the app will automatically fall back to the other source.
            If no logo is found, the title text will be shown instead.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: colors.elevation2,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  descriptionContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  description: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  optionsContainer: {
    padding: 16,
    gap: 16,
  },
  optionCard: {
    backgroundColor: colors.elevation2,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCard: {
    borderColor: colors.primary,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
  optionDescription: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  exampleContainer: {
    marginTop: 8,
  },
  exampleLabel: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    marginBottom: 8,
  },
  exampleImage: {
    height: 60,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
  },
  infoBox: {
    margin: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoText: {
    color: colors.mediumEmphasis,
    fontSize: 14,
    lineHeight: 20,
  },
});

export default LogoSourceSettings; 