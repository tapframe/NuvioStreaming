// Watch32 Scraper for Nuvio Local Scrapers
// React Native compatible version - Standalone (no external dependencies)

// Import cheerio-without-node-native for React Native
const cheerio = require('cheerio-without-node-native');
console.log('[Watch32] Using cheerio-without-node-native for DOM parsing');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const MAIN_URL = 'https://watch32.sx';
const VIDEOSTR_URL = 'https://videostr.net';

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
    };

    return fetch(url, {
        method: options.method || 'GET',
        headers: { ...defaultHeaders, ...options.headers },
        ...options
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    })
    .catch(error => {
        console.error(`[Watch32] Request failed for ${url}: ${error.message}`);
        throw error;
    });
}

// Search for content
function searchContent(query) {
    const searchUrl = `${MAIN_URL}/search/${query.replace(/\s+/g, '-')}`;
    console.log(`[Watch32] Searching: ${searchUrl}`);
    
    return makeRequest(searchUrl)
        .then(response => response.text())
        .then(html => {
            const $ = cheerio.load(html);
            const results = [];
            
            $('.flw-item').each((i, element) => {
                const title = $(element).find('h2.film-name > a').attr('title');
                const link = $(element).find('h2.film-name > a').attr('href');
                const poster = $(element).find('img.film-poster-img').attr('data-src');
                
                if (title && link) {
                    results.push({
                        title,
                        url: link.startsWith('http') ? link : `${MAIN_URL}${link}`,
                        poster
                    });
                }
            });
            
            console.log(`[Watch32] Found ${results.length} search results`);
            return results;
        })
        .catch(error => {
            console.error(`[Watch32] Search error: ${error.message}`);
            return [];
        });
}

// Get content details (movie or TV series)
function getContentDetails(url) {
    console.log(`[Watch32] Getting content details: ${url}`);
    
    return makeRequest(url)
        .then(response => response.text())
        .then(html => {
            const $ = cheerio.load(html);
            const contentId = $('.detail_page-watch').attr('data-id');
            const name = $('.detail_page-infor h2.heading-name > a').text();
            const isMovie = url.includes('movie');
            
            if (isMovie) {
                return {
                    type: 'movie',
                    name,
                    data: `list/${contentId}`
                };
            } else {
                // Get TV series episodes
                return makeRequest(`${MAIN_URL}/ajax/season/list/${contentId}`)
                    .then(response => response.text())
                    .then(seasonsHtml => {
                        const $seasons = cheerio.load(seasonsHtml);
                        const episodes = [];
                        const seasonPromises = [];
                        
                        $seasons('a.ss-item').each((i, season) => {
                            const seasonId = $(season).attr('data-id');
                            const seasonNum = $(season).text().replace('Season ', '');
                            
                            const episodePromise = makeRequest(`${MAIN_URL}/ajax/season/episodes/${seasonId}`)
                                .then(response => response.text())
                                .then(episodesHtml => {
                                    const $episodes = cheerio.load(episodesHtml);
                                    
                                    $episodes('a.eps-item').each((i, episode) => {
                                        const epId = $(episode).attr('data-id');
                                        const title = $(episode).attr('title');
                                        const match = title.match(/Eps (\d+): (.+)/);
                                        
                                        if (match) {
                                            episodes.push({
                                                id: epId,
                                                episode: parseInt(match[1]),
                                                name: match[2],
                                                season: parseInt(seasonNum.replace('Series', '').trim()),
                                                data: `servers/${epId}`
                                            });
                                        }
                                    });
                                });
                            
                            seasonPromises.push(episodePromise);
                        });
                        
                        return Promise.all(seasonPromises)
                            .then(() => ({
                                type: 'series',
                                name,
                                episodes
                            }));
                    });
            }
        })
        .catch(error => {
            console.error(`[Watch32] Content details error: ${error.message}`);
            return null;
        });
}

// Get server links for content
function getServerLinks(data) {
    console.log(`[Watch32] Getting server links: ${data}`);
    
    return makeRequest(`${MAIN_URL}/ajax/episode/${data}`)
        .then(response => response.text())
        .then(html => {
            const $ = cheerio.load(html);
            const servers = [];
            
            $('a.link-item').each((i, element) => {
                const linkId = $(element).attr('data-linkid') || $(element).attr('data-id');
                if (linkId) {
                    servers.push(linkId);
                }
            });
            
            return servers;
        })
        .catch(error => {
            console.error(`[Watch32] Server links error: ${error.message}`);
            return [];
        });
}

// Get source URL from link ID
function getSourceUrl(linkId) {
    console.log(`[Watch32] Getting source URL for linkId: ${linkId}`);
    
    return makeRequest(`${MAIN_URL}/ajax/episode/sources/${linkId}`)
        .then(response => response.json())
        .then(data => data.link)
        .catch(error => {
            console.error(`[Watch32] Source URL error: ${error.message}`);
            return null;
        });
}

// Extract M3U8 from Videostr
function extractVideostrM3u8(url) {
    console.log(`[Watch32] Extracting from Videostr: ${url}`);
    
    const headers = {
        'Accept': '*/*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': VIDEOSTR_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; Win64; x64) AppleWebKit/537.36'
    };

    // Extract ID from URL
    const id = url.split('/').pop().split('?')[0];
    
    // Get nonce from embed page
    return makeRequest(url, { headers })
        .then(response => response.text())
        .then(embedHtml => {
            // Try to find 48-character nonce
            let nonce = embedHtml.match(/\b[a-zA-Z0-9]{48}\b/);
            if (nonce) {
                nonce = nonce[0];
            } else {
                // Try to find three 16-character segments
                const matches = embedHtml.match(/\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b.*?\b([a-zA-Z0-9]{16})\b/);
                if (matches) {
                    nonce = matches[1] + matches[2] + matches[3];
                }
            }
            
            if (!nonce) {
                throw new Error('Could not extract nonce');
            }
            
            console.log(`[Watch32] Extracted nonce: ${nonce}`);
            
            // Get sources from API
            const apiUrl = `${VIDEOSTR_URL}/embed-1/v3/e-1/getSources?id=${id}&_k=${nonce}`;
            console.log(`[Watch32] API URL: ${apiUrl}`);
            
            return makeRequest(apiUrl, { headers })
                .then(response => response.json())
                .then(sourcesData => {
                    console.log('[Watch32] Sources data:', JSON.stringify(sourcesData, null, 2));
                    
                    if (!sourcesData.sources || sourcesData.sources.length === 0) {
                        throw new Error('No sources found in response');
                    }
                    
                    // Get the first source file (matching Kotlin logic)
                    const encoded = sourcesData.sources[0].file;
                    console.log('[Watch32] Encoded source:', encoded);
                    
                    // Check if sources is already an M3U8 URL
                    if (encoded.includes('.m3u8')) {
                        console.log('[Watch32] Source is already M3U8 URL');
                        return encoded;
                    }
                    
                    console.log('[Watch32] Sources are encrypted, attempting to decrypt...');
                    
                    // Get decryption key - use 'mega' key like Kotlin version
                    return makeRequest('https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json')
                        .then(response => response.json())
                        .then(keyData => {
                            console.log('[Watch32] Key data:', JSON.stringify(keyData, null, 2));
                            
                            const key = keyData.mega; // Use 'mega' key like Kotlin
                            
                            if (!key) {
                                throw new Error('Could not get decryption key (mega)');
                            }
                            
                            console.log('[Watch32] Using mega key for decryption');
                            
                            // Decrypt using Google Apps Script - exact same logic as Kotlin
                            const decodeUrl = 'https://script.google.com/macros/s/AKfycbxHbYHbrGMXYD2-bC-C43D3njIbU-wGiYQuJL61H4vyy6YVXkybMNNEPJNPPuZrD1gRVA/exec';
                            const fullUrl = `${decodeUrl}?encrypted_data=${encodeURIComponent(encoded)}&nonce=${encodeURIComponent(nonce)}&secret=${encodeURIComponent(key)}`;
                            
                            console.log('[Watch32] Decryption URL:', fullUrl);
                            
                            return makeRequest(fullUrl)
                                .then(response => response.text())
                                .then(decryptedData => {
                                    console.log('[Watch32] Decrypted response:', decryptedData);
                                    
                                    // Extract file URL from decrypted response - exact same regex as Kotlin
                                    const fileMatch = decryptedData.match(/"file":"(.*?)"/); 
                                    if (fileMatch) {
                                        const m3u8Url = fileMatch[1];
                                        console.log('[Watch32] Extracted M3U8 URL:', m3u8Url);
                                        return m3u8Url;
                                    } else {
                                        throw new Error('Video URL not found in decrypted response');
                                    }
                                });
                        });
                })
                .then(finalM3u8Url => {
                    console.log(`[Watch32] Final M3U8 URL: ${finalM3u8Url}`);
                    
                    // Accept both megacdn and other reliable CDN links
                    if (!finalM3u8Url.includes('megacdn.co') && !finalM3u8Url.includes('akmzed.cloud') && !finalM3u8Url.includes('sunnybreeze')) {
                        console.log('[Watch32] Skipping unreliable CDN link');
                        return null;
                    }
                    
                    // Parse master playlist to extract quality streams
                    return parseM3U8Qualities(finalM3u8Url)
                        .then(qualities => ({
                            m3u8Url: finalM3u8Url,
                            qualities,
                            headers: {
                                'Referer': 'https://videostr.net/',
                                'Origin': 'https://videostr.net/',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        }));
                });
        })
        .catch(error => {
            console.error(`[Watch32] Videostr extraction error: ${error.message}`);
            return null;
        });
}

// Parse M3U8 master playlist to extract qualities
function parseM3U8Qualities(masterUrl) {
    return makeRequest(masterUrl, {
        headers: {
            'Referer': 'https://videostr.net/',
            'Origin': 'https://videostr.net/'
        }
    })
    .then(response => response.text())
    .then(playlist => {
        const qualities = [];
        
        // Parse M3U8 master playlist
        const lines = playlist.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const nextLine = lines[i + 1]?.trim();
                if (nextLine && !nextLine.startsWith('#')) {
                    // Extract resolution and bandwidth
                    const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
                    
                    const resolution = resolutionMatch ? resolutionMatch[1] : 'Unknown';
                    const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
                    
                    // Determine quality label
                    let quality = 'Unknown';
                    if (resolution.includes('1920x1080')) quality = '1080p';
                    else if (resolution.includes('1280x720')) quality = '720p';
                    else if (resolution.includes('640x360')) quality = '360p';
                    else if (resolution.includes('854x480')) quality = '480p';
                    
                    qualities.push({
                        quality,
                        resolution,
                        bandwidth,
                        url: nextLine.startsWith('http') ? nextLine : new URL(nextLine, masterUrl).href
                    });
                }
            }
        }
        
        // Sort by bandwidth (highest first)
        qualities.sort((a, b) => b.bandwidth - a.bandwidth);
        
        return qualities;
    })
    .catch(error => {
        console.error(`[Watch32] Error parsing M3U8 qualities: ${error.message}`);
        return [];
    });
}

// Main scraping function
function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[Watch32] Searching for: ${tmdbId} (${mediaType})`);
    
    // First, get movie/TV show details from TMDB
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    
    return makeRequest(tmdbUrl)
        .then(response => response.json())
        .then(tmdbData => {
            const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
            const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);
            
            if (!title) {
                throw new Error('Could not extract title from TMDB response');
            }
            
            console.log(`[Watch32] TMDB Info: "${title}" (${year || 'N/A'})`);
            
            // Build search query - use title instead of TMDB ID
            const query = year ? `${title} ${year}` : title;
            
            return searchContent(query).then(searchResults => ({ searchResults, query, tmdbData }));
        })
        .then(({ searchResults, query, tmdbData }) => {
            if (searchResults.length === 0) {
                console.log('[Watch32] No search results found');
                return [];
            }
            
            console.log(`[Watch32] Found ${searchResults.length} results`);
            
            // Try to find exact match first, then partial match
            let selectedResult = searchResults.find(result => 
                result.title.toLowerCase() === query.toLowerCase()
            );
            
            if (!selectedResult) {
                // Look for best partial match (contains all words from query)
                const queryWords = query.toLowerCase().split(' ');
                selectedResult = searchResults.find(result => {
                    const titleLower = result.title.toLowerCase();
                    return queryWords.every(word => titleLower.includes(word));
                });
            }
            
            // Fallback to first result if no good match found
            if (!selectedResult) {
                selectedResult = searchResults[0];
            }
            
            console.log(`[Watch32] Selected: ${selectedResult.title}`);
            
            // Get content details
            return getContentDetails(selectedResult.url).then(contentDetails => ({ contentDetails, tmdbData }));
        })
        .then(({ contentDetails, tmdbData }) => {
            if (!contentDetails) {
                console.log('[Watch32] Could not get content details');
                return [];
            }
            
            let itemsToProcess = [];
            
            if (contentDetails.type === 'movie') {
                itemsToProcess.push({ data: contentDetails.data, episodeMeta: null });
            } else {
                // For TV series, filter by episode/season if specified
                let episodes = contentDetails.episodes;
                
                if (season) {
                    episodes = episodes.filter(ep => ep.season === season);
                }
                
                if (episode) {
                    episodes = episodes.filter(ep => ep.episode === episode);
                }
                
                if (episodes.length === 0) {
                    console.log('[Watch32] No matching episodes found');
                    return [];
                }
                
                // Process all matching episodes in parallel
                episodes.forEach(ep => {
                    console.log(`[Watch32] Queue episode: S${ep.season}E${ep.episode} - ${ep.name}`);
                    itemsToProcess.push({ data: ep.data, episodeMeta: ep });
                });
            }
            
            // Process all data
            const allPromises = itemsToProcess.map(item => {
                return getServerLinks(item.data)
                    .then(serverLinks => {
                        console.log(`[Watch32] Found ${serverLinks.length} servers`);
                        
                        // Process all server links
                        const linkPromises = serverLinks.map(linkId => {
                            return getSourceUrl(linkId)
                                .then(sourceUrl => {
                                    if (!sourceUrl) return null;
                                    
                                    console.log(`[Watch32] Source URL: ${sourceUrl}`);
                                    
                                    // Check if it's a videostr URL
                                    if (sourceUrl.includes('videostr.net')) {
                                        return extractVideostrM3u8(sourceUrl);
                                    }
                                    return null;
                                })
                                .catch(error => {
                                    console.error(`[Watch32] Error processing link ${linkId}: ${error.message}`);
                                    return null;
                                });
                        });
                        
                        return Promise.all(linkPromises);
                    })
                    .then(results => ({ results, episodeMeta: item.episodeMeta }));
            });
            
            return Promise.all(allPromises).then(resultsWithMeta => ({ resultsWithMeta, tmdbData, contentDetails }));
        })
        .then(({ resultsWithMeta, tmdbData, contentDetails }) => {
            // Flatten and filter results
            const allM3u8Links = [];
            for (const item of resultsWithMeta) {
                const serverResults = item.results;
                for (const result of serverResults) {
                    if (result) {
                        allM3u8Links.push({ link: result, episodeMeta: item.episodeMeta });
                    }
                }
            }
            
            // Build title with year and episode info
            const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
            const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);
            
            // Convert to Nuvio format
            const formattedLinks = [];
            
            allM3u8Links.forEach(item => {
                const link = item.link;
                const episodeMeta = item.episodeMeta;
                let perItemTitle = `${title} (${year || 'N/A'})`;
                if (mediaType === 'tv' && episodeMeta) {
                    perItemTitle += ` - S${episodeMeta.season}E${episodeMeta.episode}`;
                }
                if (link.qualities && link.qualities.length > 0) {
                    link.qualities.forEach(quality => {
                        formattedLinks.push({
                            name: `Watch32 - ${quality.quality}`,
                            title: perItemTitle,
                            url: quality.url,
                            quality: quality.quality,
                            headers: link.headers || {},
                            subtitles: []
                        });
                    });
                } else {
                    // Skip unknown quality links
                    console.log('[Watch32] Skipping unknown quality link');
                }
            });
            
            console.log(`[Watch32] Total found: ${formattedLinks.length} streams`);
            return formattedLinks;
        })
        .catch(error => {
            console.error(`[Watch32] Scraping error: ${error.message}`);
            return [];
        })
        .catch(error => {
            console.error(`[Watch32] TMDB API error: ${error.message}`);
            return [];
        });
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    // For React Native environment
    global.Watch32ScraperModule = { getStreams };
}