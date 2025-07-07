import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  Dimensions,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pluginManager } from '../services/PluginManager';
import { SettingItem, SettingsCard } from './SettingsScreen'; // Assuming these are exported

const { width } = Dimensions.get('window');

interface LoadedPlugin {
  name: string;
  version: string;
  sourceUrl?: string;
}

const PluginsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const [pluginUrl, setPluginUrl] = useState('');
  const [loadedPlugins, setLoadedPlugins] = useState<LoadedPlugin[]>([]);
  const [isLoadingPlugin, setIsLoadingPlugin] = useState(false);

  const refreshPluginsList = useCallback(() => {
    const plugins = pluginManager.getScraperPlugins();
    setLoadedPlugins(
      plugins.map(p => ({
        name: p.name,
        version: p.version,
        sourceUrl: p.sourceUrl,
      }))
    );
  }, []);

  useEffect(() => {
    refreshPluginsList();
  }, [refreshPluginsList]);

  const handleLoadPlugin = useCallback(async () => {
    if (!pluginUrl.trim() || !pluginUrl.startsWith('http')) {
      Alert.alert('Invalid URL', 'Please enter a valid plugin URL.');
      return;
    }
    setIsLoadingPlugin(true);
    const success = await pluginManager.loadPluginFromUrl(pluginUrl.trim());
    setIsLoadingPlugin(false);
    if (success) {
      Alert.alert('Success', 'Plugin loaded successfully.');
      setPluginUrl('');
      refreshPluginsList();
    } else {
      Alert.alert(
        'Error',
        'Failed to load the plugin. Check the URL and console for errors.'
      );
    }
  }, [pluginUrl, refreshPluginsList]);

  const handleRemovePlugin = useCallback(
    (sourceUrl: string) => {
      if (!sourceUrl) return;
      Alert.alert(
        'Remove Plugin',
        'Are you sure you want to remove this plugin?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              pluginManager.removePlugin(sourceUrl);
              refreshPluginsList();
            },
          },
        ]
      );
    },
    [refreshPluginsList]
  );

  const headerBaseHeight = Platform.OS === 'android' ? 80 : 60;
  const topSpacing = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : insets.top;
  const headerHeight = headerBaseHeight + topSpacing;

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle={'light-content'} />
      <View style={{ flex: 1 }}>
        <View style={[styles.header, { height: headerHeight, paddingTop: topSpacing }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
            Plugins
          </Text>
        </View>

        <View style={styles.contentContainer}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <SettingsCard title="Add Plugin">
              <View style={[styles.pluginInputContainer, { borderBottomColor: currentTheme.colors.elevation2 }]}>
                <TextInput
                  style={[styles.pluginInput, { color: currentTheme.colors.highEmphasis }]}
                  placeholder="Enter plugin URL..."
                  placeholderTextColor={currentTheme.colors.mediumEmphasis}
                  value={pluginUrl}
                  onChangeText={setPluginUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={handleLoadPlugin}
                />
                <TouchableOpacity
                  style={[styles.loadButton, { backgroundColor: isLoadingPlugin ? currentTheme.colors.mediumGray : currentTheme.colors.primary }]}
                  onPress={handleLoadPlugin}
                  disabled={isLoadingPlugin}
                >
                  {isLoadingPlugin ? (
                    <ActivityIndicator size="small" color={currentTheme.colors.white} />
                  ) : (
                    <Text style={[styles.loadButtonText, { color: currentTheme.colors.white }]}>Load</Text>
                  )}
                </TouchableOpacity>
              </View>
            </SettingsCard>

            <SettingsCard title="Loaded Scrapers">
              {loadedPlugins.length > 0 ? (
                loadedPlugins.map((plugin, index) => (
                  <SettingItem
                    key={plugin.sourceUrl || index}
                    icon="extension"
                    title={`${plugin.name} v${plugin.version}`}
                    description={plugin.sourceUrl ? 'External' : 'Built-in'}
                    isLast={index === loadedPlugins.length - 1}
                    renderControl={() =>
                      plugin.sourceUrl ? (
                        <TouchableOpacity onPress={() => handleRemovePlugin(plugin.sourceUrl!)} style={styles.removeButton}>
                          <MaterialIcons name="close" size={20} color={currentTheme.colors.warning} />
                        </TouchableOpacity>
                      ) : null
                    }
                  />
                ))
              ) : (
                <SettingItem
                  icon="extension"
                  title="No Custom Scrapers"
                  description="Add a plugin URL above to get started"
                  isLast={true}
                />
              )}
            </SettingsCard>
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Math.max(1, width * 0.05),
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 8,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  backButton: {
    position: 'absolute',
    left: Math.max(1, width * 0.05),
    bottom: 8,
    zIndex: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Math.min(24, width * 0.06),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  contentContainer: {
    flex: 1,
    zIndex: 1,
    width: '100%',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    paddingBottom: 100,
  },
  pluginInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  pluginInput: {
      flex: 1,
      fontSize: 16,
      paddingVertical: 10,
  },
  loadButton: {
      marginLeft: 12,
      paddingHorizontal: 16,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 80,
  },
  loadButtonText: {
      fontSize: 15,
      fontWeight: '600',
  },
  removeButton: {
    padding: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
});

export default PluginsScreen; 