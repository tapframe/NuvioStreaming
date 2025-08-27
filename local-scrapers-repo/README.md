# Nuvio Local Scrapers Repository

This repository contains local scrapers for the Nuvio streaming application. These scrapers allow you to fetch streams from various sources directly within the app.

## Repository Structure

```
├── manifest.json          # Repository manifest with scraper definitions
├── uhdmovies.js           # UHD Movies scraper
├── moviesmod.js           # MoviesMod scraper
├── hdrezka.js             # HDRezka scraper
├── dahmermovies.js        # Dahmer Movies scraper
├── myflixer.js            # MyFlixer scraper
├── test_uhdmovies.js      # Test file for UHD Movies scraper
├── test_moviesmod.js      # Test file for MoviesMod scraper
├── test_hdrezka.js        # Test file for HDRezka scraper
├── test_dahmermovies.js   # Test file for Dahmer Movies scraper
├── test_myflixer.js       # Test file for MyFlixer scraper
└── README.md              # This file
```

## How to Use

1. **Add Repository to Nuvio:**
   - Open Nuvio app
   - Go to Settings → Local Scrapers
   - Add this repository URL
   - Enable the scrapers you want to use

2. **GitHub Repository URL:**
   ```
   https://raw.githubusercontent.com/tapframe/nuvio-local-scrapers/main/
   ```

## Available Scrapers

### UHD Movies
- **Source:** UHD Movies website
- **Content:** High-quality movies and TV shows
- **Formats:** Various qualities (480p to 4K)
- **Features:** Episode-specific extraction, multiple download servers
- **Status:** Active

### MoviesMod
- **Source:** MoviesMod website
- **Content:** Movies and TV shows with multiple quality options
- **Formats:** 720p, 1080p, 4K with various encodings (x264, x265/HEVC, 10-bit)
- **Features:** Dynamic domain fetching, SID link resolution, multiple tech domains
- **Status:** Active

### HDRezka
- **Source:** HDRezka website
- **Content:** High-quality movies and TV shows with subtitle support
- **Formats:** 360p, 480p, 720p, 1080p Ultra (premium content requires login)
- **Features:** Multi-language subtitles (Russian, Ukrainian, English), episode-specific streaming
- **Status:** Active

### Dahmer Movies
- **Source:** Dahmer Movies website (a.111477.xyz)
- **Content:** High-quality movies and TV shows
- **Formats:** 1080p, 2160p (4K) with various encodings
- **Features:** Direct file access, episode-specific extraction, quality filtering
- **Status:** Active

### MyFlixer
- **Source:** MyFlixer website (watch32.sx)
- **Content:** High-quality movies and TV shows with M3U8 streaming
- **Formats:** 360p, 720p, 1080p with adaptive bitrate streaming
- **Features:** M3U8 playlist extraction, Videostr decryption, multiple quality options, episode-specific streaming
- **Status:** Active

## Scraper Development

### Prerequisites

- Basic knowledge of JavaScript and web scraping
- Understanding of HTML/CSS selectors
- Familiarity with HTTP requests and responses
- Knowledge of React Native compatibility requirements

### Creating a New Scraper

#### 1. Create the scraper file (e.g., `newscraper.js`):

```javascript
// Import cheerio for HTML parsing (React Native compatible)
const cheerio = require('cheerio-without-node-native');

// Constants
const TMDB_API_KEY = "your_tmdb_api_key_here";
const BASE_URL = 'https://example-site.com';

// Helper function for HTTP requests
async function makeRequest(url, options = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive'
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response;
}

// Main function that Nuvio will call
async function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
  console.log(`[YourScraper] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
  
  try {
    // 1. Get TMDB info
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const tmdbResponse = await makeRequest(tmdbUrl);
    const tmdbData = await tmdbResponse.json();

    const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
    const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);

    if (!title) {
      throw new Error('Could not extract title from TMDB response');
    }

    console.log(`[YourScraper] TMDB Info: "${title}" (${year})`);

    // 2. Search for content
    const searchResults = await searchContent(title, year, mediaType);
    if (searchResults.length === 0) {
      console.log(`[YourScraper] No search results found`);
      return [];
    }

    // 3. Extract download links
    const selectedResult = findBestMatch(title, searchResults);
    const downloadLinks = await extractDownloadLinks(selectedResult.url);

    // 4. Process links to get final streams
    const streamPromises = downloadLinks.map(link => processDownloadLink(link, mediaType, episodeNum));
    const streams = (await Promise.all(streamPromises)).filter(Boolean);

    // 5. Sort by quality (highest first)
    streams.sort((a, b) => {
      const qualityA = parseQualityForSort(a.quality);
      const qualityB = parseQualityForSort(b.quality);
      return qualityB - qualityA;
    });

    console.log(`[YourScraper] Successfully processed ${streams.length} streams`);
    return streams;

  } catch (error) {
    console.error(`[YourScraper] Error in getStreams: ${error.message}`);
    return [];
  }
}

// Helper functions
async function searchContent(title, year, mediaType) {
  // Implement search logic
  const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(title)}`;
  const response = await makeRequest(searchUrl);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const results = [];
  $('.search-result').each((i, element) => {
    const linkElement = $(element).find('a');
    const resultTitle = linkElement.text().trim();
    const url = linkElement.attr('href');
    if (resultTitle && url) {
      results.push({ title: resultTitle, url });
    }
  });
  
  return results;
}

async function extractDownloadLinks(pageUrl) {
  // Implement link extraction logic
  const response = await makeRequest(pageUrl);
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const links = [];
  $('.download-link').each((i, element) => {
    const quality = $(element).find('.quality').text().trim();
    const url = $(element).attr('href');
    if (quality && url) {
      links.push({ quality, url });
    }
  });
  
  return links;
}

async function processDownloadLink(link, mediaType, episodeNum) {
  try {
    // Process individual download link
    // This might involve resolving intermediate URLs, handling captchas, etc.
    const finalUrl = await resolveFinalUrl(link.url);
    
    if (!finalUrl) return null;
    
    return {
      name: "YourScraper",
      title: `${link.quality} Stream`,
      url: finalUrl,
      quality: extractQuality(link.quality),
      size: extractSize(link.quality),
      type: 'direct',
      headers: { // Include headers if your stream requires them
        "Referer": "https://your-source-site.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    };
  } catch (error) {
    console.error(`[YourScraper] Error processing link: ${error.message}`);
    return null;
  }
}

// Utility functions
function findBestMatch(title, results) {
  // Implement string similarity matching
  return results[0]; // Simple fallback
}

function parseQualityForSort(qualityString) {
  const match = qualityString.match(/(\d{3,4})p/i);
  return match ? parseInt(match[1], 10) : 0;
}

function extractQuality(text) {
  const match = text.match(/(480p|720p|1080p|2160p|4k)/i);
  return match ? match[1] : 'Unknown';
}

function extractSize(text) {
  const match = text.match(/\[([^\]]+)\]/);
  return match ? match[1] : null;
}

async function resolveFinalUrl(url) {
  // Implement URL resolution logic
  return url; // Simple fallback
}

// Export for React Native
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
```

#### 2. Update manifest.json:

```json
{
  "version": "1.0.0",
  "scrapers": [
    {
      "id": "newscraper",
      "name": "New Scraper",
      "description": "Description of your scraper functionality",
      "version": "1.0.0",
      "author": "Your Name",
      "types": ["movie", "tv"],
      "file": "newscraper.js",
      "enabled": true
    }
  ]
}
```

#### 3. Create a test file (e.g., `test_newscraper.js`):

```javascript
const { getStreams } = require('./newscraper.js');

async function testScraper() {
  console.log('=== New Scraper Test ===\n');
  
  const testCases = [
    { name: 'Popular Movie', tmdbId: '550', type: 'movie' },
    { name: 'TV Show Episode', tmdbId: '1396', type: 'tv', season: 1, episode: 1 }
  ];

  for (const testCase of testCases) {
    console.log(`--- Testing: ${testCase.name} ---`);
    console.log(`TMDB ID: ${testCase.tmdbId}, Type: ${testCase.type}`);
    
    const startTime = Date.now();
    const streams = await getStreams(testCase.tmdbId, testCase.type, testCase.season, testCase.episode);
    const endTime = Date.now();
    
    console.log(`Test completed in ${((endTime - startTime) / 1000).toFixed(3)}s`);
    console.log(`Found ${streams.length} streams:\n`);
    
    streams.forEach((stream, index) => {
      console.log(`${index + 1}. ${stream.name}`);
      console.log(`   Title: ${stream.title}`);
      console.log(`   Quality: ${stream.quality}`);
      console.log(`   Size: ${stream.size || 'Unknown'}`);
      console.log(`   Type: ${stream.type}`);
      console.log(`   URL: ${stream.url.substring(0, 80)}...`);
      console.log('');
    });
    
    console.log('==================================================\n');
  }
}

testScraper().catch(console.error);
```

### Scraper Function Parameters

- `tmdbId` (string): The Movie Database ID
- `mediaType` (string): Either "movie" or "tv"
- `seasonNum` (number|null): Season number (for TV shows, null for movies)
- `episodeNum` (number|null): Episode number (for TV shows, null for movies)

### Stream Object Format

```javascript
{
  name: "Provider name (e.g., 'UHDMovies', 'MoviesMod')",
  title: "Descriptive title with quality and technical details",
  url: "Direct stream URL or magnet link",
  quality: "Video quality (e.g., '1080p', '720p', '4K')",
  size: "File size (e.g., '2.5GB', '1.18GB')",
  fileName: "Original filename (optional)",
  type: "direct", // or "torrent" for magnet links
  headers: { // Optional: Custom headers for video player requests
    "Referer": "https://example.com",
    "User-Agent": "Custom User Agent",
    "Origin": "https://example.com"
  }
}
```

#### Headers Support

If your stream requires specific headers for playback (e.g., Referer, User-Agent, Authorization), you can include them in the `headers` object. These headers will be automatically passed to the video player when streaming the content.

**Common use cases:**
- **Referer**: Required by some CDNs to verify the request origin
- **User-Agent**: Some servers block requests without proper user agents
- **Authorization**: For streams requiring authentication tokens
- **Origin**: CORS-related headers for cross-origin requests

**Example with headers:**
```javascript
{
  name: "XPrime",
  title: "Movie Title 2024 1080p",
  url: "https://cdn.example.com/stream.m3u8",
  quality: "1080p",
  type: "direct",
  headers: {
    "Referer": "https://xprime.tv",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  }
}
```

**Note:** Headers are optional. If not provided, the video player will use default headers.

### Advanced Stream Object Example

```javascript
{
  name: "MoviesMod",
  title: "Movie Title 2024 1080p WEB-DL English MSubs\n2.75GB • HEVC • 10-bit",
  url: "https://example.com/download/movie.mp4",
  quality: "1080p",
  size: "2.75GB",
  fileName: "Movie.Title.2024.1080p.WEB-DL.x265.mkv",
  type: "direct",
  headers: {
    "Referer": "https://moviesmod.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  }
}
```

### Best Practices

#### 1. Error Handling
```javascript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error(`[YourScraper] Error in operation: ${error.message}`);
  return [];
}
```

#### 2. Logging
```javascript
console.log(`[YourScraper] Starting search for: ${title}`);
console.log(`[YourScraper] Found ${results.length} results`);
console.error(`[YourScraper] Failed to process link: ${error.message}`);
```

#### 3. Rate Limiting
```javascript
// Add delays between requests
await new Promise(resolve => setTimeout(resolve, 1000));

// Use request queues for multiple operations
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
```

#### 4. User Agents and Headers
```javascript
const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};
```

### Implementing Headers for Video Playback

Many streaming sources require specific headers for video playback. Here's how to implement headers in your scraper:

#### Basic Header Implementation
```javascript
// Define headers that will be passed to the video player
const WORKING_HEADERS = {
  'Referer': 'https://your-source-site.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Origin': 'https://your-source-site.com'
};

// Include headers in your stream object
function createStreamObject(url, quality, title) {
  return {
    name: "YourScraper",
    title: title,
    url: url,
    quality: quality,
    type: 'direct',
    headers: WORKING_HEADERS // These headers will be passed to the video player
  };
}
```

#### Real-World Example (XPrime Pattern)
```javascript
// Headers for XPrime-style sources
const XPRIME_HEADERS = {
  'Referer': 'https://xprime.tv',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// Apply headers to all streams from this source
function processXPrimeStream(streamData) {
  return {
    name: "XPrime",
    title: `${streamData.title} - ${streamData.quality}`,
    url: streamData.url,
    quality: streamData.quality,
    type: 'direct',
    headers: XPRIME_HEADERS // Video player will use these headers
  };
}
```

#### Conditional Headers Based on Source
```javascript
function createStreamWithHeaders(url, quality, title, sourceType) {
  let headers = {};
  
  // Apply different headers based on the source
  switch (sourceType) {
    case 'xprime':
      headers = {
        'Referer': 'https://xprime.tv',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
      break;
    case 'moviesmod':
      headers = {
        'Referer': 'https://moviesmod.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
      break;
    case 'videostr':
      headers = {
        'Referer': 'https://videostr.net/',
        'Origin': 'https://videostr.net/'
      };
      break;
    default:
      // No special headers needed
      headers = undefined;
  }
  
  const streamObject = {
    name: "YourScraper",
    title: title,
    url: url,
    quality: quality,
    type: 'direct'
  };
  
  // Only include headers if they're needed
  if (headers && Object.keys(headers).length > 0) {
    streamObject.headers = headers;
  }
  
  return streamObject;
}
```

#### Headers for Different Stream Types
```javascript
// For M3U8 streams that require referer
function createM3U8Stream(m3u8Url, quality, refererUrl) {
  return {
    name: "YourScraper",
    title: `${quality} Stream`,
    url: m3u8Url,
    quality: quality,
    type: 'direct',
    headers: {
      'Referer': refererUrl,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
}

// For direct MP4 streams with authentication
function createAuthenticatedStream(mp4Url, quality, authToken) {
  return {
    name: "YourScraper",
    title: `${quality} Stream`,
    url: mp4Url,
    quality: quality,
    type: 'direct',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
}
```

#### Important Notes About Headers

1. **Headers are automatically passed to video players**: When you include a `headers` object in your stream, Nuvio will automatically pass these headers to both VLCPlayer and AndroidVideoPlayer.

2. **Common header types**:
   - **Referer**: Most important for CDN validation
   - **User-Agent**: Prevents bot detection
   - **Origin**: Required for CORS compliance
   - **Authorization**: For authenticated streams

3. **Testing headers**: Always test your streams with the headers to ensure they work:
```javascript
// Test if headers are working
async function testStreamWithHeaders(streamUrl, headers) {
  try {
    const response = await fetch(streamUrl, {
      method: 'HEAD',
      headers: headers
    });
    return response.ok || response.status === 206; // 206 for partial content
  } catch (error) {
    console.error('Stream test failed:', error.message);
    return false;
  }
}
```

4. **Header inheritance**: Headers are only applied to video playback, not to scraping requests. Use separate headers for scraping vs. playback.

5. **Performance**: Headers don't impact performance - they're just additional HTTP headers sent with video requests.

#### 5. Caching
```javascript
// Global cache for domain/session data
let domainCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

function getCachedDomain() {
  const now = Date.now();
  if (domainCache && (now - cacheTimestamp < CACHE_TTL)) {
    return domainCache;
  }
  return null;
}
```

#### 6. String Similarity Matching
```javascript
function findBestMatch(target, candidates) {
  let bestMatch = null;
  let bestScore = 0;
  
  for (const candidate of candidates) {
    const score = calculateSimilarity(target.toLowerCase(), candidate.title.toLowerCase());
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }
  
  return bestMatch;
}

function calculateSimilarity(str1, str2) {
  // Simple word-based similarity
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  
  let matches = 0;
  for (const word of words1) {
    if (word.length > 2 && words2.some(w => w.includes(word) || word.includes(w))) {
      matches++;
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
}
```

#### 7. Quality Parsing and Sorting
```javascript
function parseQualityForSort(qualityString) {
  if (!qualityString) return 0;
  const match = qualityString.match(/(\d{3,4})p/i);
  return match ? parseInt(match[1], 10) : 0;
}

function extractQuality(text) {
  if (!text) return 'Unknown';
  const qualityMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
  return qualityMatch ? qualityMatch[1] : 'Unknown';
}

function getTechDetails(qualityString) {
  if (!qualityString) return [];
  const details = [];
  const lowerText = qualityString.toLowerCase();
  if (lowerText.includes('10bit')) details.push('10-bit');
  if (lowerText.includes('hevc') || lowerText.includes('x265')) details.push('HEVC');
  if (lowerText.includes('hdr')) details.push('HDR');
  return details;
}
```

### React Native Compatibility

#### Required Dependencies
```javascript
// Use React Native compatible cheerio
const cheerio = require('cheerio-without-node-native');

// Avoid Node.js modules
// ❌ Don't use: require('fs'), require('path'), require('crypto')
// ✅ Use: global variables, fetch(), built-in JavaScript functions
```

#### HTTP Requests
```javascript
// ✅ Use fetch() - React Native compatible
const response = await fetch(url, {
  method: 'GET',
  headers: { 'User-Agent': '...' }
});

// ❌ Avoid: axios, request, http modules
```

#### Async/Await Usage
**IMPORTANT:** Do not use `async/await` syntax in your scrapers for React Native compatibility.

```javascript
// ❌ Don't use async/await
async function getStreams(title, year) {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

// ✅ Use Promises with .then()/.catch()
function getStreams(title, year) {
  return fetch(url)
    .then(response => response.json())
    .then(data => {
      // Process data
      return processedStreams;
    })
    .catch(error => {
      console.error(`[YourScraper] Error: ${error.message}`);
      return [];
    });
}

// ✅ Or use Promise constructor for complex flows
function getStreams(title, year) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then(response => response.json())
      .then(data => {
        // Process data
        const streams = processData(data);
        resolve(streams);
      })
      .catch(error => {
        console.error(`[YourScraper] Error: ${error.message}`);
        resolve([]); // Return empty array instead of rejecting
      });
  });
}
```

#### Data Storage
```javascript
// ✅ Use global variables for caching
let globalCache = {};

// ❌ Avoid: file system operations
// Don't use: fs.writeFileSync(), localStorage (not available)
```

#### URL Handling
```javascript
// ✅ Use built-in URL constructor
const urlObject = new URL(link);
const params = urlObject.searchParams.get('param');

// ✅ Use URLSearchParams for form data
const formData = new URLSearchParams();
formData.append('key', 'value');
```

#### Base64 Operations
```javascript
// ✅ Use built-in functions
const decoded = atob(encodedString); // Base64 decode
const encoded = btoa(plainString);   // Base64 encode
```

### Testing Your Scraper

#### 1. Unit Testing
```bash
# Run your test file
node test_newscraper.js
```

#### 2. Integration Testing
- Test with various TMDB IDs
- Test both movies and TV shows
- Test edge cases (missing content, network errors)
- Verify stream URLs are accessible

#### 3. Performance Testing
- Monitor response times
- Check memory usage
- Test with multiple concurrent requests

### Common Patterns

#### 1. Dynamic Domain Fetching
```javascript
async function getLatestDomain() {
  try {
    const response = await fetch('https://api.example.com/domains');
    const data = await response.json();
    return data.currentDomain;
  } catch (error) {
    console.error('Failed to fetch domain, using fallback');
    return 'https://fallback-domain.com';
  }
}
```

#### 2. SID Link Resolution
```javascript
async function resolveSidLink(sidUrl) {
  // Multi-step process common in many scrapers
  const step1Response = await fetch(sidUrl);
  const step1Html = await step1Response.text();
  
  // Extract form data
  const $ = cheerio.load(step1Html);
  const formData = new URLSearchParams();
  formData.append('token', $('input[name="token"]').val());
  
  // Submit form
  const step2Response = await fetch(actionUrl, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  
  // Extract final URL
  const finalHtml = await step2Response.text();
  const finalUrl = extractFinalUrl(finalHtml);
  
  return finalUrl;
}
```

#### 3. Multiple Download Options
```javascript
async function processDownloadLink(link) {
  const downloadOptions = await getDownloadOptions(link.url);
  
  // Try options in order of preference
  for (const option of downloadOptions.sort((a, b) => a.priority - b.priority)) {
    try {
      const finalUrl = await resolveDownloadOption(option);
      if (await validateUrl(finalUrl)) {
        return createStreamObject(finalUrl, link);
      }
    } catch (error) {
      console.log(`Option ${option.name} failed: ${error.message}`);
    }
  }
  
  return null;
}
```

## Publishing to GitHub

1. **Create a new repository on GitHub:**
   - Go to github.com
   - Click "New repository"
   - Name it `nuvio-local-scrapers`
   - Make it public
   - Don't initialize with README (we already have one)

2. **Upload files:**
   ```bash
   cd /path/to/local-scrapers-repo
   git init
   git add .
   git commit -m "Initial commit with UHD Movies scraper"
   git branch -M main
   git remote add origin https://github.com/tapframe/nuvio-local-scrapers.git
   git push -u origin main
   ```

3. **Get the raw URL:**
   ```
   https://raw.githubusercontent.com/tapframe/nuvio-local-scrapers/main/
   ```

## Contributing

### Development Workflow

1. **Fork this repository**
   ```bash
   # Clone your fork
   git clone https://github.com/tapframe/nuvio-local-scrapers.git
   cd nuvio-local-scrapers
   ```

2. **Create a new branch**
   ```bash
   git checkout -b add-newscraper
   ```

3. **Develop your scraper**
   - Create `newscraper.js`
   - Update `manifest.json`
   - Create `test_newscraper.js`
   - Test thoroughly

4. **Test your scraper**
   ```bash
   # Run tests
   node test_newscraper.js
   
   # Test with different content types
   # Verify stream URLs work
   # Check error handling
   ```

5. **Commit and push**
   ```bash
   git add .
   git commit -m "Add NewScraper with support for movies and TV shows"
   git push origin add-newscraper
   ```

6. **Submit a pull request**
   - Include description of the scraper
   - List supported features
   - Provide test results
   - Mention any limitations

### Code Review Checklist

Before submitting, ensure your scraper:

- [ ] **Follows naming conventions** (camelCase, descriptive names)
- [ ] **Has proper error handling** (try-catch blocks, graceful failures)
- [ ] **Includes comprehensive logging** (with scraper name prefix)
- [ ] **Is React Native compatible** (no Node.js modules, uses fetch())
- [ ] **Has a working test file** (tests movies and TV shows)
- [ ] **Updates manifest.json** (correct metadata and version)
- [ ] **Respects rate limits** (reasonable delays between requests)
- [ ] **Handles edge cases** (missing content, network errors)
- [ ] **Returns proper stream objects** (correct format and required fields)
- [ ] **Is well-documented** (comments explaining complex logic)

### Scraper Quality Standards

#### Performance
- Response time < 15 seconds for most requests
- Handles concurrent requests gracefully
- Minimal memory usage
- Efficient DOM parsing

#### Reliability
- Success rate > 80% for popular content
- Graceful degradation when source is unavailable
- Proper timeout handling
- Retry logic for transient failures

#### User Experience
- Clear, descriptive stream titles
- Accurate quality and size information
- Sorted results (highest quality first)
- Consistent naming conventions

### Debugging Tips

#### 1. Network Issues
```javascript
// Add request/response logging
console.log(`[YourScraper] Requesting: ${url}`);
console.log(`[YourScraper] Response status: ${response.status}`);
console.log(`[YourScraper] Response headers:`, response.headers);
```

#### 2. HTML Parsing Issues
```javascript
// Log HTML content for inspection
console.log(`[YourScraper] HTML length: ${html.length}`);
console.log(`[YourScraper] Page title: ${$('title').text()}`);
console.log(`[YourScraper] Found ${$('.target-selector').length} elements`);
```

#### 3. URL Resolution Issues
```javascript
// Validate URLs before returning
async function validateUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok || response.status === 206; // 206 for partial content
  } catch (error) {
    return false;
  }
}
```

### Real-World Examples

#### UHDMovies Scraper Features
- **Episode-specific extraction** for TV shows
- **Multiple tech domains** (tech.unblockedgames.world, tech.examzculture.in, etc.)
- **SID link resolution** with multi-step form submission
- **Driveleech URL processing** with multiple download methods
- **Quality parsing** with technical details (10-bit, HEVC, HDR)

#### MoviesMod Scraper Features
- **Dynamic domain fetching** from GitHub repository
- **String similarity matching** for content selection
- **Intermediate link resolution** (modrefer.in decoding)
- **Multiple download servers** (Resume Cloud, Worker Bot, Instant Download)
- **Broken link filtering** (report pages, invalid URLs)
- **Parallel processing** of multiple quality options

### Advanced Techniques

#### 1. Multi-Domain Support
```javascript
const TECH_DOMAINS = [
  'tech.unblockedgames.world',
  'tech.examzculture.in',
  'tech.creativeexpressionsblog.com',
  'tech.examdegree.site'
];

function isTechDomain(url) {
  return TECH_DOMAINS.some(domain => url.includes(domain));
}
```

#### 2. Form-Based Authentication
```javascript
async function submitVerificationForm(formUrl, formData) {
  const response = await fetch(formUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': previousUrl
    },
    body: new URLSearchParams(formData).toString()
  });
  return response;
}
```

#### 3. JavaScript Execution Simulation
```javascript
// Extract dynamic values from JavaScript code
function extractFromJavaScript(html) {
  const cookieMatch = html.match(/s_343\('([^']+)',\s*'([^']+)'/);
  const linkMatch = html.match(/c\.setAttribute\("href",\s*"([^"]+)"\)/);
  
  return {
    cookieName: cookieMatch?.[1],
    cookieValue: cookieMatch?.[2],
    linkPath: linkMatch?.[1]
  };
}
```

### Maintenance

#### Updating Existing Scrapers
- Monitor source website changes
- Update selectors and logic as needed
- Test after updates
- Increment version number in manifest

#### Handling Source Changes
- Implement fallback mechanisms
- Use multiple extraction methods
- Add domain rotation support
- Monitor for breaking changes

### Troubleshooting

#### Common Issues

1. **CORS Errors**
   - Use appropriate headers
   - Consider proxy solutions
   - Check source website restrictions

2. **Rate Limiting**
   - Add delays between requests
   - Implement exponential backoff
   - Use different user agents

3. **Captcha/Bot Detection**
   - Rotate user agents
   - Add realistic delays
   - Implement session management

4. **Dynamic Content**
   - Look for API endpoints
   - Parse JavaScript for data
   - Use multiple extraction methods

#### Getting Help

- Check existing scraper implementations
- Review error logs carefully
- Test with different content types
- Ask for help in community discussions

---

## 🧰 Tools & Technologies

<p align="left">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=javascript,nodejs,github,githubactions&theme=light&perline=4" />
  </a>
</p>

---



## 📄 License

[![GNU GPLv3 Image](https://www.gnu.org/graphics/gplv3-127x51.png)](http://www.gnu.org/licenses/gpl-3.0.en.html)

These scrapers are **free software**: you can use, study, share, and modify them as you wish.

They are distributed under the terms of the [GNU General Public License](https://www.gnu.org/licenses/gpl.html) version 3 or later, published by the Free Software Foundation.

---

## ⚖️ DMCA Disclaimer

We hereby issue this notice to clarify that these scrapers function similarly to a standard web browser by fetching video files from the internet.

- **No content is hosted by this repository or the Nuvio application.**
- Any content accessed is hosted by third-party websites.
- Users are solely responsible for their usage and must comply with their local laws.

If you believe content is violating copyright laws, please contact the **actual file hosts**, **not** the developers of this repository or the Nuvio app.

---

## Support

For issues or questions:
- Open an issue on GitHub
- Check the Nuvio app documentation
- Join the community discussions

---

**Thank You for using Nuvio Local Scrapers!**
