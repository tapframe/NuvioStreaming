import { StyleSheet, Dimensions } from 'react-native';

const deviceWidth = Dimensions.get('window').width;
const BREAKPOINTS = { phone: 0, tablet: 768, largeTablet: 1024, tv: 1440 } as const;
const getDeviceType = (w: number) => {
  if (w >= BREAKPOINTS.tv) return 'tv';
  if (w >= BREAKPOINTS.largeTablet) return 'largeTablet';
  if (w >= BREAKPOINTS.tablet) return 'tablet';
  return 'phone';
};
const deviceType = getDeviceType(deviceWidth);
const isTablet = deviceType === 'tablet';
const isLargeTablet = deviceType === 'largeTablet';
const isTV = deviceType === 'tv';

// Scales for larger displays
const padH = isTV ? 28 : isLargeTablet ? 24 : isTablet ? 20 : 20;
const padV = isTV ? 24 : isLargeTablet ? 20 : isTablet ? 16 : 16;
const titleFont = isTV ? 28 : isLargeTablet ? 24 : isTablet ? 22 : 18;
const episodeInfoFont = isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 14;
const metadataFont = isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 12;
const qualityPadH = isTV ? 10 : isLargeTablet ? 9 : isTablet ? 8 : 8;
const qualityPadV = isTV ? 4 : isLargeTablet ? 3 : isTablet ? 3 : 2;
const qualityRadius = isTV ? 6 : isLargeTablet ? 5 : isTablet ? 4 : 4;
const qualityTextFont = isTV ? 13 : isLargeTablet ? 12 : isTablet ? 11 : 11;
const controlsGap = isTV ? 56 : isLargeTablet ? 48 : isTablet ? 44 : 40;
const controlsTranslateY = isTV ? -48 : isLargeTablet ? -42 : isTablet ? -36 : -30;
const skipTextFont = isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 12;
const sliderBottom = isTV ? 80 : isLargeTablet ? 70 : isTablet ? 65 : 55;
const progressTouchHeight = isTV ? 48 : isLargeTablet ? 44 : isTablet ? 40 : 40;
const progressBarHeight = isTV ? 6 : isLargeTablet ? 5 : isTablet ? 5 : 4;
const progressThumbSize = isTV ? 24 : isLargeTablet ? 20 : isTablet ? 18 : 16;
const progressThumbTop = isTV ? -10 : isLargeTablet ? -8 : isTablet ? -7 : -6;
const durationFont = isTV ? 14 : isLargeTablet ? 13 : isTablet ? 12 : 12;
const bottomButtonTextFont = isTV ? 16 : isLargeTablet ? 15 : isTablet ? 14 : 12;

export const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  controlsContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    margin: 0,
    padding: 0,
  },
  topGradient: {
    paddingTop: padV,
    paddingHorizontal: padH,
    paddingBottom: Math.max(10, Math.round(padV * 0.6)),
  },
  bottomGradient: {
    paddingBottom: padV,
    paddingHorizontal: padH,
    paddingTop: padV,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleSection: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    color: 'white',
    fontSize: titleFont,
    fontWeight: 'bold',
  },
  episodeInfo: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: episodeInfoFont,
    marginTop: 3,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    flexWrap: 'wrap',
  },
  metadataText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: metadataFont,
    marginRight: 8,
  },
  qualityBadge: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    paddingHorizontal: qualityPadH,
    paddingVertical: qualityPadV,
    borderRadius: qualityRadius,
    marginRight: 8,
    marginBottom: 4,
  },
  qualityText: {
    color: '#E50914',
    fontSize: qualityTextFont,
    fontWeight: 'bold',
  },
  providerText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  closeButton: {
    padding: 8,
  },
  
  
  /* CloudStream Style - Center Controls */
  controls: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    left: 0,
    right: 0,
    top: '50%',
    transform: [{ translateY: -50 }],
    paddingHorizontal: 20,
    zIndex: 1000,
  },
  
  /* CloudStream Style - Seek Buttons */
  seekButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  buttonCircle: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekNumberContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 50,
  },
  seekNumber: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '500',
    opacity: 1,
    textAlign: 'center',
    marginLeft: -7, // Adjusted for better centering with icon
  },
  
  /* CloudStream Style - Play Button */
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  skipText: {
    color: 'white',
    fontSize: skipTextFont,
    marginTop: 2,
  },
  playIcon: {
    color: '#FFFFFF',
    opacity: 1,
  },
  
  /* CloudStream Style - Arc Animations */
  arcContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  arcLeft: {
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
    position: 'absolute',
  },
  arcRight: {
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    borderTopColor: 'transparent',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    position: 'absolute',
  },
  playPressCircle: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },




  bottomControls: {
    gap: 12,
  },
  sliderContainer: {
    position: 'absolute',
    bottom: sliderBottom,
    left: 0,
    right: 0,
    paddingHorizontal: padH,
    zIndex: 1000,
  },
  progressTouchArea: {
    height: progressTouchHeight, // Increased touch area for larger displays
    justifyContent: 'center',
    width: '100%',
  },
  progressBarContainer: {
    height: progressBarHeight,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginHorizontal: 4,
    position: 'relative',
  },
  bufferProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#E50914',
    height: '100%',
  },
  progressThumb: {
    position: 'absolute',
    width: progressThumbSize,
    height: progressThumbSize,
    borderRadius: progressThumbSize / 2,
    backgroundColor: '#E50914',
    top: progressThumbTop, // Position to center on the progress bar
    marginLeft: -(progressThumbSize / 2), // Center the thumb horizontally
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
    zIndex: 10, // Ensure it appears above the progress bar
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  duration: {
    color: 'white',
    fontSize: durationFont,
    fontWeight: '500',
  },
  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bottomButtonText: {
    color: 'white',
    fontSize: bottomButtonTextFont,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '80%',
    maxHeight: '70%',
    backgroundColor: '#222',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  modalTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  trackList: {
    padding: 10,
  },
  trackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 5,
    marginVertical: 5,
  },
  selectedTrackItem: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
  },
  trackLabel: {
    color: 'white',
    fontSize: 16,
  },
  noTracksText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  enhancedModalContainer: {
    width: 300,
    maxHeight: '70%',
    backgroundColor: '#181818',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  enhancedModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  enhancedModalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  enhancedCloseButton: {
    padding: 4,
  },
  trackListScrollContainer: {
    maxHeight: 350,
  },
  trackListContainer: {
    padding: 6,
  },
  enhancedTrackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    marginVertical: 2,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  trackInfoContainer: {
    flex: 1,
    marginRight: 8,
  },
  trackPrimaryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  trackSecondaryText: {
    color: '#aaa',
    fontSize: 11,
    marginTop: 2,
  },
  selectedIndicatorContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyStateText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  resumeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  resumeContainer: {
    width: '80%',
    maxWidth: 500,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  resumeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  resumeIconContainer: {
    marginRight: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumeTextContainer: {
    flex: 1,
  },
  resumeTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  resumeInfo: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
  resumeProgressContainer: {
    marginTop: 12,
  },
  resumeProgressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  resumeProgressFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },
  resumeTimeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  resumeButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    gap: 12,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    minWidth: 110,
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 6,
  },
  resumeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  resumeFromButton: {
    backgroundColor: '#E50914',
  },
  rememberChoiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  rememberChoiceText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  resetPreferenceButton: {
    padding: 4,
  },
  resetPreferenceText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: 'bold',
  },
  openingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
    margin: 0,
    padding: 0,
  },
  openingContent: {
    padding: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
  },
  videoPlayerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 0,
    padding: 0,
  },
  subtitleSizeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
  },
  subtitleSizeLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  subtitleSizeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sizeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitleSizeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 40,
    textAlign: 'center',
  },
  customSubtitleContainer: {
    position: 'absolute',
    bottom: 20, // Position lower, closer to bottom
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 1500, // Higher z-index to appear above other elements
  },
  customSubtitleWrapper: {
    padding: 10,
    borderRadius: 5,
  },
  customSubtitleText: {
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
    lineHeight: undefined, // Let React Native calculate line height
    fontWeight: '500',
  },
  loadSubtitlesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderWidth: 1,
    borderColor: '#E50914',
  },
  loadSubtitlesText: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  disabledContainer: {
    opacity: 0.5,
  },
  disabledText: {
    color: '#666',
  },
  disabledButton: {
    backgroundColor: '#666',
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  noteText: {
    color: '#aaa',
    fontSize: 12,
    marginLeft: 5,
  },
  subtitleLanguageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  flagIcon: {
    width: 24,
    height: 18,
    marginRight: 12,
    borderRadius: 2,
  },
  modernModalContainer: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#181818',
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  modernModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modernModalTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modernCloseButton: {
    padding: 4,
  },
  modernTrackListScrollContainer: {
    maxHeight: 350,
  },
  modernTrackListContainer: {
    padding: 6,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sectionDescription: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 12,
  },
  trackIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTrackInfoContainer: {
    flex: 1,
    marginLeft: 10,
  },
  modernTrackPrimaryText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  modernTrackSecondaryText: {
    color: '#aaa',
    fontSize: 11,
    marginTop: 2,
  },
  modernSelectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernEmptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modernEmptyStateText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  searchSubtitlesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderWidth: 1,
    borderColor: '#E50914',
  },
  searchButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  searchSubtitlesText: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  modernSubtitleSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modernSizeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTrackItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  modernSelectedTrackItem: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  sizeDisplayContainer: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 20,
  },
  modernSubtitleSizeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sizeLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginTop: 2,
  },
  loadingCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 44,
    height: 44,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  // Sources Modal Styles
  sourcesModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sourcesContainer: {
    backgroundColor: 'rgba(20, 20, 20, 0.98)',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  sourcesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  sourcesTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourcesScrollView: {
    maxHeight: 400,
  },
  sourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 8,
  },
  currentSourceItem: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.5)',
  },
  sourceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sourceTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  sourceDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  sourceDetailText: {
    color: '#888',
    fontSize: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  currentStreamBadge: {
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  currentStreamText: {
    color: '#00FF00',
    fontSize: 11,
    fontWeight: 'bold',
  },
  switchingSourceOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  switchingContent: {
    alignItems: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.9)',
    padding: 30,
    borderRadius: 12,
    minWidth: 200,
  },
  switchingText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  // Additional SourcesModal styles
  sourceProviderSection: {
    marginBottom: 20,
  },
  sourceProviderTitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sourceStreamItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 8,
  },
  sourceStreamItemSelected: {
    backgroundColor: 'rgba(229, 9, 20, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.5)',
  },
  sourceStreamDetails: {
    flex: 1,
  },
  sourceStreamTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sourceStreamTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  sourceStreamTitleSelected: {
    color: '#E50914',
  },
  sourceStreamSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginBottom: 6,
  },
  sourceStreamMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  sourceChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  sourceChipText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
    fontWeight: 'bold',
  },
  debridChip: {
    backgroundColor: 'rgba(0, 255, 0, 0.2)',
  },
  hdrezkaChip: {
    backgroundColor: 'rgba(255, 165, 0, 0.2)',
  },
  sourceStreamAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Source Change Loading Overlay
  sourceChangeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5000,
  },
  sourceChangeContent: {
    alignItems: 'center',
    padding: 30,
  },
  sourceChangeText: {
    color: '#E50914',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
    textAlign: 'center',
  },
  sourceChangeSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
}); 