import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
}

const MetadataSourceSelector: React.FC<MetadataSourceSelectorProps> = ({
  currentSource,
  contentId,
  contentType,
  onSourceChange,
  disabled = false,
}) => {
  const { currentTheme } = useTheme();
  const [isVisible, setIsVisible] = useState(false);
  const [sources, setSources] = useState<MetadataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>(currentSource || 'auto');

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
    setSelectedSource(source.id);
    setIsVisible(false);
    onSourceChange(source.id, source.type);
  }, [onSourceChange]);

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
          onPress={() => !disabled && setIsVisible(true)}
          disabled={disabled}
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
        onRequestClose={() => setIsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: currentTheme.colors.elevation2 }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: currentTheme.colors.text }]}>
                Select Metadata Source
              </Text>
              <TouchableOpacity
                onPress={() => setIsVisible(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={24} color={currentTheme.colors.textMuted} />
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
                      { borderBottomColor: currentTheme.colors.border },
                      selectedSource === source.id && {
                        backgroundColor: currentTheme.colors.primary + '20',
                      }
                    ]}
                    onPress={() => handleSourceSelect(source)}
                  >
                    <View style={styles.sourceContent}>
                      <MaterialIcons 
                        name={getSourceIcon(source)} 
                        size={24} 
                        color={selectedSource === source.id ? currentTheme.colors.primary : currentTheme.colors.text} 
                      />
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
                      <MaterialIcons 
                        name="check" 
                        size={20} 
                        color={currentTheme.colors.primary} 
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
  },
  sourcesList: {
    maxHeight: 400,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  sourceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sourceInfo: {
    marginLeft: 12,
    flex: 1,
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  sourceDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
});

export default MetadataSourceSelector;