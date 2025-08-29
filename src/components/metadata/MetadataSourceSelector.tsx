import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { stremioService } from '../../services/stremioService';
import { tmdbService } from '../../services/tmdbService';
import { catalogService } from '../../services/catalogService';
import { logger } from '../../utils/logger';

interface MetadataSource {
  id: string;
  name: string;
  type: 'addon' | 'tmdb';
  hasMetaSupport?: boolean;
  icon?: string;
}

interface MetadataSourceSelectorProps {
  currentSource?: string;
  contentId: string;
  contentType: string;
  onSourceChange: (sourceId: string, sourceType: 'addon' | 'tmdb') => void;
  disabled?: boolean;
  enableComplementary?: boolean;
  onComplementaryToggle?: (enabled: boolean) => void;
}

const MetadataSourceSelector: React.FC<MetadataSourceSelectorProps> = ({
  currentSource,
  contentId,
  contentType,
  onSourceChange,
  disabled = false,
  enableComplementary = false,
  onComplementaryToggle,
}) => {
  const { currentTheme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [sources, setSources] = useState<MetadataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>(currentSource || 'auto');
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Load available metadata sources
  const loadMetadataSources = useCallback(async () => {
    setLoading(true);
    try {
      const sources: MetadataSource[] = [];

      // Add auto-select option
      sources.push({
        id: 'auto',
        name: 'Auto (Best Available)',
        type: 'addon',
        icon: 'auto-fix-high',
      });

      // Add TMDB as a source
      sources.push({
        id: 'tmdb',
        name: 'The Movie Database (TMDB)',
        type: 'tmdb',
        icon: 'movie',
      });

      // Get installed addons with meta support
      const addons = await stremioService.getInstalledAddonsAsync();
      logger.log(`[MetadataSourceSelector] Checking ${addons.length} installed addons for meta support`);
      
      for (const addon of addons) {
        logger.log(`[MetadataSourceSelector] Checking addon: ${addon.name} (${addon.id})`);
        logger.log(`[MetadataSourceSelector] Addon resources:`, addon.resources);
        
        // Check if addon supports meta resource
        let hasMetaSupport = false;
        
        if (addon.resources) {
          // Handle both array of strings and array of objects
          hasMetaSupport = addon.resources.some((resource: any) => {
            if (typeof resource === 'string') {
              // Simple string format like ["catalog", "meta"]
              return resource === 'meta';
            } else if (resource && typeof resource === 'object') {
              // Object format like { name: 'meta', types: ['movie', 'series'] }
              const supportsType = !resource.types || resource.types.includes(contentType);
              logger.log(`[MetadataSourceSelector] Resource ${resource.name}: types=${resource.types}, supportsType=${supportsType}`);
              return resource.name === 'meta' && supportsType;
            }
            return false;
          });
        }

        logger.log(`[MetadataSourceSelector] Addon ${addon.name} has meta support: ${hasMetaSupport}`);

        if (hasMetaSupport) {
          sources.push({
            id: addon.id,
            name: addon.name,
            type: 'addon',
            hasMetaSupport: true,
            icon: 'extension',
          });
          logger.log(`[MetadataSourceSelector] Added addon ${addon.name} as metadata source`);
        }
      }

      // Sort sources: auto first, then TMDB, then addons alphabetically
      sources.sort((a, b) => {
        if (a.id === 'auto') return -1;
        if (b.id === 'auto') return 1;
        if (a.id === 'tmdb') return -1;
        if (b.id === 'tmdb') return 1;
        return a.name.localeCompare(b.name);
      });

      // Always include at least auto and TMDB for comparison
      if (sources.length < 2) {
        logger.warn('[MetadataSourceSelector] Less than 2 sources found, this should not happen');
      }

      setSources(sources);
      logger.log(`[MetadataSourceSelector] Found ${sources.length} metadata sources:`, sources.map(s => s.name));
    } catch (error) {
      logger.error('[MetadataSourceSelector] Failed to load metadata sources:', error);
    } finally {
      setLoading(false);
    }
  }, [contentType]);

  // Load sources on mount
  useEffect(() => {
    loadMetadataSources();
  }, [loadMetadataSources]);

  // Update selected source when currentSource prop changes
  useEffect(() => {
    if (currentSource) {
      setSelectedSource(currentSource);
    }
  }, [currentSource]);

  const handleSourceSelect = useCallback((source: MetadataSource) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedSource(source.id);
    setIsVisible(false);
    onSourceChange(source.id, source.type);
  }, [onSourceChange]);

  const handleOpenModal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Reset animation values
    scaleAnim.setValue(0.8);
    opacityAnim.setValue(0);
    setIsVisible(true);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, opacityAnim]);

  const handleCloseModal = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.8,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
    });
  }, [scaleAnim, opacityAnim]);

  const currentSourceName = useMemo(() => {
    const source = sources.find(s => s.id === selectedSource);
    return source?.name || 'Auto (Best Available)';
  }, [sources, selectedSource]);

  const getSourceIcon = useCallback((source: MetadataSource) => {
    switch (source.icon) {
      case 'auto-fix-high':
        return 'auto-fix-high';
      case 'movie':
        return 'movie';
      case 'extension':
        return 'extension';
      default:
        return 'info';
    }
  }, []);

  // Always show if we have sources and onSourceChange callback
  if (sources.length === 0 || !onSourceChange) {
    console.log('[MetadataSourceSelector] Not showing selector:', { sourcesLength: sources.length, hasCallback: !!onSourceChange });
    return null;
  }

  console.log('[MetadataSourceSelector] Showing selector with sources:', sources.map(s => s.name));

  return (
    <>
      <View style={styles.container}>
        <Text style={[styles.label, { color: currentTheme.colors.textMuted }]}>
          Metadata Source
        </Text>
        <TouchableOpacity
          style={[
            styles.selector,
            { 
              backgroundColor: currentTheme.colors.elevation1,
              borderColor: currentTheme.colors.border,
            },
            disabled && styles.disabled
          ]}
          onPress={() => !disabled && handleOpenModal()}
          disabled={disabled}
          activeOpacity={0.7}
        >
          <View style={styles.selectorContent}>
            <MaterialIcons 
              name={getSourceIcon(sources.find(s => s.id === selectedSource) || sources[0])} 
              size={20} 
              color={currentTheme.colors.text} 
            />
            <Text 
              style={[styles.selectorText, { color: currentTheme.colors.text }]}
              numberOfLines={1}
            >
              {currentSourceName}
            </Text>
          </View>
          <MaterialIcons 
            name="expand-more" 
            size={20} 
            color={currentTheme.colors.textMuted} 
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={isVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[
            styles.modalContent, 
            { 
              backgroundColor: 'rgba(30, 30, 30, 0.98)',
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.12)',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            }
          ]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Select Metadata Source
              </Text>
              <TouchableOpacity
                onPress={handleCloseModal}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={currentTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Complementary Metadata Toggle */}
            <View style={styles.complementaryToggle}>
              <View style={styles.toggleContent}>
                <MaterialIcons
                  name="merge-type"
                  size={20}
                  color={currentTheme.colors.primary}
                />
                <View style={styles.toggleText}>
                  <Text style={[styles.toggleTitle, { color: currentTheme.colors.text }]}>
                    Complementary Metadata
                  </Text>
                  <Text style={[styles.toggleDescription, { color: currentTheme.colors.textMuted }]}>
                    Fetch missing data from other sources
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggleSwitch,
                  {
                    backgroundColor: enableComplementary
                      ? currentTheme.colors.primary
                      : currentTheme.colors.elevation2,
                  }
                ]}
                onPress={() => onComplementaryToggle?.(!enableComplementary)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    {
                      transform: [{ translateX: enableComplementary ? 20 : 2 }],
                      backgroundColor: currentTheme.colors.white,
                    }
                  ]}
                />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={currentTheme.colors.primary} />
                <Text style={[styles.loadingText, { color: currentTheme.colors.textMuted }]}>
                  Loading sources...
                </Text>
              </View>
            ) : (
              <ScrollView style={styles.sourcesList}>
                {sources.map((source) => (
                  <TouchableOpacity
                    key={source.id}
                    style={[
                      styles.sourceItem,
                      { 
                        backgroundColor: selectedSource === source.id 
                          ? currentTheme.colors.primary + '25' 
                          : 'rgba(45, 45, 45, 0.95)',
                        borderColor: selectedSource === source.id 
                          ? currentTheme.colors.primary + '50' 
                          : 'rgba(255, 255, 255, 0.15)',
                      }
                    ]}
                    onPress={() => handleSourceSelect(source)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.sourceContent}>
                      <View style={[
                        styles.iconContainer,
                        { 
                          backgroundColor: selectedSource === source.id 
                            ? currentTheme.colors.primary + '30' 
                            : 'rgba(60, 60, 60, 0.95)'
                        }
                      ]}>
                        <MaterialIcons 
                          name={getSourceIcon(source)} 
                          size={20} 
                          color={selectedSource === source.id ? currentTheme.colors.primary : currentTheme.colors.text} 
                        />
                      </View>
                      <View style={styles.sourceInfo}>
                        <Text 
                          style={[
                            styles.sourceName, 
                            { 
                              color: selectedSource === source.id ? currentTheme.colors.primary : currentTheme.colors.text 
                            }
                          ]}
                        >
                          {source.name}
                        </Text>
                        {source.type === 'addon' && source.hasMetaSupport && (
                          <Text style={[styles.sourceDescription, { color: currentTheme.colors.textMuted }]}>
                            Stremio Addon with metadata support
                          </Text>
                        )}
                        {source.type === 'tmdb' && (
                          <Text style={[styles.sourceDescription, { color: currentTheme.colors.textMuted }]}>
                            Comprehensive movie and TV database
                          </Text>
                        )}
                        {source.id === 'auto' && (
                          <Text style={[styles.sourceDescription, { color: currentTheme.colors.textMuted }]}>
                            Automatically selects the best available source
                          </Text>
                        )}
                      </View>
                    </View>
                    {selectedSource === source.id && (
                      <View style={styles.checkContainer}>
                        <MaterialIcons 
                          name="check-circle" 
                          size={24} 
                          color={currentTheme.colors.primary} 
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  disabled: {
    opacity: 0.5,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectorText: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 380,
    maxHeight: '75%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  sourcesList: {
    maxHeight: 350,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  sourceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sourceInfo: {
    marginLeft: 16,
    flex: 1,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  sourceDescription: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  checkContainer: {
    padding: 4,
  },
  complementaryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  toggleText: {
    marginLeft: 16,
    flex: 1,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleDescription: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});

export default MetadataSourceSelector;