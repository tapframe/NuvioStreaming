// Simplified standalone script to test hdrezka scraper flow
import fetch from 'node-fetch';
import readline from 'readline';

// Constants
const rezkaBase = 'https://hdrezka.ag/';
const baseHeaders = {
  'X-Hdrezka-Android-App': '1',
  'X-Hdrezka-Android-App-Version': '2.2.0',
};

// Parse command line arguments
const args = process.argv.slice(2);
const argOptions = {
  title: null,
  type: null,
  year: null,
  season: null,
  episode: null
};

// Process command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--title' || args[i] === '-t') {
    argOptions.title = args[i + 1];
    i++;
  } else if (args[i] === '--type' || args[i] === '-m') {
    argOptions.type = args[i + 1].toLowerCase();
    i++;
  } else if (args[i] === '--year' || args[i] === '-y') {
    argOptions.year = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--season' || args[i] === '-s') {
    argOptions.season = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--episode' || args[i] === '-e') {
    argOptions.episode = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
HDRezka Scraper Test Script

Usage:
  node hdrezka-test.js [options]

Options:
  --title, -t <title>      Title to search for
  --type, -m <type>        Media type (movie or show)
  --year, -y <year>        Release year
  --season, -s <number>    Season number (for shows)
  --episode, -e <number>   Episode number (for shows)
  --help, -h               Show this help message

Examples:
  node hdrezka-test.js --title "Breaking Bad" --type show --season 1 --episode 3
  node hdrezka-test.js --title "Inception" --type movie --year 2010
  node hdrezka-test.js (interactive mode)
`);
    process.exit(0);
  }
}

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
    throw new Error('No video links found');
  }
  
  console.log(`[PARSE] Parsing video links from stream URL data`);
  const linksArray = inputString.split(',');
  const result = {};

  linksArray.forEach((link) => {
    // Handle different quality formats:
    // 1. Simple format: [360p]https://example.com/video.mp4
    // 2. HTML format: [<span class="pjs-registered-quality">1080p<img...>]https://example.com/video.mp4
    
    // Try simple format first (non-HTML)
    let match = link.match(/\[([^<\]]+)\](https?:\/\/[^\s,]+\.mp4|null)/);
    
    // If not found, try HTML format with more flexible pattern
    if (!match) {
      // Extract quality text from HTML span
      const qualityMatch = link.match(/\[<span[^>]*>([^<]+)/);
      // Extract URL separately
      const urlMatch = link.match(/\][^[]*?(https?:\/\/[^\s,]+\.mp4|null)/);
      
      if (qualityMatch && urlMatch) {
        match = [null, qualityMatch[1].trim(), urlMatch[1]];
      }
    }
    
    if (match) {
      const qualityText = match[1].trim();
      const mp4Url = match[2];
      
      // Extract the quality value (e.g., "360p", "1080p Ultra")
      let quality = qualityText;
      
      // Skip null URLs (premium content that requires login)
      if (mp4Url !== 'null') {
        result[quality] = { type: 'mp4', url: mp4Url };
        console.log(`[QUALITY] Found ${quality}: ${mp4Url}`);
      } else {
        console.log(`[QUALITY] Premium quality ${quality} requires login (null URL)`);
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

  const fullUrl = new URL('/engine/ajax/search.php', rezkaBase);
  fullUrl.searchParams.append('q', media.title);
  
  console.log(`[REQUEST] Making search request to: ${fullUrl.toString()}`);
  const response = await fetch(fullUrl.toString(), {
    headers: baseHeaders
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
  const fullUrl = url.startsWith('http') ? url : `${rezkaBase}${url.startsWith('/') ? url.substring(1) : url}`;
  console.log(`[REQUEST] Making request to: ${fullUrl}`);
  
  const response = await fetch(fullUrl, {
    headers: baseHeaders,
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
  
  const fullUrl = `${rezkaBase}ajax/get_cdn_series/`;
  console.log(`[REQUEST] Making stream request to: ${fullUrl} with action=${media.type === 'show' ? 'get_stream' : 'get_movie'}`);

  // Log the request details
  console.log('[HDRezka][FETCH DEBUG]', {
    url: fullUrl,
    method: 'POST',
    headers: baseHeaders,
    body: searchParams.toString()
  });

  const response = await fetch(fullUrl, {
    method: 'POST',
    body: searchParams,
    headers: baseHeaders,
  });

  // Log the response details
  let responseHeaders = {};
  if (response.headers && typeof response.headers.forEach === 'function') {
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
  } else if (response.headers && response.headers.entries) {
    for (const [key, value] of response.headers.entries()) {
      responseHeaders[key] = value;
    }
  }
  const responseText = await response.clone().text();
  console.log('[HDRezka][FETCH RESPONSE]', {
    status: response.status,
    headers: responseHeaders,
    text: responseText
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const rawText = await response.text();
  console.log(`[RESPONSE] Stream response length: ${rawText.length}`);

  // Response content-type is text/html, but it's actually JSON
  try {
    const parsedResponse = JSON.parse(rawText);
    console.log(`[RESULT] Parsed response successfully`);
    
    // Process video qualities and subtitles
    const qualities = parseVideoLinks(parsedResponse.url);
    const captions = parseSubtitles(parsedResponse.subtitle);
    
    // Add the parsed data to the response
    parsedResponse.formattedQualities = qualities;
    parsedResponse.formattedCaptions = captions;
    
    return parsedResponse;
  } catch (e) {
    console.error(`[ERROR] Failed to parse JSON response: ${e.message}`);
    console.log(`[ERROR] Raw response: ${rawText.substring(0, 200)}...`);
    return null;
  }
}

// Main execution
async function main() {
  try {
    console.log('=== HDREZKA SCRAPER TEST ===');
    
    let media;
    
    // Check if we have command line arguments
    if (argOptions.title) {
      // Use command line arguments
      media = {
        type: argOptions.type || 'show',
        title: argOptions.title,
        releaseYear: argOptions.year || null
      };
      
      // If it's a show, add season and episode
      if (media.type === 'show') {
        media.season = { number: argOptions.season || 1 };
        media.episode = { number: argOptions.episode || 1 };
        
        console.log(`Testing scrape for ${media.type}: ${media.title} ${media.releaseYear ? `(${media.releaseYear})` : ''} S${media.season.number}E${media.episode.number}`);
      } else {
        console.log(`Testing scrape for ${media.type}: ${media.title} ${media.releaseYear ? `(${media.releaseYear})` : ''}`);
      }
    } else {
      // Get user input interactively
      const title = await prompt('Enter title to search: ');
      const mediaType = await prompt('Enter media type (movie/show): ').then(type => 
        type.toLowerCase() === 'movie' || type.toLowerCase() === 'show' ? type.toLowerCase() : 'show'
      );
      const releaseYear = await prompt('Enter release year (optional): ').then(year => 
        year ? parseInt(year) : null
      );
      
      // Create media object
      media = {
        type: mediaType,
        title: title,
        releaseYear: releaseYear
      };
      
      // If it's a show, get season and episode
      if (mediaType === 'show') {
        const seasonNum = await prompt('Enter season number: ').then(num => parseInt(num) || 1);
        const episodeNum = await prompt('Enter episode number: ').then(num => parseInt(num) || 1);
        
        media.season = { number: seasonNum };
        media.episode = { number: episodeNum };
        
        console.log(`Testing scrape for ${media.type}: ${media.title} ${media.releaseYear ? `(${media.releaseYear})` : ''} S${media.season.number}E${media.episode.number}`);
      } else {
        console.log(`Testing scrape for ${media.type}: ${media.title} ${media.releaseYear ? `(${media.releaseYear})` : ''}`);
      }
    }
    
    // Step 1: Search and find media ID
    const result = await searchAndFindMediaId(media);
    if (!result || !result.id) {
      console.log('No result found, exiting');
      rl.close();
      return;
    }

    // Step 2: Get translator ID
    const translatorId = await getTranslatorId(result.url, result.id, media);
    if (!translatorId) {
      console.log('No translator ID found, exiting');
      rl.close();
      return;
    }

    // Step 3: Get stream
    const streamData = await getStream(result.id, translatorId, media);
    if (!streamData) {
      console.log('No stream data found, exiting');
      rl.close();
      return;
    }
    
    // Format output in clean JSON similar to CLI output
    const formattedOutput = {
      embeds: [],
      stream: [
        {
          id: 'primary',
          type: 'file',
          flags: ['cors-allowed', 'ip-locked'],
          captions: streamData.formattedCaptions.map(caption => ({
            id: caption.url,
            language: caption.language === 'Русский' ? 'ru' : 
                     caption.language === 'Українська' ? 'uk' : 
                     caption.language === 'English' ? 'en' : caption.language.toLowerCase(),
            hasCorsRestrictions: false,
            type: 'vtt',
            url: caption.url
          })),
          qualities: Object.entries(streamData.formattedQualities).reduce((acc, [quality, data]) => {
            // Convert quality format to match CLI output
            // "360p" -> "360", "1080p Ultra" -> "1080" (or keep as is if needed)
            let qualityKey = quality;
            const numericMatch = quality.match(/^(\d+)p/);
            if (numericMatch) {
              qualityKey = numericMatch[1];
            }
            
            acc[qualityKey] = {
              type: data.type,
              url: data.url
            };
            return acc;
          }, {})
        }
      ]
    };
    
    // Display the formatted output
    console.log('✓ Done!');
    console.log(JSON.stringify(formattedOutput, null, 2).replace(/"([^"]+)":/g, '$1:'));
    
    console.log('=== SCRAPING COMPLETE ===');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (error.cause) {
      console.error(`Cause: ${error.cause.message}`);
    }
  } finally {
    rl.close();
  }
}

main(); 