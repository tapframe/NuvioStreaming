import { useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Stream } from '../types/metadata';
import { logger } from '../utils/logger';

interface UseStreamNavigationProps {
  metadata: {
    name?: string;
    year?: number;
  } | null;
  currentEpisode?: {
    name?: string;
    season_number?: number;
    episode_number?: number;
  } | null;
  id: string;
  type: string;
  selectedEpisode?: string;
  useExternalPlayer?: boolean;
  preferredPlayer?: 'internal' | 'vlc' | 'outplayer' | 'infuse' | 'vidhub' | 'external';
}

export const useStreamNavigation = ({
  metadata,
  currentEpisode,
  id,
  type,
  selectedEpisode,
  useExternalPlayer,
  preferredPlayer
}: UseStreamNavigationProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const navigateToPlayer = useCallback((stream: Stream) => {
    navigation.navigate('Player', {
      uri: stream.url,
      title: metadata?.name || '',
      episodeTitle: type === 'series' ? currentEpisode?.name : undefined,
      season: type === 'series' ? currentEpisode?.season_number : undefined,
      episode: type === 'series' ? currentEpisode?.episode_number : undefined,
      quality: stream.title?.match(/(\d+)p/)?.[1] || undefined,
      year: metadata?.year,
      streamProvider: stream.name,
      id,
      type,
      episodeId: type === 'series' && selectedEpisode ? selectedEpisode : undefined
    });
  }, [metadata, type, currentEpisode, navigation, id, selectedEpisode]);

  const handleStreamPress = useCallback(async (stream: Stream) => {
    try {
      if (stream.url) {
        logger.log('handleStreamPress called with stream:', {
          url: stream.url,
          behaviorHints: stream.behaviorHints,
          useExternalPlayer,
          preferredPlayer
        });
        
        // For iOS, try to open with the preferred external player
        if (Platform.OS === 'ios' && preferredPlayer !== 'internal') {
          try {
            // Format the URL for the selected player
            const streamUrl = encodeURIComponent(stream.url);
            let externalPlayerUrls: string[] = [];
            
            // Configure URL formats based on the selected player
            switch (preferredPlayer) {
              case 'vlc':
                externalPlayerUrls = [
                  `vlc://${stream.url}`,
                  `vlc-x-callback://x-callback-url/stream?url=${streamUrl}`,
                  `vlc://${streamUrl}`
                ];
                break;
                
              case 'outplayer':
                externalPlayerUrls = [
                  `outplayer://${stream.url}`,
                  `outplayer://${streamUrl}`,
                  `outplayer://play?url=${streamUrl}`,
                  `outplayer://stream?url=${streamUrl}`,
                  `outplayer://play/browser?url=${streamUrl}`
                ];
                break;
                
              case 'infuse':
                externalPlayerUrls = [
                  `infuse://x-callback-url/play?url=${streamUrl}`,
                  `infuse://play?url=${streamUrl}`,
                  `infuse://${streamUrl}`
                ];
                break;
                
              case 'vidhub':
                externalPlayerUrls = [
                  `vidhub://play?url=${streamUrl}`,
                  `vidhub://${streamUrl}`
                ];
                break;
                
              default:
                // If no matching player or the setting is somehow invalid, use internal player
                navigateToPlayer(stream);
                return;
            }
            
            console.log(`Attempting to open stream in ${preferredPlayer}`);
            
            // Try each URL format in sequence
            const tryNextUrl = (index: number) => {
              if (index >= externalPlayerUrls.length) {
                console.log(`All ${preferredPlayer} formats failed, falling back to direct URL`);
                // Try direct URL as last resort
                Linking.openURL(stream.url)
                  .then(() => console.log('Opened with direct URL'))
                  .catch(() => {
                    console.log('Direct URL failed, falling back to built-in player');
                    navigateToPlayer(stream);
                  });
                return;
              }
              
              const url = externalPlayerUrls[index];
              console.log(`Trying ${preferredPlayer} URL format ${index + 1}: ${url}`);
              
              Linking.openURL(url)
                .then(() => console.log(`Successfully opened stream with ${preferredPlayer} format ${index + 1}`))
                .catch(err => {
                  console.log(`Format ${index + 1} failed: ${err.message}`, err);
                  tryNextUrl(index + 1);
                });
            };
            
            // Start with the first URL format
            tryNextUrl(0);
            
          } catch (error) {
            console.error(`Error with ${preferredPlayer}:`, error);
            // Fallback to the built-in player
            navigateToPlayer(stream);
          }
        } 
        // For Android with external player preference
        else if (Platform.OS === 'android' && useExternalPlayer) {
          try {
            console.log('Opening stream with Android native app chooser');
            
            // For Android, determine if the URL is a direct http/https URL or a magnet link
            const isMagnet = stream.url.startsWith('magnet:');
            
            if (isMagnet) {
              // For magnet links, open directly which will trigger the torrent app chooser
              console.log('Opening magnet link directly');
              Linking.openURL(stream.url)
                .then(() => console.log('Successfully opened magnet link'))
                .catch(err => {
                  console.error('Failed to open magnet link:', err);
                  // No good fallback for magnet links
                  navigateToPlayer(stream);
                });
            } else {
              // For direct video URLs, use the S.Browser.ACTION_VIEW approach
              // This is a more reliable way to force Android to show all video apps
              
              // Strip query parameters if they exist as they can cause issues with some apps
              let cleanUrl = stream.url;
              if (cleanUrl.includes('?')) {
                cleanUrl = cleanUrl.split('?')[0];
              }
              
              // Create an Android intent URL that forces the chooser
              // Set component=null to ensure chooser is shown
              // Set action=android.intent.action.VIEW to open the content
              const intentUrl = `intent:${cleanUrl}#Intent;action=android.intent.action.VIEW;category=android.intent.category.DEFAULT;component=;type=video/*;launchFlags=0x10000000;end`;
              
              console.log(`Using intent URL: ${intentUrl}`);
              
              Linking.openURL(intentUrl)
                .then(() => console.log('Successfully opened with intent URL'))
                .catch(err => {
                  console.error('Failed to open with intent URL:', err);
                  
                  // First fallback: Try direct URL with regular Linking API
                  console.log('Trying plain URL as fallback');
                  Linking.openURL(stream.url)
                    .then(() => console.log('Opened with direct URL'))
                    .catch(directErr => {
                      console.error('Failed to open direct URL:', directErr);
                      
                      // Final fallback: Use built-in player
                      console.log('All external player attempts failed, using built-in player');
                      navigateToPlayer(stream);
                    });
                });
            }
          } catch (error) {
            console.error('Error with external player:', error);
            // Fallback to the built-in player
            navigateToPlayer(stream);
          }
        }
        else {
          // For internal player or if other options failed, use the built-in player
          navigateToPlayer(stream);
        }
      }
    } catch (error) {
      console.error('Error in handleStreamPress:', error);
      // Final fallback: Use built-in player
      navigateToPlayer(stream);
    }
  }, [navigateToPlayer, preferredPlayer, useExternalPlayer]);

  return {
    handleStreamPress,
    navigateToPlayer
  };
}; 