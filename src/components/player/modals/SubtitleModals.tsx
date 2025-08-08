import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { styles } from '../utils/playerStyles';
import { WyzieSubtitle, SubtitleCue } from '../utils/playerTypes';
import { getTrackDisplayName, formatLanguage } from '../utils/playerUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface SubtitleModalsProps {
  showSubtitleModal: boolean;
  setShowSubtitleModal: (show: boolean) => void;
  showSubtitleLanguageModal: boolean;
  setShowSubtitleLanguageModal: (show: boolean) => void;
  isLoadingSubtitleList: boolean;
  isLoadingSubtitles: boolean;
  customSubtitles: SubtitleCue[];
  availableSubtitles: WyzieSubtitle[];
  vlcTextTracks: Array<{id: number, name: string, language?: string}>;
  selectedTextTrack: number;
  useCustomSubtitles: boolean;
  subtitleSize: number;
  subtitleBackground: boolean;
  fetchAvailableSubtitles: () => void;
  loadWyzieSubtitle: (subtitle: WyzieSubtitle) => void;
  selectTextTrack: (trackId: number) => void;
  increaseSubtitleSize: () => void;
  decreaseSubtitleSize: () => void;
  toggleSubtitleBackground: () => void;
  // Customization props
  subtitleTextColor: string;
  setSubtitleTextColor: (c: string) => void;
  subtitleBgOpacity: number;
  setSubtitleBgOpacity: (o: number) => void;
  subtitleTextShadow: boolean;
  setSubtitleTextShadow: (b: boolean) => void;
  subtitleOutline: boolean;
  setSubtitleOutline: (b: boolean) => void;
  subtitleOutlineColor: string;
  setSubtitleOutlineColor: (c: string) => void;
  subtitleOutlineWidth: number;
  setSubtitleOutlineWidth: (n: number) => void;
  subtitleAlign: 'center' | 'left' | 'right';
  setSubtitleAlign: (a: 'center' | 'left' | 'right') => void;
  subtitleBottomOffset: number;
  setSubtitleBottomOffset: (n: number) => void;
  subtitleLetterSpacing: number;
  setSubtitleLetterSpacing: (n: number) => void;
  subtitleLineHeightMultiplier: number;
  setSubtitleLineHeightMultiplier: (n: number) => void;
  subtitleOffsetSec: number;
  setSubtitleOffsetSec: (n: number) => void;
}

// Dynamic sizing handled inside component with useWindowDimensions

export const SubtitleModals: React.FC<SubtitleModalsProps> = ({
  showSubtitleModal,
  setShowSubtitleModal,
  showSubtitleLanguageModal,
  setShowSubtitleLanguageModal,
  isLoadingSubtitleList,
  isLoadingSubtitles,
  customSubtitles,
  availableSubtitles,
  vlcTextTracks,
  selectedTextTrack,
  useCustomSubtitles,
  subtitleSize,
  subtitleBackground,
  fetchAvailableSubtitles,
  loadWyzieSubtitle,
  selectTextTrack,
  increaseSubtitleSize,
  decreaseSubtitleSize,
  toggleSubtitleBackground,
  subtitleTextColor,
  setSubtitleTextColor,
  subtitleBgOpacity,
  setSubtitleBgOpacity,
  subtitleTextShadow,
  setSubtitleTextShadow,
  subtitleOutline,
  setSubtitleOutline,
  subtitleOutlineColor,
  setSubtitleOutlineColor,
  subtitleOutlineWidth,
  setSubtitleOutlineWidth,
  subtitleAlign,
  setSubtitleAlign,
  subtitleBottomOffset,
  setSubtitleBottomOffset,
  subtitleLetterSpacing,
  setSubtitleLetterSpacing,
  subtitleLineHeightMultiplier,
  setSubtitleLineHeightMultiplier,
  subtitleOffsetSec,
  setSubtitleOffsetSec,
}) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isIos = Platform.OS === 'ios';
  const isLandscape = width > height;
  // Track which specific addon subtitle is currently loaded
  const [selectedOnlineSubtitleId, setSelectedOnlineSubtitleId] = React.useState<string | null>(null);
  // Track which addon subtitle is currently loading to show spinner per-item
  const [loadingSubtitleId, setLoadingSubtitleId] = React.useState<string | null>(null);
  // Active tab for better organization
  const [activeTab, setActiveTab] = React.useState<'built-in' | 'addon' | 'appearance'>(useCustomSubtitles ? 'addon' : 'built-in');
  // Responsive tuning
  const isCompact = width < 360 || height < 640;
  const sectionPad = isCompact ? 12 : 16;
  const chipPadH = isCompact ? 8 : 12;
  const chipPadV = isCompact ? 6 : 8;
  const controlBtn = { size: isCompact ? 28 : 32, radius: isCompact ? 14 : 16 };
  const previewHeight = isCompact ? 90 : (isIos && isLandscape ? 100 : 120);
  const menuWidth = Math.min(
    width * (isIos ? (isLandscape ? 0.6 : 0.8) : 0.85),
    isIos ? 420 : 400
  );
 
  React.useEffect(() => {
    if (showSubtitleModal && !isLoadingSubtitleList && availableSubtitles.length === 0) {
      fetchAvailableSubtitles();
    }
  }, [showSubtitleModal]);

  // Reset selected addon subtitle when switching to built-in tracks
  React.useEffect(() => {
    if (!useCustomSubtitles) {
      setSelectedOnlineSubtitleId(null);
    }
  }, [useCustomSubtitles]);

  // Clear loading state when subtitles have finished loading
  React.useEffect(() => {
    if (!isLoadingSubtitles) {
      setLoadingSubtitleId(null);
    }
  }, [isLoadingSubtitles]);

  // Keep tab in sync with current usage
  React.useEffect(() => {
    setActiveTab(useCustomSubtitles ? 'addon' : 'built-in');
  }, [useCustomSubtitles]);

  const handleClose = () => {
    setShowSubtitleModal(false);
  };

  const handleLoadWyzieSubtitle = (subtitle: WyzieSubtitle) => {
    setSelectedOnlineSubtitleId(subtitle.id);
    setLoadingSubtitleId(subtitle.id);
    loadWyzieSubtitle(subtitle);
  };

  // Main subtitle menu
  const renderSubtitleMenu = () => {
    if (!showSubtitleModal) return null;
    
    return (
      <>
        {/* Backdrop */}
        <Animated.View 
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9998,
          }}
        >
          <TouchableOpacity 
            style={{ flex: 1 }}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>

        {/* Side Menu */}
        <Animated.View
          entering={SlideInRight.duration(300)}
          exiting={SlideOutRight.duration(250)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: menuWidth,
            backgroundColor: '#1A1A1A',
            zIndex: 9999,
            elevation: 20,
            shadowColor: '#000',
            shadowOffset: { width: -5, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 10,
            borderTopLeftRadius: 20,
            borderBottomLeftRadius: 20,
            paddingRight: 0,
          }}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: insets.top + (isCompact ? 8 : 12),
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255, 255, 255, 0.08)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700' }}>Subtitles</Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: useCustomSubtitles ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)' }}>
                <Text style={{ color: useCustomSubtitles ? '#22C55E' : '#3B82F6', fontSize: 11, fontWeight: '700' }}>
                  {useCustomSubtitles ? 'Addon in use' : 'Built‑in in use'}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Segmented Tabs */}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
            {([
              { key: 'built-in', label: 'Built‑in' },
              { key: 'addon', label: 'Addons' },
              { key: 'appearance', label: 'Appearance' },
            ] as const).map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  paddingHorizontal: chipPadH,
                  paddingVertical: chipPadV,
                  borderRadius: 16,
                  backgroundColor: activeTab === tab.key ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: activeTab === tab.key ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: isCompact ? 12 : 13 }}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView 
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: (isCompact ? 24 : 40) + (isIos ? insets.bottom : 0) }}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'built-in' && (
              <View style={{ marginBottom: 30 }}>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 14,
                  fontWeight: '600',
                  marginBottom: 15,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  Built-in Subtitles
                </Text>
                
                <View style={{ gap: 8 }}>
                  {vlcTextTracks.map((track) => {
                    const isSelected = selectedTextTrack === track.id && !useCustomSubtitles;
                    return (
                      <TouchableOpacity
                        key={track.id}
                        style={{
                          backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 16,
                          padding: sectionPad,
                          borderWidth: 1,
                          borderColor: isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                        }}
                        onPress={() => {
                          selectTextTrack(track.id);
                          setSelectedOnlineSubtitleId(null);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{
                            color: '#FFFFFF',
                            fontSize: isCompact ? 14 : 15,
                            fontWeight: '500',
                            flex: 1,
                          }}>
                            {getTrackDisplayName(track)}
                          </Text>
                          {isSelected && (
                            <MaterialIcons name="check" size={20} color="#3B82F6" />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {activeTab === 'addon' && (
            <View style={{ marginBottom: 30 }}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 15,
              }}>
                <Text style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: isCompact ? 13 : 14,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  Addon Subtitles
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    borderRadius: 12,
                    paddingHorizontal: chipPadH,
                    paddingVertical: chipPadV-2,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                  onPress={() => fetchAvailableSubtitles()}
                  disabled={isLoadingSubtitleList}
                >
                  {isLoadingSubtitleList ? (
                    <ActivityIndicator size="small" color="#22C55E" />
                  ) : (
                    <MaterialIcons name="refresh" size={16} color="#22C55E" />
                  )}
                  <Text style={{
                    color: '#22C55E',
                    fontSize: isCompact ? 11 : 12,
                    fontWeight: '600',
                    marginLeft: 6,
                  }}>
                    {isLoadingSubtitleList ? 'Searching' : 'Refresh'}
                  </Text>
                </TouchableOpacity>
              </View>

              {(availableSubtitles.length === 0) && !isLoadingSubtitleList ? (
                <TouchableOpacity
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: 16,
                    padding: isCompact ? 14 : 20,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderStyle: 'dashed',
                  }}
                  onPress={() => fetchAvailableSubtitles()}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="cloud-download" size={24} color="rgba(255,255,255,0.4)" />
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: isCompact ? 13 : 14,
                    marginTop: 8,
                    textAlign: 'center',
                  }}>
                    Tap to fetch from addons
                  </Text>
                </TouchableOpacity>
              ) : isLoadingSubtitleList ? (
                <View style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 16,
                  padding: isCompact ? 14 : 20,
                  alignItems: 'center',
                }}>
                  <ActivityIndicator size="large" color="#22C55E" />
                  <Text style={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    fontSize: isCompact ? 13 : 14,
                    marginTop: 12,
                  }}>
                    Searching...
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {availableSubtitles.map((sub) => {
                    const isSelected = useCustomSubtitles && selectedOnlineSubtitleId === sub.id;
                    return (
                      <TouchableOpacity
                        key={sub.id}
                        style={{
                          backgroundColor: isSelected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                          borderRadius: 16,
                          padding: sectionPad,
                          borderWidth: 1,
                          borderColor: isSelected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                        }}
                        onPress={() => {
                          handleLoadWyzieSubtitle(sub);
                        }}
                        activeOpacity={0.7}
                        disabled={isLoadingSubtitles}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '500', marginBottom: 4 }}>
                              {sub.display}
                            </Text>
                            <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13 }}>
                              {formatLanguage(sub.language)}{sub.source ? ` · ${sub.source}` : ''}
                            </Text>
                          </View>
                          {(isLoadingSubtitles && loadingSubtitleId === sub.id) ? (
                            <ActivityIndicator size="small" color="#22C55E" />
                          ) : isSelected ? (
                            <MaterialIcons name="check" size={20} color="#22C55E" />
                          ) : (
                            <MaterialIcons name="download" size={20} color="rgba(255,255,255,0.4)" />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
            )}

            {activeTab === 'appearance' && (
              <View style={{ gap: isCompact ? 12 : 16, paddingBottom: 8 }}>
                {/* Live Preview */}
                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: sectionPad }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <MaterialIcons name="visibility" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginLeft: 6, fontWeight: '600' }}>Preview</Text>
                  </View>
                  <View style={{ height: previewHeight, justifyContent: 'flex-end' }}>
                    <View style={{ alignItems: subtitleAlign === 'center' ? 'center' : subtitleAlign === 'left' ? 'flex-start' : 'flex-end', marginBottom: Math.min(80, subtitleBottomOffset) }}>
                      <View style={{
                        backgroundColor: subtitleBackground ? `rgba(0,0,0,${subtitleBgOpacity})` : 'transparent',
                        borderRadius: 8,
                        paddingHorizontal: isCompact ? 10 : 12,
                        paddingVertical: isCompact ? 6 : 8,
                      }}>
                        <Text style={{
                          color: subtitleTextColor,
                          fontSize: subtitleSize,
                          letterSpacing: subtitleLetterSpacing,
                          lineHeight: subtitleSize * subtitleLineHeightMultiplier,
                          textAlign: subtitleAlign,
                          textShadowColor: subtitleOutline
                            ? subtitleOutlineColor
                            : (subtitleTextShadow ? 'rgba(0,0,0,0.9)' : undefined),
                          textShadowOffset: (subtitleOutline || subtitleTextShadow) ? { width: 2, height: 2 } : undefined,
                          textShadowRadius: subtitleOutline ? Math.max(1, subtitleOutlineWidth) : (subtitleTextShadow ? 4 : undefined),
                        }}>
                          The quick brown fox jumps over the lazy dog.
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Quick Presets */}
                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: sectionPad }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <MaterialIcons name="star" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginLeft: 6, fontWeight: '600' }}>Quick Presets</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setSubtitleTextColor('#FFFFFF');
                        setSubtitleBgOpacity(0.7);
                        setSubtitleTextShadow(true);
                        setSubtitleOutline(false);
                        setSubtitleOutlineColor('#000000');
                        setSubtitleOutlineWidth(2);
                        setSubtitleAlign('center');
                        setSubtitleBottomOffset(20);
                        setSubtitleLetterSpacing(0);
                        setSubtitleLineHeightMultiplier(1.2);
                      }}
                      style={{ paddingHorizontal: chipPadH, paddingVertical: chipPadV, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: isCompact ? 11 : 12 }}>Default</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setSubtitleTextColor('#FFD700');
                        setSubtitleOutline(true);
                        setSubtitleOutlineColor('#000000');
                        setSubtitleOutlineWidth(2);
                        setSubtitleBgOpacity(0.3);
                        setSubtitleTextShadow(false);
                      }}
                      style={{ paddingHorizontal: chipPadH, paddingVertical: chipPadV, borderRadius: 20, backgroundColor: 'rgba(255,215,0,0.12)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)' }}
                    >
                      <Text style={{ color: '#FFD700', fontWeight: '700', fontSize: isCompact ? 11 : 12 }}>Yellow</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setSubtitleTextColor('#FFFFFF');
                        setSubtitleOutline(true);
                        setSubtitleOutlineColor('#000000');
                        setSubtitleOutlineWidth(3);
                        setSubtitleBgOpacity(0.0);
                        setSubtitleTextShadow(false);
                        setSubtitleLetterSpacing(0.5);
                      }}
                      style={{ paddingHorizontal: chipPadH, paddingVertical: chipPadV, borderRadius: 20, backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.35)' }}
                    >
                      <Text style={{ color: '#22C55E', fontWeight: '700', fontSize: isCompact ? 11 : 12 }}>High Contrast</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setSubtitleTextColor('#FFFFFF');
                        setSubtitleBgOpacity(0.6);
                        setSubtitleTextShadow(true);
                        setSubtitleOutline(false);
                        setSubtitleAlign('center');
                        setSubtitleLineHeightMultiplier(1.3);
                      }}
                      style={{ paddingHorizontal: chipPadH, paddingVertical: chipPadV, borderRadius: 20, backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)' }}
                    >
                      <Text style={{ color: '#3B82F6', fontWeight: '700', fontSize: isCompact ? 11 : 12 }}>Large</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Core controls */}
                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: sectionPad, gap: isCompact ? 10 : 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                    <MaterialIcons name="tune" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginLeft: 6, fontWeight: '600' }}>Core</Text>
                  </View>
                  {/* Font Size */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="format-size" size={16} color="rgba(255,255,255,0.7)" />
                      <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>Font Size</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity onPress={decreaseSubtitleSize} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialIcons name="remove" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                      <View style={{ minWidth: 42, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>{subtitleSize}</Text>
                      </View>
                      <TouchableOpacity onPress={increaseSubtitleSize} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' }}>
                        <MaterialIcons name="add" size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Background toggle */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="layers" size={16} color="rgba(255,255,255,0.7)" />
                      <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>Show Background</Text>
                    </View>
                    <TouchableOpacity
                      style={{ width: isCompact ? 48 : 54, height: isCompact ? 28 : 30, backgroundColor: subtitleBackground ? '#22C55E' : 'rgba(255,255,255,0.25)', borderRadius: 15, justifyContent: 'center', alignItems: subtitleBackground ? 'flex-end' : 'flex-start', paddingHorizontal: 3 }}
                      onPress={toggleSubtitleBackground}
                    >
                      <View style={{ width: 24, height: 24, backgroundColor: 'white', borderRadius: 12 }} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Advanced controls */}
                <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: sectionPad, gap: isCompact ? 10 : 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="build" size={16} color="rgba(255,255,255,0.7)" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginLeft: 6, fontWeight: '600' }}>Advanced</Text>
                  </View>

                  {/* Text Color */}
                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="palette" size={16} color="rgba(255,255,255,0.7)" />
                      <Text style={{ color: 'white', marginLeft: 8, fontWeight: '600' }}>Text Color</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                      {['#FFFFFF', '#FFD700', '#00E5FF', '#FF5C5C', '#00FF88', '#9b59b6', '#f97316'].map(c => (
                        <TouchableOpacity key={c} onPress={() => setSubtitleTextColor(c)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: 2, borderColor: subtitleTextColor === c ? '#fff' : 'rgba(255,255,255,0.3)' }} />
                      ))}
                    </View>
                  </View>

                  {/* Align */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'white', fontWeight: '600' }}>Align</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([
                        { key: 'left', icon: 'format-align-left' },
                        { key: 'center', icon: 'format-align-center' },
                        { key: 'right', icon: 'format-align-right' },
                      ] as const).map(a => (
                        <TouchableOpacity
                          key={a.key}
                          onPress={() => setSubtitleAlign(a.key)}
                          style={{ paddingHorizontal: isCompact ? 8 : 10, paddingVertical: isCompact ? 4 : 6, borderRadius: 8, backgroundColor: subtitleAlign === a.key ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
                        >
                          <MaterialIcons name={a.icon as any} size={18} color="#FFFFFF" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Bottom Offset */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'white', fontWeight: '600' }}>Bottom Offset</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => setSubtitleBottomOffset(Math.max(0, subtitleBottomOffset - 5))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="keyboard-arrow-down" color="#fff" size={20} />
                      </TouchableOpacity>
                      <View style={{ minWidth: 46, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>{subtitleBottomOffset}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setSubtitleBottomOffset(subtitleBottomOffset + 5)} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="keyboard-arrow-up" color="#fff" size={20} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Background Opacity */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'white', fontWeight: '600' }}>Background Opacity</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => setSubtitleBgOpacity(Math.max(0, +(subtitleBgOpacity - 0.1).toFixed(1)))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="remove" color="#fff" size={18} />
                      </TouchableOpacity>
                      <View style={{ minWidth: 48, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>{subtitleBgOpacity.toFixed(1)}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setSubtitleBgOpacity(Math.min(1, +(subtitleBgOpacity + 0.1).toFixed(1)))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="add" color="#fff" size={18} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Shadow & Outline */}
                  <View style={{ flexDirection: isCompact ? 'column' : 'row', justifyContent: 'space-between', gap: 12 }}>
                    {/* Shadow */}
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={{ color: 'white', fontWeight: '600' }}>Text Shadow</Text>
                      <TouchableOpacity onPress={() => setSubtitleTextShadow(!subtitleTextShadow)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: subtitleTextShadow ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{subtitleTextShadow ? 'On' : 'Off'}</Text>
                      </TouchableOpacity>
                    </View>
                    {/* Outline */}
                    <View style={{ flex: 1, gap: 8 }}>
                      <Text style={{ color: 'white', fontWeight: '600' }}>Outline</Text>
                      <TouchableOpacity onPress={() => setSubtitleOutline(!subtitleOutline)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: subtitleOutline ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center' }}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{subtitleOutline ? 'On' : 'Off'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Outline color & width */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'white' }}>Outline Color</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {['#000000', '#FFFFFF', '#00E5FF', '#FF5C5C'].map(c => (
                        <TouchableOpacity key={c} onPress={() => setSubtitleOutlineColor(c)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, borderWidth: 2, borderColor: subtitleOutlineColor === c ? '#fff' : 'rgba(255,255,255,0.3)' }} />
                      ))}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: 'white' }}>Outline Width</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TouchableOpacity onPress={() => setSubtitleOutlineWidth(Math.max(0, subtitleOutlineWidth - 1))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="remove" color="#fff" size={18} />
                      </TouchableOpacity>
                      <View style={{ minWidth: 42, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                        <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>{subtitleOutlineWidth}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setSubtitleOutlineWidth(subtitleOutlineWidth + 1)} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="add" color="#fff" size={18} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Spacing (two columns) */}
                  <View style={{ flexDirection: isCompact ? 'column' : 'row', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: 'white', fontWeight: '600' }}>Letter Spacing</Text>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity onPress={() => setSubtitleLetterSpacing(Math.max(0, +(subtitleLetterSpacing - 0.5).toFixed(1)))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="remove" color="#fff" size={18} />
                        </TouchableOpacity>
                        <View style={{ minWidth: 48, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>{subtitleLetterSpacing.toFixed(1)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSubtitleLetterSpacing(+(subtitleLetterSpacing + 0.5).toFixed(1))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="add" color="#fff" size={18} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: 'white', fontWeight: '600' }}>Line Height</Text>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity onPress={() => setSubtitleLineHeightMultiplier(Math.max(1, +(subtitleLineHeightMultiplier - 0.1).toFixed(1)))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="remove" color="#fff" size={18} />
                        </TouchableOpacity>
                        <View style={{ minWidth: 48, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>{subtitleLineHeightMultiplier.toFixed(1)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSubtitleLineHeightMultiplier(+(subtitleLineHeightMultiplier + 0.1).toFixed(1))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="add" color="#fff" size={18} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Timing Offset */}
                  <View style={{ marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: 'white', fontWeight: '600' }}>Timing Offset (s)</Text>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => setSubtitleOffsetSec(+(subtitleOffsetSec - 0.1).toFixed(1))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="remove" color="#fff" size={18} />
                        </TouchableOpacity>
                        <View style={{ minWidth: 60, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                          <Text style={{ color: 'white', textAlign: 'center', fontWeight: '700' }}>{subtitleOffsetSec.toFixed(1)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setSubtitleOffsetSec(+(subtitleOffsetSec + 0.1).toFixed(1))} style={{ width: controlBtn.size, height: controlBtn.size, borderRadius: controlBtn.radius, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="add" color="#fff" size={18} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 6 }}>Nudge subtitles earlier (-) or later (+) to sync if needed.</Text>
                  </View>

                  {/* Reset to defaults */}
                  <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setSubtitleTextColor('#FFFFFF');
                        setSubtitleBgOpacity(0.7);
                        setSubtitleTextShadow(true);
                        setSubtitleOutline(false);
                        setSubtitleOutlineColor('#000000');
                        setSubtitleOutlineWidth(2);
                        setSubtitleAlign('center');
                        setSubtitleBottomOffset(20);
                        setSubtitleLetterSpacing(0);
                        setSubtitleLineHeightMultiplier(1.2);
                        setSubtitleOffsetSec(0);
                      }}
                      style={{ paddingHorizontal: chipPadH, paddingVertical: chipPadV, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: isCompact ? 12 : 14 }}>Reset to defaults</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

          </ScrollView>
        </Animated.View>
      </>
    );
  };

  return (
    <>
      {renderSubtitleMenu()}
    </>
  );
};

export default SubtitleModals; 