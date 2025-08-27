// HDRezka Scraper for Nuvio Local Scrapers
// React Native compatible version - No async/await for sandbox compatibility

// Import cheerio for HTML parsing (React Native compatible)
const cheerio = require('cheerio-without-node-native');

console.log('[HDRezka] Using cheerio-without-node-native for DOM parsing');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const REZKA_BASE = 'https://hdrezka.ag/';
const BASE_HEADERS = {
    'X-Hdrezka-Android-App': '1',
    'X-Hdrezka-Android-App-Version': '2.2.0',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive'
};

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            ...BASE_HEADERS,
            ...options.headers
        }
    }).then(function (response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    });
}

// Generate random favs parameter
function generateRandomFavs() {
    const randomHex = () => Math.floor(Math.random() * 16).toString(16);
    const generateSegment = (length) => Array.from({ length }, randomHex).join('');

    return `${generateSegment(8)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(12)}`;
}

// Extract title and year from search result
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

// Parse video links from HDRezka response (optimized)
function parseVideoLinks(inputString) {
    if (!inputString) {
        console.log('[HDRezka] No video links found');
        return {};
    }

    console.log(`[HDRezka] Parsing video links from stream URL data`);
    const linksArray = inputString.split(',');
    const result = {};

    // Pre-compile regex patterns for better performance
    const simplePattern = /\[([^<\]]+)\](https?:\/\/[^\s,]+\.mp4|null)/;
    const qualityPattern = /\[<span[^>]*>([^<]+)/;
    const urlPattern = /\][^[]*?(https?:\/\/[^\s,]+\.mp4|null)/;

    for (const link of linksArray) {
        // Try simple format first (non-HTML)
        let match = link.match(simplePattern);

        // If not found, try HTML format with more flexible pattern
        if (!match) {
            const qualityMatch = link.match(qualityPattern);
            const urlMatch = link.match(urlPattern);

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
                console.log(`[HDRezka] Found ${qualityText}: ${mp4Url.substring(0, 50)}...`);
            } else {
                console.log(`[HDRezka] Premium quality ${qualityText} requires login (null URL)`);
            }
        } else {
            console.log(`[HDRezka] Could not parse quality from: ${link.substring(0, 100)}...`);
        }
    }

    console.log(`[HDRezka] Found ${Object.keys(result).length} valid qualities: ${Object.keys(result).join(', ')}`);
    return result;
}

// Parse subtitles from HDRezka response (optimized)
function parseSubtitles(inputString) {
    if (!inputString) {
        console.log('[HDRezka] No subtitles found');
        return [];
    }

    console.log(`[HDRezka] Parsing subtitles data`);
    const linksArray = inputString.split(',');
    const captions = [];

    // Pre-compile regex pattern for better performance
    const subtitlePattern = /\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/;

    for (const link of linksArray) {
        const match = link.match(subtitlePattern);

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
            console.log(`[HDRezka] Found subtitle ${language}: ${url.substring(0, 50)}...`);
        }
    }

    console.log(`[HDRezka] Found ${captions.length} subtitles`);
    return captions;
}

// Search for content and find media ID
function searchAndFindMediaId(media) {
    console.log(`[HDRezka] Searching for title: ${media.title}, type: ${media.type}, year: ${media.releaseYear || 'any'}`);

    const itemRegexPattern = /<a href="([^"]+)"><span class="enty">([^<]+)<\/span> \(([^)]+)\)/g;
    const idRegexPattern = /\/(\d+)-[^/]+\.html$/;

    const fullUrl = new URL('/engine/ajax/search.php', REZKA_BASE);
    fullUrl.searchParams.append('q', media.title);

    console.log(`[HDRezka] Making search request to: ${fullUrl.toString()}`);
    return makeRequest(fullUrl.toString()).then(function (response) {
        return response.text();
    }).then(function (searchData) {
        console.log(`[HDRezka] Search response length: ${searchData.length}`);

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
                const type = isMovie ? 'movie' : isShow ? 'tv' : 'unknown';

                movieData.push({
                    id: id ?? '',
                    year: result.year ?? 0,
                    type,
                    url,
                    title: match[2]
                });
                console.log(`[HDRezka] Found: id=${id}, title=${match[2]}, type=${type}, year=${result.year}`);
            }
        }

        // Filter by year if provided
        let filteredItems = movieData;
        if (media.releaseYear) {
            filteredItems = movieData.filter(item => item.year === media.releaseYear);
            console.log(`[HDRezka] Items filtered by year ${media.releaseYear}: ${filteredItems.length}`);
        }

        // Filter by type if provided
        if (media.type) {
            filteredItems = filteredItems.filter(item => item.type === media.type);
            console.log(`[HDRezka] Items filtered by type ${media.type}: ${filteredItems.length}`);
        }

        if (filteredItems.length === 0 && movieData.length > 0) {
            console.log(`[HDRezka] No exact match found, using first result: ${movieData[0].title}`);
            return movieData[0];
        }

        if (filteredItems.length > 0) {
            console.log(`[HDRezka] Selected item: id=${filteredItems[0].id}, title=${filteredItems[0].title}`);
            return filteredItems[0];
        } else {
            console.log(`[HDRezka] No matching items found`);
            return null;
        }
    });
}

// Get translator ID from media page
function getTranslatorId(url, id, media) {
    console.log(`[HDRezka] Getting translator ID for url=${url}, id=${id}`);

    // Make sure the URL is absolute
    const fullUrl = url.startsWith('http') ? url : `${REZKA_BASE}${url.startsWith('/') ? url.substring(1) : url}`;
    console.log(`[HDRezka] Making request to: ${fullUrl}`);

    return makeRequest(fullUrl).then(function (response) {
        return response.text();
    }).then(function (responseText) {
        console.log(`[HDRezka] Translator page response length: ${responseText.length}`);

        // Translator ID 238 represents the Original + subtitles player.
        if (responseText.includes(`data-translator_id="238"`)) {
            console.log(`[HDRezka] Found translator ID 238 (Original + subtitles)`);
            return '238';
        }

        const functionName = media.type === 'movie' ? 'initCDNMoviesEvents' : 'initCDNSeriesEvents';
        const regexPattern = new RegExp(`sof\.tv\.${functionName}\\(${id}, ([^,]+)`, 'i');
        const match = responseText.match(regexPattern);
        const translatorId = match ? match[1] : null;

        console.log(`[HDRezka] Extracted translator ID: ${translatorId}`);
        return translatorId;
    });
}

// Get stream data from HDRezka
function getStreamData(id, translatorId, media) {
    console.log(`[HDRezka] Getting stream for id=${id}, translatorId=${translatorId}`);

    const searchParams = new URLSearchParams();
    searchParams.append('id', id);
    searchParams.append('translator_id', translatorId);

    if (media.type === 'tv') {
        searchParams.append('season', media.season.number.toString());
        searchParams.append('episode', media.episode.number.toString());
        console.log(`[HDRezka] TV params: season=${media.season.number}, episode=${media.episode.number}`);
    }

    const randomFavs = generateRandomFavs();
    searchParams.append('favs', randomFavs);
    searchParams.append('action', media.type === 'tv' ? 'get_stream' : 'get_movie');

    const fullUrl = `${REZKA_BASE}ajax/get_cdn_series/`;
    console.log(`[HDRezka] Making stream request with action=${media.type === 'tv' ? 'get_stream' : 'get_movie'}`);

    return makeRequest(fullUrl, {
        method: 'POST',
        body: searchParams,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }).then(function (response) {
        return response.text();
    }).then(function (rawText) {
        console.log(`[HDRezka] Stream response length: ${rawText.length}`);

        try {
            const parsedResponse = JSON.parse(rawText);
            console.log(`[HDRezka] Parsed response successfully`);

            // Process video qualities and subtitles synchronously
            const qualities = parseVideoLinks(parsedResponse.url);
            const captions = parseSubtitles(parsedResponse.subtitle);

            return { qualities, captions };
        } catch (e) {
            console.error(`[HDRezka] Failed to parse JSON response: ${e.message}`);
            console.log(`[HDRezka] Raw response: ${rawText.substring(0, 200)}...`);
            return null;
        }
    });
}

// Get file size using HEAD request
function getFileSize(url) {
    console.log(`[HDRezka] Getting file size for: ${url.substring(0, 60)}...`);

    return fetch(url, {
        method: 'HEAD',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }).then(function (response) {
        if (response.ok) {
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
                const bytes = parseInt(contentLength, 10);
                const sizeFormatted = formatFileSize(bytes);
                console.log(`[HDRezka] File size: ${sizeFormatted}`);
                return sizeFormatted;
            }
        }

        console.log(`[HDRezka] Could not determine file size`);
        return null;
    }).catch(function (error) {
        console.log(`[HDRezka] Error getting file size: ${error.message}`);
        return null;
    });
}

// Format file size in human readable format
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Parse quality for sorting
function parseQualityForSort(qualityString) {
    if (!qualityString) return 0;
    const match = qualityString.match(/(\d{3,4})p/i);
    return match ? parseInt(match[1], 10) : 0;
}

// Main function to get streams for TMDB content
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[HDRezka] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${seasonNum ? `, S${seasonNum}E${episodeNum}` : ''}`);

    // Get TMDB info
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    return makeRequest(tmdbUrl).then(function (tmdbResponse) {
        return tmdbResponse.json();
    }).then(function (tmdbData) {
        const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
        const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);

        if (!title) {
            throw new Error('Could not extract title from TMDB response');
        }

        console.log(`[HDRezka] TMDB Info: "${title}" (${year})`);

        // Create media object
        const media = {
            type: mediaType === 'tv' ? 'tv' : 'movie',
            title: title,
            releaseYear: year ? parseInt(year) : null
        };

        // Add season/episode for TV shows
        if (mediaType === 'tv') {
            media.season = { number: seasonNum || 1 };
            media.episode = { number: episodeNum || 1 };
        }

        // Step 1: Search and find media ID
        return searchAndFindMediaId(media).then(function (searchResult) {
            if (!searchResult || !searchResult.id) {
                console.log('[HDRezka] No search result found');
                return [];
            }

            // Step 2: Get translator ID
            return getTranslatorId(searchResult.url, searchResult.id, media).then(function (translatorId) {
                if (!translatorId) {
                    console.log('[HDRezka] No translator ID found');
                    return [];
                }

                // Step 3: Get stream data
                return getStreamData(searchResult.id, translatorId, media).then(function (streamData) {
                    if (!streamData || !streamData.qualities) {
                        console.log('[HDRezka] No stream data found');
                        return [];
                    }

                    // Convert to Nuvio stream format with size detection
                    const streamEntries = Object.entries(streamData.qualities);
                    const streamPromises = streamEntries
                        .filter(([quality, data]) => data.url && data.url !== 'null')
                        .map(([quality, data]) => {
                            const cleanQuality = quality.replace(/p.*$/, 'p'); // "1080p Ultra" -> "1080p"

                            // Get file size using Promise chain
                            return getFileSize(data.url).then(function (fileSize) {
                                return {
                                    name: "HDRezka",
                                    title: `${title} ${year ? `(${year})` : ''} ${quality}${mediaType === 'tv' ? ` S${seasonNum}E${episodeNum}` : ''}`,
                                    url: data.url,
                                    quality: cleanQuality,
                                    size: fileSize,
                                    type: 'direct'
                                };
                            });
                        });

                    return Promise.all(streamPromises).then(function (streams) {
                        // Sort by quality (highest first) - optimized
                        if (streams.length > 1) {
                            streams.sort(function (a, b) {
                                const qualityA = parseQualityForSort(a.quality);
                                const qualityB = parseQualityForSort(b.quality);
                                return qualityB - qualityA;
                            });
                        }

                        console.log(`[HDRezka] Successfully processed ${streams.length} streams`);
                        return streams;
                    });
                });
            });
        });
    }).catch(function (error) {
        console.error(`[HDRezka] Error in getStreams: ${error.message}`);
        return [];
    });
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    // For React Native environment
    global.getStreams = getStreams;
}