// Test script for HDRezka service
// Run with: node scripts/test-hdrezka.js

const fetch = require('node-fetch');
const readline = require('readline');

// Constants
const REZKA_BASE = 'https://hdrezka.ag/';
const BASE_HEADERS = {
  'X-Hdrezka-Android-App': '1',
  'X-Hdrezka-Android-App-Version': '2.2.0',
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to prompt user for input
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Helper functions
function generateRandomFavs() {
  const randomHex = () => Math.floor(Math.random() * 16).toString(16);
  const generateSegment = (length) => Array.from({ length }, randomHex).join('');

  return `${generateSegment(8)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(12)}`;
}

function extractTitleAndYear(input) {
  const regex = /^(.*?),.*?(\d{4})/;
  const match = input.match(regex);

  if (match) {
    const title = match[1];
    const year = match[2];
    return { title: title.trim(), year: year ? parseInt(year, 10) : null };
  }
  return null;
}

function parseVideoLinks(inputString) {
  if (!inputString) {
    console.warn('No video links found');
    return {};
  }
  
  console.log(`[PARSE] Parsing video links from stream URL data`);
  const linksArray = inputString.split(',');
  const result = {};

  linksArray.forEach((link) => {
    // Handle different quality formats
    let match = link.match(/\[([^<\]]+)\](https?:\/\/[^\s,]+\.mp4|null)/);
    
    // If not found, try HTML format with more flexible pattern
    if (!match) {
      const qualityMatch = link.match(/\[<span[^>]*>([^<]+)/);
      const urlMatch = link.match(/\][^[]*?(https?:\/\/[^\s,]+\.mp4|null)/);
      
      if (qualityMatch && urlMatch) {
        match = [null, qualityMatch[1].trim(), urlMatch[1]];
      }
    }
    
    if (match) {
      const qualityText = match[1].trim();
      const mp4Url = match[2];
      
      // Skip null URLs (premium content that requires login)
      if (mp4Url !== 'null') {
        result[qualityText] = { type: 'mp4', url: mp4Url };
        console.log(`[QUALITY] Found ${qualityText}: ${mp4Url}`);
      } else {
        console.log(`[QUALITY] Premium quality ${qualityText} requires login (null URL)`);
      }
    } else {
      console.log(`[WARNING] Could not parse quality from: ${link}`);
    }
  });

  console.log(`[PARSE] Found ${Object.keys(result).length} valid qualities: ${Object.keys(result).join(', ')}`);
  return result;
}

function parseSubtitles(inputString) {
  if (!inputString) {
    console.log('[SUBTITLES] No subtitles found');
    return [];
  }
  
  console.log(`[PARSE] Parsing subtitles data`);
  const linksArray = inputString.split(',');
  const captions = [];

  linksArray.forEach((link) => {
    const match = link.match(/\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/);

    if (match) {
      const language = match[1];
      const url = match[2];
      
      captions.push({
        id: url,
        language,
        hasCorsRestrictions: false,
        type: 'vtt',
        url: url,
      });
      console.log(`[SUBTITLE] Found ${language}: ${url}`);
    }
  });

  console.log(`[PARSE] Found ${captions.length} subtitles`);
  return captions;
}

// Main scraper functions
async function searchAndFindMediaId(media) {
  console.log(`[STEP 1] Searching for title: ${media.title}, type: ${media.type}, year: ${media.releaseYear || 'any'}`);
  
  const itemRegexPattern = /<a href="([^"]+)"><span class="enty">([^<]+)<\/span> \(([^)]+)\)/g;
  const idRegexPattern = /\/(\d+)-[^/]+\.html$/;

  const fullUrl = new URL('/engine/ajax/search.php', REZKA_BASE);
  fullUrl.searchParams.append('q', media.title);
  
  console.log(`[REQUEST] Making search request to: ${fullUrl.toString()}`);
  const response = await fetch(fullUrl.toString(), {
    headers: BASE_HEADERS
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const searchData = await response.text();
  console.log(`[RESPONSE] Search response length: ${searchData.length}`);

  const movieData = [];
  let match;
  
  while ((match = itemRegexPattern.exec(searchData)) !== null) {
    const url = match[1];
    const titleAndYear = match[3];

    const result = extractTitleAndYear(titleAndYear);
    if (result !== null) {
      const id = url.match(idRegexPattern)?.[1] || null;
      const isMovie = url.includes('/films/');
      const isShow = url.includes('/series/');
      const type = isMovie ? 'movie' : isShow ? 'show' : 'unknown';

      movieData.push({ 
        id: id ?? '', 
        year: result.year ?? 0, 
        type, 
        url,
        title: match[2]
      });
      console.log(`[MATCH] Found: id=${id}, title=${match[2]}, type=${type}, year=${result.year}`);
    }
  }

  // If year is provided, filter by year
  let filteredItems = movieData;
  if (media.releaseYear) {
    filteredItems = movieData.filter(item => item.year === media.releaseYear);
    console.log(`[FILTER] Items filtered by year ${media.releaseYear}: ${filteredItems.length}`);
  }
  
  // If type is provided, filter by type
  if (media.type) {
    filteredItems = filteredItems.filter(item => item.type === media.type);
    console.log(`[FILTER] Items filtered by type ${media.type}: ${filteredItems.length}`);
  }

  if (filteredItems.length === 0 && movieData.length > 0) {
    console.log(`[WARNING] No items match the exact criteria. Showing all results:`);
    movieData.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.title} (${item.year}) - ${item.type}`);
    });
    
    // Let user select from results
    const selection = await prompt("Enter the number of the item you want to select (or press Enter to use the first result): ");
    const selectedIndex = parseInt(selection) - 1;
    
    if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < movieData.length) {
      console.log(`[RESULT] Selected item: id=${movieData[selectedIndex].id}, title=${movieData[selectedIndex].title}`);
      return movieData[selectedIndex];
    } else if (movieData.length > 0) {
      console.log(`[RESULT] Using first result: id=${movieData[0].id}, title=${movieData[0].title}`);
      return movieData[0];
    }
    
    return null;
  }
  
  if (filteredItems.length > 0) {
    console.log(`[RESULT] Selected item: id=${filteredItems[0].id}, title=${filteredItems[0].title}`);
    return filteredItems[0];
  } else {
    console.log(`[ERROR] No matching items found`);
    return null;
  }
}

async function getTranslatorId(url, id, media) {
  console.log(`[STEP 2] Getting translator ID for url=${url}, id=${id}`);
  
  // Make sure the URL is absolute
  const fullUrl = url.startsWith('http') ? url : `${REZKA_BASE}${url.startsWith('/') ? url.substring(1) : url}`;
  console.log(`[REQUEST] Making request to: ${fullUrl}`);
  
  const response = await fetch(fullUrl, {
    headers: BASE_HEADERS,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const responseText = await response.text();
  console.log(`[RESPONSE] Translator page response length: ${responseText.length}`);

  // Translator ID 238 represents the Original + subtitles player.
  if (responseText.includes(`data-translator_id="238"`)) {
    console.log(`[RESULT] Found translator ID 238 (Original + subtitles)`);
    return '238';
  }

  const functionName = media.type === 'movie' ? 'initCDNMoviesEvents' : 'initCDNSeriesEvents';
  const regexPattern = new RegExp(`sof\\.tv\\.${functionName}\\(${id}, ([^,]+)`, 'i');
  const match = responseText.match(regexPattern);
  const translatorId = match ? match[1] : null;
  
  console.log(`[RESULT] Extracted translator ID: ${translatorId}`);
  return translatorId;
}

async function getStream(id, translatorId, media) {
  console.log(`[STEP 3] Getting stream for id=${id}, translatorId=${translatorId}`);
  
  const searchParams = new URLSearchParams();
  searchParams.append('id', id);
  searchParams.append('translator_id', translatorId);
  
  if (media.type === 'show') {
    searchParams.append('season', media.season.number.toString());
    searchParams.append('episode', media.episode.number.toString());
    console.log(`[PARAMS] Show params: season=${media.season.number}, episode=${media.episode.number}`);
  }
  
  const randomFavs = generateRandomFavs();
  searchParams.append('favs', randomFavs);
  searchParams.append('action', media.type === 'show' ? 'get_stream' : 'get_movie');
  
  const fullUrl = `${REZKA_BASE}ajax/get_cdn_series/`;
  console.log(`[REQUEST] Making stream request to: ${fullUrl} with action=${media.type === 'show' ? 'get_stream' : 'get_movie'}`);
  
  const response = await fetch(fullUrl, {
    method: 'POST',
    body: searchParams,
    headers: BASE_HEADERS,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const responseText = await response.text();
  console.log(`[RESPONSE] Stream response length: ${responseText.length}`);

  // Response content-type is text/html, but it's actually JSON
  try {
    const parsedResponse = JSON.parse(responseText);
    console.log(`[RESULT] Parsed response successfully`);
    
    // Process video qualities and subtitles
    const qualities = parseVideoLinks(parsedResponse.url);
    const captions = parseSubtitles(parsedResponse.subtitle);
    
    return {
      qualities,
      captions
    };
  } catch (e) {
    console.error(`[ERROR] Failed to parse JSON response: ${e.message}`);
    return null;
  }
}

async function getStreams(mediaId, mediaType, season, episode) {
  try {
    console.log(`[HDRezka] Getting streams for ${mediaType} with ID: ${mediaId}`);
    
    // Check if the mediaId appears to be an ID rather than a title
    let title = mediaId;
    let year;
    
    // If it's an ID format (starts with 'tt' for IMDB or contains ':' like TMDB IDs)
    // For testing, we'll replace it with an example title instead of implementing full TMDB API calls
    if (mediaId.startsWith('tt') || mediaId.includes(':')) {
      console.log(`[HDRezka] ID format detected for "${mediaId}". Using title search instead.`);
      
      // For demo purposes only - you would actually get this from TMDB API in real implementation
      if (mediaType === 'movie') {
        title = "Inception"; // Example movie
        year = 2010;
      } else {
        title = "Breaking Bad"; // Example show
        year = 2008;
      }
      
      console.log(`[HDRezka] Using title "${title}" (${year}) for search instead of ID`);
    }
    
    const media = {
      title,
      type: mediaType === 'movie' ? 'movie' : 'show',
      releaseYear: year
    };

    // Step 1: Search and find media ID
    const searchResult = await searchAndFindMediaId(media);
    if (!searchResult || !searchResult.id) {
      console.log('[HDRezka] No search results found');
      return [];
    }

    // Step 2: Get translator ID
    const translatorId = await getTranslatorId(
      searchResult.url, 
      searchResult.id, 
      media
    );
    
    if (!translatorId) {
      console.log('[HDRezka] No translator ID found');
      return [];
    }

    // Step 3: Get stream
    const streamParams = {
      type: media.type,
      season: season ? { number: season } : undefined,
      episode: episode ? { number: episode } : undefined
    };
    
    const streamData = await getStream(searchResult.id, translatorId, streamParams);
    if (!streamData) {
      console.log('[HDRezka] No stream data found');
      return [];
    }
    
    // Convert to Stream format
    const streams = [];
    
    Object.entries(streamData.qualities).forEach(([quality, data]) => {
      streams.push({
        name: 'HDRezka',
        title: quality,
        url: data.url,
        behaviorHints: {
          notWebReady: false
        }
      });
    });
    
    console.log(`[HDRezka] Found ${streams.length} streams`);
    return streams;
  } catch (error) {
    console.error(`[HDRezka] Error getting streams: ${error}`);
    return [];
  }
}

// Main execution
async function main() {
  try {
    console.log('=== HDREZKA SCRAPER TEST ===');
    
    // Get user input interactively
    const title = await prompt('Enter title to search: ');
    const mediaType = await prompt('Enter media type (movie/show): ').then(type => 
      type.toLowerCase() === 'movie' || type.toLowerCase() === 'show' ? type.toLowerCase() : 'show'
    );
    const releaseYear = await prompt('Enter release year (optional): ').then(year => 
      year ? parseInt(year) : null
    );
    
    // Create media object
    let media = {
      title,
      type: mediaType,
      releaseYear
    };
    
    let seasonNum, episodeNum;
    
    // If it's a show, get season and episode
    if (mediaType === 'show') {
      seasonNum = await prompt('Enter season number: ').then(num => parseInt(num) || 1);
      episodeNum = await prompt('Enter episode number: ').then(num => parseInt(num) || 1);
      
      console.log(`Testing scrape for ${media.type}: ${media.title} ${media.releaseYear ? `(${media.releaseYear})` : ''} S${seasonNum}E${episodeNum}`);
    } else {
      console.log(`Testing scrape for ${media.type}: ${media.title} ${media.releaseYear ? `(${media.releaseYear})` : ''}`);
    }
    
    const streams = await getStreams(title, mediaType, seasonNum, episodeNum);
    
    if (streams && streams.length > 0) {
      console.log('✓ Found streams:');
      console.log(JSON.stringify(streams, null, 2));
    } else {
      console.log('✗ No streams found');
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    rl.close();
  }
}

main(); 