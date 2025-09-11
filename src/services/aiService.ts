import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface MovieContext {
  id: string;
  title: string;
  overview: string;
  releaseDate: string;
  genres: string[];
  cast: Array<{
    name: string;
    character: string;
  }>;
  crew: Array<{
    name: string;
    job: string;
  }>;
  runtime?: number;
  tagline?: string;
  keywords?: string[];
}

export interface EpisodeContext {
  id: string;
  showId: string;
  showTitle: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  overview: string;
  airDate: string;
  released: boolean;
  runtime?: number;
  cast: Array<{
    name: string;
    character: string;
  }>;
  crew: Array<{
    name: string;
    job: string;
  }>;
  guestStars?: Array<{
    name: string;
    character: string;
  }>;
}

export type ContentContext = MovieContext | EpisodeContext;

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

class AIService {
  private static instance: AIService;
  private apiKey: string | null = null;
  private baseUrl = 'https://openrouter.ai/api/v1';

  private constructor() {}

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  async initialize(): Promise<boolean> {
    try {
      this.apiKey = await AsyncStorage.getItem('openrouter_api_key');
      return !!this.apiKey;
    } catch (error) {
      if (__DEV__) console.error('Failed to initialize AI service:', error);
      return false;
    }
  }

  async isConfigured(): Promise<boolean> {
    if (!this.apiKey) {
      await this.initialize();
    }
    return !!this.apiKey;
  }

  private createSystemPrompt(context: ContentContext): string {
    const isEpisode = 'showTitle' in context;
    
    if (isEpisode) {
      const ep = context as EpisodeContext;
      return `You are an AI assistant specialized in TV shows and episodes. You have detailed knowledge about "${ep.showTitle}" Season ${ep.seasonNumber}, Episode ${ep.episodeNumber}: "${ep.episodeTitle}".

Episode Details:
- Show: ${ep.showTitle}
- Episode: S${ep.seasonNumber}E${ep.episodeNumber} - "${ep.episodeTitle}"
- Air Date: ${ep.airDate}
- Release Status: ${ep.released ? 'Released' : 'Unreleased'}
- Runtime: ${ep.runtime ? `${ep.runtime} minutes` : 'Unknown'}
- Synopsis: ${ep.overview}

Cast:
${ep.cast.map(c => `- ${c.name} as ${c.character}`).join('\n')}

${ep.guestStars && ep.guestStars.length > 0 ? `Guest Stars:\n${ep.guestStars.map(g => `- ${g.name} as ${g.character}`).join('\n')}` : ''}

Crew:
${ep.crew.map(c => `- ${c.name} (${c.job})`).join('\n')}

Guidance:
- Never provide spoilers under any circumstances. Always keep responses spoiler-safe.
- If Release Status is Released, do not claim the episode is unreleased. Provide specific, accurate details.
- If Release Status is Unreleased, avoid spoilers and focus on official information only.
- Be specific to this episode and provide detailed, informative responses. If asked about other episodes or seasons, politely redirect the conversation back to this specific episode while acknowledging the broader context of the show.`;
    } else {
      const movie = context as MovieContext;
      return `You are an AI assistant specialized in movies and cinema. You have detailed knowledge about the movie "${movie.title}".

Movie Details:
- Title: ${movie.title}
- Release Date: ${movie.releaseDate}
- Runtime: ${movie.runtime ? `${movie.runtime} minutes` : 'Unknown'}
- Genres: ${movie.genres.join(', ')}
- Tagline: ${movie.tagline || 'N/A'}
- Synopsis: ${movie.overview}

Cast:
${movie.cast.map(c => `- ${c.name} as ${c.character}`).join('\n')}

Crew:
${movie.crew.map(c => `- ${c.name} (${c.job})`).join('\n')}

${movie.keywords && movie.keywords.length > 0 ? `Keywords: ${movie.keywords.join(', ')}` : ''}

Guidance:
- Never provide spoilers under any circumstances. Always keep responses spoiler-safe.
- You can discuss themes, production, performances, and high-level plot setup without revealing twists, surprises, or outcomes.
- If users explicitly request spoilers, refuse gently and offer a spoiler-safe summary or analysis instead.

You should answer questions about this movie, including plot analysis, character development, themes, cinematography, production notes, trivia, and critical analysis. Provide detailed, informative responses that demonstrate deep knowledge of the film while remaining spoiler-safe. Be specific and focus on this particular movie.`;
    }
  }

  async sendMessage(
    message: string, 
    context: ContentContext, 
    conversationHistory: ChatMessage[] = []
  ): Promise<string> {
    if (!await this.isConfigured()) {
      throw new Error('AI service not configured. Please add your OpenRouter API key in settings.');
    }

    try {
      const systemPrompt = this.createSystemPrompt(context);
      
      // Prepare messages for API
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory
          .filter(msg => msg.role !== 'system')
          .slice(-10) // Keep last 10 messages for context
          .map(msg => ({
            role: msg.role,
            content: msg.content
          })),
        { role: 'user', content: message }
      ];

      if (__DEV__) {
        console.log('[AIService] Sending request to OpenRouter with context:', {
          contentType: 'showTitle' in context ? 'episode' : 'movie',
          title: 'showTitle' in context ? 
            `${(context as EpisodeContext).showTitle} S${(context as EpisodeContext).seasonNumber}E${(context as EpisodeContext).episodeNumber}` :
            (context as MovieContext).title,
          messageCount: messages.length
        });
      }

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://nuvio.app',
          'X-Title': 'Nuvio - AI Chat',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet', // Using Claude for better analysis
          messages,
          max_tokens: 1000,
          temperature: 0.7,
          top_p: 0.9,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (__DEV__) console.error('[AIService] API Error:', response.status, errorText);
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: OpenRouterResponse = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response received from AI service');
      }

      const responseContent = data.choices[0].message.content;
      
      if (__DEV__ && data.usage) {
        console.log('[AIService] Token usage:', data.usage);
      }

      return responseContent;
    } catch (error) {
      if (__DEV__) console.error('[AIService] Error sending message:', error);
      throw error;
    }
  }

  // Helper method to create context from TMDB movie data
  static createMovieContext(movieData: any): MovieContext {
    if (__DEV__) {
      console.log('[AIService] Creating movie context from TMDB data:', {
        id: movieData.id,
        title: movieData.title || movieData.name,
        hasCredits: !!movieData.credits,
        castCount: movieData.credits?.cast?.length || 0,
        crewCount: movieData.credits?.crew?.length || 0,
        hasKeywords: !!(movieData.keywords?.keywords || movieData.keywords?.results),
        keywordCount: (movieData.keywords?.keywords || movieData.keywords?.results)?.length || 0,
        genreCount: movieData.genres?.length || 0
      });
    }

    return {
      id: movieData.id?.toString() || '',
      title: movieData.title || movieData.name || '',
      overview: movieData.overview || '',
      releaseDate: movieData.release_date || movieData.first_air_date || '',
      genres: movieData.genres?.map((g: any) => g.name) || [],
      cast: movieData.credits?.cast?.slice(0, 10).map((c: any) => ({
        name: c.name,
        character: c.character
      })) || [],
      crew: movieData.credits?.crew?.slice(0, 5).map((c: any) => ({
        name: c.name,
        job: c.job
      })) || [],
      runtime: movieData.runtime,
      tagline: movieData.tagline,
      keywords: movieData.keywords?.keywords?.map((k: any) => k.name) || 
               movieData.keywords?.results?.map((k: any) => k.name) || []
    };
  }

  // Helper method to create context from TMDB episode data
  static createEpisodeContext(
    episodeData: any, 
    showData: any, 
    seasonNumber: number, 
    episodeNumber: number
  ): EpisodeContext {
    // Compute release status from TMDB air date
    const airDate: string = episodeData.air_date || '';
    let released = false;
    try {
      if (airDate) {
        const parsed = new Date(airDate);
        if (!isNaN(parsed.getTime())) released = parsed.getTime() <= Date.now();
      }
    } catch {}
    // Heuristics: if TMDB provides meaningful content, treat as released
    if (!released) {
      const hasOverview = typeof episodeData.overview === 'string' && episodeData.overview.trim().length > 40;
      const hasRuntime = typeof episodeData.runtime === 'number' && episodeData.runtime > 0;
      const hasVotes = typeof episodeData.vote_average === 'number' && episodeData.vote_average > 0;
      if (hasOverview || hasRuntime || hasVotes) {
        released = true;
      }
    }
    if (__DEV__) {
      console.log('[AIService] Creating episode context from TMDB data:', {
        showId: showData.id,
        showTitle: showData.name || showData.title,
        episodeId: episodeData.id,
        episodeTitle: episodeData.name,
        season: seasonNumber,
        episode: episodeNumber,
        hasShowCredits: !!showData.credits,
        showCastCount: showData.credits?.cast?.length || 0,
        hasEpisodeCredits: !!episodeData.credits,
        episodeGuestStarsCount: episodeData.credits?.guest_stars?.length || 0,
        episodeCrewCount: episodeData.credits?.crew?.length || 0
      });
    }

    return {
      id: episodeData.id?.toString() || '',
      showId: showData.id?.toString() || '',
      showTitle: showData.name || showData.title || '',
      episodeTitle: episodeData.name || `Episode ${episodeNumber}`,
      seasonNumber,
      episodeNumber,
      overview: episodeData.overview || '',
      airDate,
      released,
      runtime: episodeData.runtime,
      cast: showData.credits?.cast?.slice(0, 8).map((c: any) => ({
        name: c.name,
        character: c.character
      })) || [],
      crew: episodeData.credits?.crew?.slice(0, 5).map((c: any) => ({
        name: c.name,
        job: c.job
      })) || showData.credits?.crew?.slice(0, 5).map((c: any) => ({
        name: c.name,
        job: c.job
      })) || [],
      guestStars: episodeData.credits?.guest_stars?.map((g: any) => ({
        name: g.name,
        character: g.character
      })) || []
    };
  }

  // Generate conversation starter suggestions
  static generateConversationStarters(context: ContentContext): string[] {
    const isEpisode = 'showTitle' in context;
    
    if (isEpisode) {
      const ep = context as EpisodeContext;
      return [
        `What happened in this episode of ${ep.showTitle}?`,
        `Explain the main plot points of "${ep.episodeTitle}"`,
        `What character development occurred in this episode?`,
        `Are there any hidden details or easter eggs I might have missed?`,
        `How does this episode connect to the overall story arc?`
      ];
    } else {
      const movie = context as MovieContext;
      return [
        `What is ${movie.title} about?`,
        `Explain the themes in this movie`,
        `What's the significance of the ending?`,
        `Tell me about the main characters and their development`,
        `Are there any interesting production facts about this film?`
      ];
    }
  }
}

export const aiService = AIService.getInstance();

// Export static methods for easier access
export const createMovieContext = AIService.createMovieContext;
export const createEpisodeContext = AIService.createEpisodeContext;
export const generateConversationStarters = AIService.generateConversationStarters;
