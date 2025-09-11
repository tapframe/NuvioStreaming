import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aiService, ChatMessage, ContentContext, createMovieContext, createEpisodeContext, generateConversationStarters } from '../services/aiService';
import { tmdbService } from '../services/tmdbService';
import Markdown from 'react-native-markdown-display';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring, 
  withTiming,
  interpolate,
  Extrapolate
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const isTablet = width >= 768;

type AIChatRouteParams = {
  AIChat: {
    contentId: string;
    contentType: 'movie' | 'series';
    episodeId?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    title: string;
  };
};

type AIChatScreenRouteProp = RouteProp<AIChatRouteParams, 'AIChat'>;

interface ChatBubbleProps {
  message: ChatMessage;
  isLast: boolean;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isLast }) => {
  const { currentTheme } = useTheme();
  const isUser = message.role === 'user';
  
  const bubbleAnimation = useSharedValue(0);
  
  useEffect(() => {
    bubbleAnimation.value = withSpring(1, { damping: 15, stiffness: 120 });
  }, []);
  
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: bubbleAnimation.value,
    transform: [
      {
        translateY: interpolate(
          bubbleAnimation.value,
          [0, 1],
          [20, 0],
          Extrapolate.CLAMP
        )
      },
      {
        scale: interpolate(
          bubbleAnimation.value,
          [0, 1],
          [0.8, 1],
          Extrapolate.CLAMP
        )
      }
    ]
  }));

  return (
    <Animated.View style={[
      styles.messageContainer,
      isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
      isLast && styles.lastMessageContainer,
      animatedStyle
    ]}>
      {!isUser && (
        <View style={[styles.avatarContainer, { backgroundColor: currentTheme.colors.primary }]}>
          <MaterialIcons name="smart-toy" size={16} color="white" />
        </View>
      )}
      
      <View style={[
        styles.messageBubble,
        isUser ? [
          styles.userBubble, 
          { backgroundColor: currentTheme.colors.primary }
        ] : [
          styles.assistantBubble, 
          { backgroundColor: currentTheme.colors.elevation2 }
        ]
      ]}>
         {isUser ? (
           <Text style={[styles.messageText, { color: 'white' }]}>
             {message.content}
           </Text>
         ) : (
           <Markdown
             style={{
               body: { 
                 color: currentTheme.colors.highEmphasis, 
                 fontSize: 16, 
                 lineHeight: 22,
                 margin: 0,
                 padding: 0
               },
               paragraph: { 
                 marginBottom: 8,
                 marginTop: 0,
                 color: currentTheme.colors.highEmphasis
               },
               heading1: {
                 fontSize: 20,
                 fontWeight: '700',
                 color: currentTheme.colors.highEmphasis,
                 marginBottom: 8,
                 marginTop: 0
               },
               heading2: {
                 fontSize: 18,
                 fontWeight: '600',
                 color: currentTheme.colors.highEmphasis,
                 marginBottom: 6,
                 marginTop: 0
               },
               link: { 
                 color: currentTheme.colors.primary,
                 textDecorationLine: 'underline'
               },
               code_inline: {
                 backgroundColor: currentTheme.colors.elevation2,
                 paddingHorizontal: 6,
                 paddingVertical: 2,
                 borderRadius: 4,
                 fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                 fontSize: 14,
                 color: currentTheme.colors.highEmphasis,
               },
               code_block: {
                 backgroundColor: currentTheme.colors.elevation2,
                 borderRadius: 8,
                 padding: 12,
                 marginVertical: 8,
                 color: currentTheme.colors.highEmphasis,
                 fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                 fontSize: 14,
               },
               fence: {
                 backgroundColor: currentTheme.colors.elevation2,
                 borderRadius: 8,
                 padding: 12,
                 marginVertical: 8,
                 color: currentTheme.colors.highEmphasis,
                 fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                 fontSize: 14,
               },
               bullet_list: { 
                 marginBottom: 8,
                 marginTop: 0
               },
               ordered_list: { 
                 marginBottom: 8,
                 marginTop: 0
               },
               list_item: {
                 marginBottom: 4,
                 color: currentTheme.colors.highEmphasis
               },
               strong: {
                 fontWeight: '700',
                 color: currentTheme.colors.highEmphasis
               },
               em: {
                 fontStyle: 'italic',
                 color: currentTheme.colors.highEmphasis
               },
               blockquote: {
                 backgroundColor: currentTheme.colors.elevation1,
                 borderLeftWidth: 4,
                 borderLeftColor: currentTheme.colors.primary,
                 paddingLeft: 12,
                 paddingVertical: 8,
                 marginVertical: 8,
                 borderRadius: 4,
               },
               table: {
                 borderWidth: 1,
                 borderColor: currentTheme.colors.elevation2,
                 borderRadius: 8,
                 marginVertical: 8,
               },
               thead: {
                 backgroundColor: currentTheme.colors.elevation1,
               },
               th: {
                 padding: 8,
                 fontWeight: '600',
                 color: currentTheme.colors.highEmphasis,
                 borderBottomWidth: 1,
                 borderBottomColor: currentTheme.colors.elevation2,
               },
               td: {
                 padding: 8,
                 color: currentTheme.colors.highEmphasis,
                 borderBottomWidth: 1,
                 borderBottomColor: currentTheme.colors.elevation2,
               },
             }}
           >
             {message.content}
           </Markdown>
         )}
        <Text style={[
          styles.messageTime,
          { color: isUser ? 'rgba(255,255,255,0.7)' : currentTheme.colors.mediumEmphasis }
        ]}>
          {new Date(message.timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </Text>
      </View>
      
      {isUser && (
        <View style={[styles.userAvatarContainer, { backgroundColor: currentTheme.colors.elevation2 }]}>
          <MaterialIcons name="person" size={16} color={currentTheme.colors.primary} />
        </View>
      )}
    </Animated.View>
  );
};

interface SuggestionChipProps {
  text: string;
  onPress: () => void;
}

const SuggestionChip: React.FC<SuggestionChipProps> = ({ text, onPress }) => {
  const { currentTheme } = useTheme();
  
  return (
    <TouchableOpacity
      style={[styles.suggestionChip, { backgroundColor: currentTheme.colors.elevation1 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.suggestionText, { color: currentTheme.colors.primary }]}>
        {text}
      </Text>
    </TouchableOpacity>
  );
};

const AIChatScreen: React.FC = () => {
  const route = useRoute<AIChatScreenRouteProp>();
  const navigation = useNavigation();
  const { currentTheme } = useTheme();
  const insets = useSafeAreaInsets();
  
  const { contentId, contentType, episodeId, seasonNumber, episodeNumber, title } = route.params;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<ContentContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  
  // Animation values
  const headerOpacity = useSharedValue(1);
  const inputContainerY = useSharedValue(0);

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    if (context && messages.length === 0) {
      // Generate conversation starters
      const starters = generateConversationStarters(context);
      setSuggestions(starters);
    }
  }, [context, messages.length]);

  const loadContext = async () => {
    try {
      setIsLoadingContext(true);
      
      if (contentType === 'movie') {
        // Movies: contentId may be TMDB id string or IMDb id (tt...)
        let movieData = await tmdbService.getMovieDetails(contentId);
        if (!movieData) {
          // Try resolve TMDB id from IMDb id
          const tmdbId = await tmdbService.findTMDBIdByIMDB(contentId);
          if (tmdbId) {
            movieData = await tmdbService.getMovieDetails(String(tmdbId));
          }
        }

        if (!movieData) throw new Error('Unable to load movie details');

        const movieContext = createMovieContext(movieData);
        setContext(movieContext);
      } else {
        // Series: resolve TMDB numeric id first (contentId may be IMDb/stremio id)
        let tmdbNumericId: number | null = null;
        if (/^\d+$/.test(contentId)) {
          tmdbNumericId = parseInt(contentId, 10);
        } else {
          // Try to resolve from IMDb id or stremio-like id
          tmdbNumericId = await tmdbService.findTMDBIdByIMDB(contentId);
          if (!tmdbNumericId && episodeId) {
            tmdbNumericId = await tmdbService.extractTMDBIdFromStremioId(episodeId);
          }
        }

        if (!tmdbNumericId) throw new Error('Unable to resolve TMDB ID for series');

        const [showData, episodeData] = await Promise.all([
          tmdbService.getTVShowDetails(tmdbNumericId),
          episodeId && seasonNumber && episodeNumber ? 
            tmdbService.getEpisodeDetails(tmdbNumericId, seasonNumber, episodeNumber) : 
            null
        ]);

        if (!showData) throw new Error('Unable to load TV show details');
        
        if (episodeData && seasonNumber && episodeNumber) {
          const episodeContext = createEpisodeContext(
            episodeData, 
            showData, 
            seasonNumber, 
            episodeNumber
          );
          setContext(episodeContext);
        } else {
          // Fallback: synthesize a show-level episode-like context so AI treats it as a series
          const syntheticEpisode: any = {
            id: `${showData?.id ?? ''}-overview`,
            name: 'Series Overview',
            overview: showData?.overview ?? '',
            air_date: showData?.first_air_date ?? '',
            runtime: undefined,
            credits: {
              guest_stars: [],
              crew: [],
            },
          };
          const episodeContext = createEpisodeContext(
            syntheticEpisode,
            showData,
            0,
            0
          );
          setContext(episodeContext);
        }
      }
    } catch (error) {
      if (__DEV__) console.error('Error loading context:', error);
      Alert.alert('Error', 'Failed to load content details for AI chat');
    } finally {
      setIsLoadingContext(false);
    }
  };

  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || !context || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    setSuggestions([]); // Hide suggestions after first message

    try {
      // If series overview is loaded, parse user query for specific episode and fetch on-demand
      let requestContext = context;
      if ('showTitle' in context) {
        const sxe = messageText.match(/s(\d+)e(\d+)/i);
        const words = messageText.match(/season\s+(\d+)[^\d]+episode\s+(\d+)/i);
        const seasonOnly = messageText.match(/s(\d+)(?!e)/i) || messageText.match(/season\s+(\d+)/i);
        
        let season = sxe ? parseInt(sxe[1], 10) : (words ? parseInt(words[1], 10) : undefined);
        let episode = sxe ? parseInt(sxe[2], 10) : (words ? parseInt(words[2], 10) : undefined);
        
        // If only season mentioned (like "s2" or "season 2"), default to episode 1
        if (!season && seasonOnly) {
          season = parseInt(seasonOnly[1], 10);
          episode = 1;
        }

        if (season && episode) {
          try {
            // Resolve TMDB id for the show
            let tmdbNumericId: number | null = null;
            if (/^\d+$/.test(contentId)) {
              tmdbNumericId = parseInt(contentId, 10);
            } else {
              tmdbNumericId = await tmdbService.findTMDBIdByIMDB(contentId);
              if (!tmdbNumericId && episodeId) {
                tmdbNumericId = await tmdbService.extractTMDBIdFromStremioId(episodeId);
              }
            }
            if (tmdbNumericId) {
              const [showData, episodeData] = await Promise.all([
                tmdbService.getTVShowDetails(tmdbNumericId),
                tmdbService.getEpisodeDetails(tmdbNumericId, season, episode)
              ]);
              if (showData && episodeData) {
                requestContext = createEpisodeContext(episodeData, showData, season, episode);
              }
            }
          } catch {}
        }
      }

      const response = await aiService.sendMessage(
        messageText.trim(),
        requestContext,
        messages
      );

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      if (__DEV__) console.error('Error sending message:', error);
      
      let errorMessage = 'Sorry, I encountered an error. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('not configured')) {
          errorMessage = 'Please configure your OpenRouter API key in Settings > AI Assistant.';
        } else if (error.message.includes('API request failed')) {
          errorMessage = 'Failed to connect to AI service. Please check your internet connection and API key.';
        }
      }

      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorMessage,
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  }, [context, messages, isLoading]);

  const handleSendPress = useCallback(() => {
    sendMessage(inputText);
  }, [inputText, sendMessage]);

  const handleSuggestionPress = useCallback((suggestion: string) => {
    sendMessage(suggestion);
  }, [sendMessage]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const getDisplayTitle = () => {
    if (!context) return title;
    
    if ('showTitle' in context) {
      const ep = context as any;
      // For series overview (synthetic S0E0), show just the show title
      if (ep.seasonNumber === 0 && ep.episodeNumber === 0) {
        return ep.showTitle;
      }
      return `${ep.showTitle} S${ep.seasonNumber}E${ep.episodeNumber}`;
    }
    return context.title || title;
  };

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const inputAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: inputContainerY.value }],
  }));

  if (isLoadingContext) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: currentTheme.colors.darkBackground }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={currentTheme.colors.primary} />
        <Text style={[styles.loadingText, { color: currentTheme.colors.mediumEmphasis }]}>
          Loading AI context...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: currentTheme.colors.darkBackground }]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <Animated.View style={[
        styles.header,
        { 
          backgroundColor: currentTheme.colors.darkBackground,
          paddingTop: insets.top 
        },
        headerAnimatedStyle
      ]}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <MaterialIcons name="arrow-back" size={24} color={currentTheme.colors.text} />
          </TouchableOpacity>
          
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: currentTheme.colors.highEmphasis }]}>
              AI Chat
            </Text>
            <Text style={[styles.headerSubtitle, { color: currentTheme.colors.mediumEmphasis }]}>
              {getDisplayTitle()}
            </Text>
          </View>
          
          <View style={[styles.aiIndicator, { backgroundColor: currentTheme.colors.primary }]}>
            <MaterialIcons name="smart-toy" size={20} color="white" />
          </View>
        </View>
      </Animated.View>

      {/* Chat Messages */}
      <KeyboardAvoidingView 
        style={styles.chatContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && suggestions.length > 0 && (
            <View style={styles.welcomeContainer}>
              <View style={[styles.welcomeIcon, { backgroundColor: currentTheme.colors.primary }]}>
                <MaterialIcons name="smart-toy" size={32} color="white" />
              </View>
              <Text style={[styles.welcomeTitle, { color: currentTheme.colors.highEmphasis }]}>
                Ask me anything about
              </Text>
              <Text style={[styles.welcomeSubtitle, { color: currentTheme.colors.primary }]}>
                {getDisplayTitle()}
              </Text>
              <Text style={[styles.welcomeDescription, { color: currentTheme.colors.mediumEmphasis }]}>
                I have detailed knowledge about this content and can answer questions about plot, characters, themes, and more.
              </Text>
              
              <View style={styles.suggestionsContainer}>
                <Text style={[styles.suggestionsTitle, { color: currentTheme.colors.mediumEmphasis }]}>
                  Try asking:
                </Text>
                <View style={styles.suggestionsGrid}>
                  {suggestions.map((suggestion, index) => (
                    <SuggestionChip
                      key={index}
                      text={suggestion}
                      onPress={() => handleSuggestionPress(suggestion)}
                    />
                  ))}
                </View>
              </View>
            </View>
          )}
          
          {messages.map((message, index) => (
            <ChatBubble
              key={message.id}
              message={message}
              isLast={index === messages.length - 1}
            />
          ))}
          
          {isLoading && (
            <View style={styles.typingIndicator}>
              <View style={[styles.typingBubble, { backgroundColor: currentTheme.colors.elevation2 }]}>
                <View style={styles.typingDots}>
                  <View style={[styles.typingDot, { backgroundColor: currentTheme.colors.mediumEmphasis }]} />
                  <View style={[styles.typingDot, { backgroundColor: currentTheme.colors.mediumEmphasis }]} />
                  <View style={[styles.typingDot, { backgroundColor: currentTheme.colors.mediumEmphasis }]} />
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Input Container */}
        <Animated.View style={[
          styles.inputContainer,
          { backgroundColor: currentTheme.colors.darkBackground },
          inputAnimatedStyle
        ]}>
          <View style={[styles.inputWrapper, { backgroundColor: currentTheme.colors.elevation1 }]}>
            <TextInput
              ref={inputRef}
              style={[
                styles.textInput,
                { color: currentTheme.colors.highEmphasis }
              ]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask about this content..."
              placeholderTextColor={currentTheme.colors.mediumEmphasis}
              multiline
              maxLength={500}
              editable={!isLoading}
              onSubmitEditing={handleSendPress}
              blurOnSubmit={false}
            />
            
            <TouchableOpacity
              style={[
                styles.sendButton,
                { 
                  backgroundColor: inputText.trim() ? currentTheme.colors.primary : currentTheme.colors.elevation2 
                }
              ]}
              onPress={handleSendPress}
              disabled={!inputText.trim() || isLoading}
              activeOpacity={0.7}
            >
              <MaterialIcons 
                name="send" 
                size={20} 
                color={inputText.trim() ? 'white' : currentTheme.colors.mediumEmphasis} 
              />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 8,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  aiIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  welcomeDescription: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
  },
  suggestionsContainer: {
    width: '100%',
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  suggestionsGrid: {
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  messageContainer: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  lastMessageContainer: {
    marginBottom: 8,
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  userAvatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  messageBubble: {
    maxWidth: width * 0.75,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderBottomLeftRadius: 4,
    marginLeft: 40,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AIChatScreen;
