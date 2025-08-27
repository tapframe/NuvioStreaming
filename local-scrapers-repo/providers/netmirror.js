// NetMirror Scraper for Nuvio Local Scrapers
// React Native compatible version - No async/await for sandbox compatibility
// Fetches streaming links from net2025.cc for Netflix, Prime Video, and Disney+ content

console.log('[NetMirror] Initializing NetMirror provider');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const NETMIRROR_BASE = 'https://a.net2025.cc';
const BASE_HEADERS = {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive'
};

// Global cookie storage
let globalCookie = '';
let cookieTimestamp = 0;
const COOKIE_EXPIRY = 54000000; // 15 hours in milliseconds

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: {
            ...BASE_HEADERS,
            ...options.headers
        },
        timeout: 10000
    }).then(function (response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    });
}

// Get current Unix timestamp
function getUnixTime() {
    return Math.floor(Date.now() / 1000);
}

// Bypass authentication and get valid cookie
function bypass() {
    // Check if we have a valid cached cookie
    const now = Date.now();
    if (globalCookie && cookieTimestamp && (now - cookieTimestamp) < COOKIE_EXPIRY) {
        console.log('[NetMirror] Using cached authentication cookie');
        return Promise.resolve(globalCookie);
    }

    console.log('[NetMirror] Bypassing authentication...');
    
    function attemptBypass(attempts) {
        if (attempts >= 5) {
            throw new Error('Max bypass attempts reached');
        }
        
        return makeRequest(`${NETMIRROR_BASE}/tv/p.php`, {
            method: 'POST',
            headers: BASE_HEADERS
        }).then(function (response) {
            // Extract cookie from response headers before reading text
            const setCookieHeader = response.headers.get('set-cookie');
            let extractedCookie = null;
            
            if (setCookieHeader && (typeof setCookieHeader === 'string' || Array.isArray(setCookieHeader))) {
                const cookieString = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : setCookieHeader;
                const cookieMatch = cookieString.match(/t_hash_t=([^;]+)/);
                if (cookieMatch) {
                    extractedCookie = cookieMatch[1];
                }
            }
            
            return response.text().then(function (responseText) {
                // Check if response contains success indicator
                if (!responseText.includes('"r":"n"')) {
                    console.log(`[NetMirror] Bypass attempt ${attempts + 1} failed, retrying...`);
                    return attemptBypass(attempts + 1);
                }
                
                if (extractedCookie) {
                    globalCookie = extractedCookie;
                    cookieTimestamp = Date.now();
                    console.log('[NetMirror] Authentication successful');
                    return globalCookie;
                }
                
                throw new Error('Failed to extract authentication cookie');
            });
        });
    }
    
    return attemptBypass(0);
}

// Search for content on specific platform
function searchContent(query, platform) {
    console.log(`[NetMirror] Searching for "${query}" on ${platform}...`);
    
    const ottMap = {
        'netflix': 'nf',
        'primevideo': 'pv',
        'disney': 'hs'
    };
    
    const ott = ottMap[platform.toLowerCase()] || 'nf';
    
    return bypass().then(function (cookie) {
        const cookies = {
            't_hash_t': cookie,
            'hd': 'on',
            'ott': ott
        };
        
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        
        // Platform-specific search endpoints
        const searchEndpoints = {
            'netflix': `${NETMIRROR_BASE}/search.php`,
            'primevideo': `${NETMIRROR_BASE}/pv/search.php`,
            'disney': `${NETMIRROR_BASE}/mobile/hs/search.php`
        };
        
        const searchUrl = searchEndpoints[platform.toLowerCase()] || searchEndpoints['netflix'];
        
        return makeRequest(
            `${searchUrl}?s=${encodeURIComponent(query)}&t=${getUnixTime()}`,
            {
                headers: {
                    ...BASE_HEADERS,
                    'Cookie': cookieString,
                    'Referer': `${NETMIRROR_BASE}/tv/home`
                }
            }
        );
    }).then(function (response) {
        return response.json();
    }).then(function (searchData) {
        if (searchData.searchResult && searchData.searchResult.length > 0) {
            console.log(`[NetMirror] Found ${searchData.searchResult.length} results`);
            return searchData.searchResult.map(item => ({
                id: item.id,
                title: item.t,
                posterUrl: `https://imgcdn.media/poster/v/${item.id}.jpg`
            }));
        } else {
            console.log('[NetMirror] No results found');
            return [];
        }
    });
}

// Get episodes from specific season
function getEpisodesFromSeason(seriesId, seasonId, platform, page) {
    const ottMap = {
        'netflix': 'nf',
        'primevideo': 'pv',
        'disney': 'hs'
    };
    
    const ott = ottMap[platform.toLowerCase()] || 'nf';
    
    return bypass().then(function (cookie) {
        const cookies = {
            't_hash_t': cookie,
            'ott': ott,
            'hd': 'on'
        };
        
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        
        const episodes = [];
        let currentPage = page || 1;
        
        // Platform-specific episodes endpoints
        const episodesEndpoints = {
            'netflix': `${NETMIRROR_BASE}/episodes.php`,
            'primevideo': `${NETMIRROR_BASE}/pv/episodes.php`,
            'disney': `${NETMIRROR_BASE}/mobile/hs/episodes.php`
        };
        
        const episodesUrl = episodesEndpoints[platform.toLowerCase()] || episodesEndpoints['netflix'];
        
        function fetchPage(pageNum) {
            return makeRequest(
                `${episodesUrl}?s=${seasonId}&series=${seriesId}&t=${getUnixTime()}&page=${pageNum}`,
                {
                    headers: {
                        ...BASE_HEADERS,
                        'Cookie': cookieString,
                        'Referer': `${NETMIRROR_BASE}/tv/home`
                    }
                }
            ).then(function (response) {
                return response.json();
            }).then(function (episodeData) {
                if (episodeData.episodes) {
                    episodes.push(...episodeData.episodes);
                }
                
                if (episodeData.nextPageShow === 0) {
                    return episodes;
                } else {
                    return fetchPage(pageNum + 1);
                }
            }).catch(function (error) {
                console.log(`[NetMirror] Failed to load episodes from season ${seasonId}, page ${pageNum}`);
                return episodes;
            });
        }
        
        return fetchPage(currentPage);
    });
}

// Load content details
function loadContent(contentId, platform) {
    console.log(`[NetMirror] Loading content details for ID: ${contentId}`);
    
    const ottMap = {
        'netflix': 'nf',
        'primevideo': 'pv',
        'disney': 'hs'
    };
    
    const ott = ottMap[platform.toLowerCase()] || 'nf';
    
    return bypass().then(function (cookie) {
        const cookies = {
            't_hash_t': cookie,
            'ott': ott,
            'hd': 'on'
        };
        
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        
        // Platform-specific post endpoints
        const postEndpoints = {
            'netflix': `${NETMIRROR_BASE}/post.php`,
            'primevideo': `${NETMIRROR_BASE}/pv/post.php`,
            'disney': `${NETMIRROR_BASE}/mobile/hs/post.php`
        };
        
        const postUrl = postEndpoints[platform.toLowerCase()] || postEndpoints['netflix'];
        
        return makeRequest(
            `${postUrl}?id=${contentId}&t=${getUnixTime()}`,
            {
                headers: {
                    ...BASE_HEADERS,
                    'Cookie': cookieString,
                    'Referer': `${NETMIRROR_BASE}/tv/home`
                }
            }
        );
    }).then(function (response) {
        return response.json();
    }).then(function (postData) {
        console.log(`[NetMirror] Loaded: ${postData.title}`);
        
        let allEpisodes = postData.episodes || [];
        
        // If this is a TV series, fetch episodes from all seasons
        if (postData.episodes && postData.episodes.length > 0 && postData.episodes[0] !== null) {
            console.log('[NetMirror] Loading episodes from all seasons...');
            
            // Create a promise chain to load all episodes
            let episodePromise = Promise.resolve();
            
            // Add episodes from current season if nextPageShow indicates more pages
            if (postData.nextPageShow === 1 && postData.nextPageSeason) {
                episodePromise = episodePromise.then(function () {
                    return getEpisodesFromSeason(contentId, postData.nextPageSeason, platform, 2);
                }).then(function (additionalEpisodes) {
                    allEpisodes.push(...additionalEpisodes);
                });
            }
            
            // Add episodes from other seasons (excluding the last one which is current)
            if (postData.season && postData.season.length > 1) {
                const otherSeasons = postData.season.slice(0, -1); // Remove last season
                
                otherSeasons.forEach(function (season) {
                    episodePromise = episodePromise.then(function () {
                        return getEpisodesFromSeason(contentId, season.id, platform, 1);
                    }).then(function (seasonEpisodes) {
                        allEpisodes.push(...seasonEpisodes);
                    });
                });
            }
            
            return episodePromise.then(function () {
                console.log(`[NetMirror] Loaded ${allEpisodes.filter(ep => ep !== null).length} total episodes`);
                
                return {
                    id: contentId,
                    title: postData.title,
                    description: postData.desc,
                    year: postData.year,
                    episodes: allEpisodes,
                    seasons: postData.season || [],
                    isMovie: !postData.episodes || postData.episodes.length === 0 || postData.episodes[0] === null
                };
            });
        }
        
        return {
            id: contentId,
            title: postData.title,
            description: postData.desc,
            year: postData.year,
            episodes: allEpisodes,
            seasons: postData.season || [],
            isMovie: !postData.episodes || postData.episodes.length === 0 || postData.episodes[0] === null
        };
    });
}

// Get streaming links
function getStreamingLinks(contentId, title, platform) {
    console.log(`[NetMirror] Getting streaming links for: ${title}`);
    
    const ottMap = {
        'netflix': 'nf',
        'primevideo': 'pv',
        'disney': 'hs'
    };
    
    const ott = ottMap[platform.toLowerCase()] || 'nf';
    
    return bypass().then(function (cookie) {
        const cookies = {
            't_hash_t': cookie,
            'ott': ott,
            'hd': 'on'
        };
        
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        
        // Platform-specific playlist endpoints
        const playlistEndpoints = {
            'netflix': `${NETMIRROR_BASE}/tv/playlist.php`,
            'primevideo': `${NETMIRROR_BASE}/mobile/pv/playlist.php`,
            'disney': `${NETMIRROR_BASE}/mobile/hs/playlist.php`
        };
        
        const playlistUrl = playlistEndpoints[platform.toLowerCase()] || playlistEndpoints['netflix'];
        
        return makeRequest(
            `${playlistUrl}?id=${contentId}&t=${encodeURIComponent(title)}&tm=${getUnixTime()}`,
            {
                headers: {
                    ...BASE_HEADERS,
                    'Cookie': cookieString,
                    'Referer': `${NETMIRROR_BASE}/tv/home`
                }
            }
        );
    }).then(function (response) {
        return response.json();
    }).then(function (playlist) {
        if (!Array.isArray(playlist) || playlist.length === 0) {
            console.log('[NetMirror] No streaming links found');
            return { sources: [], subtitles: [] };
        }
        
        const sources = [];
        const subtitles = [];
        
        playlist.forEach(item => {
            if (item.sources) {
                item.sources.forEach(source => {
                    // Convert relative URLs to absolute URLs
                    let fullUrl = source.file;
                    if (source.file.startsWith('/') && !source.file.startsWith('//')) {
                        fullUrl = NETMIRROR_BASE + source.file;
                    } else if (source.file.startsWith('//')) {
                        fullUrl = 'https:' + source.file;
                    }
                    
                    sources.push({
                        url: fullUrl,
                        quality: source.label,
                        type: source.type || 'application/x-mpegURL'
                    });
                });
            }

            if (item.tracks) {
                item.tracks
                    .filter(track => track.kind === 'captions')
                    .forEach(track => {
                        // Convert relative URLs to absolute URLs for subtitles
                        let fullSubUrl = track.file;
                        if (track.file.startsWith('/') && !track.file.startsWith('//')) {
                            fullSubUrl = NETMIRROR_BASE + track.file;
                        } else if (track.file.startsWith('//')) {
                            fullSubUrl = 'https:' + track.file;
                        }
                        
                        subtitles.push({
                            url: fullSubUrl,
                            language: track.label
                        });
                    });
            }
        });
        
        console.log(`[NetMirror] Found ${sources.length} streaming sources and ${subtitles.length} subtitle tracks`);
        return { sources, subtitles };
    });
}

// Find episode ID for TV shows
function findEpisodeId(episodes, season, episode) {
    if (!episodes || episodes.length === 0) {
        console.log('[NetMirror] No episodes found in content data');
        return null;
    }
    
    const validEpisodes = episodes.filter(ep => ep !== null);
    console.log(`[NetMirror] Found ${validEpisodes.length} valid episodes`);
    
    if (validEpisodes.length > 0) {
        console.log(`[NetMirror] Sample episode structure:`, JSON.stringify(validEpisodes[0], null, 2));
    }
    
    const targetEpisode = validEpisodes.find(ep => {
        // Handle different possible episode structure formats
        let epSeason, epNumber;
        
        if (ep.s && ep.ep) {
            epSeason = parseInt(ep.s.replace('S', ''));
            epNumber = parseInt(ep.ep.replace('E', ''));
        } else if (ep.season && ep.episode) {
            epSeason = parseInt(ep.season);
            epNumber = parseInt(ep.episode);
        } else if (ep.season_number && ep.episode_number) {
            epSeason = parseInt(ep.season_number);
            epNumber = parseInt(ep.episode_number);
        } else {
            console.log(`[NetMirror] Unknown episode format:`, ep);
            return false;
        }
        
        console.log(`[NetMirror] Checking episode S${epSeason}E${epNumber} against target S${season}E${episode}`);
        return epSeason === season && epNumber === episode;
    });
    
    if (targetEpisode) {
        console.log(`[NetMirror] Found target episode:`, targetEpisode);
        return targetEpisode.id;
    } else {
        console.log(`[NetMirror] Target episode S${season}E${episode} not found`);
        return null;
    }
}

// Main function to get streams for TMDB content
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[NetMirror] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${seasonNum ? `, S${seasonNum}E${episodeNum}` : ''}`);

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

        console.log(`[NetMirror] TMDB Info: "${title}" (${year})`);

        // Try all platforms in sequence, but prioritize Prime Video for certain content
        let platforms = ['netflix', 'primevideo', 'disney'];
        
        // Prioritize Prime Video for shows like "The Boys"
        if (title.toLowerCase().includes('boys') || title.toLowerCase().includes('prime')) {
            platforms = ['primevideo', 'netflix', 'disney'];
        }
        
        console.log(`[NetMirror] Will try search queries: "${title}" and "${title} ${year}"`);
        
        function calculateSimilarity(str1, str2) {
            const s1 = str1.toLowerCase().trim();
            const s2 = str2.toLowerCase().trim();
            
            if (s1 === s2) return 1.0;
            
            const words1 = s1.split(/\s+/).filter(w => w.length > 0);
            const words2 = s2.split(/\s+/).filter(w => w.length > 0);
            
            // If query is shorter, check if all query words are in title
            if (words2.length <= words1.length) {
                let exactMatches = 0;
                for (const queryWord of words2) {
                    if (words1.includes(queryWord)) {
                        exactMatches++;
                    }
                }
                
                // All query words must match for high similarity
                if (exactMatches === words2.length) {
                    return 0.95 * (exactMatches / words1.length);
                }
            }
            
            // Check if title starts with query
            if (s1.startsWith(s2)) {
                return 0.9;
            }
            
            return 0;
        }
        
        function filterRelevantResults(searchResults, query) {
            const filtered = searchResults.filter(result => {
                const similarity = calculateSimilarity(result.title, query);
                return similarity >= 0.7;
            });
            
            // Sort by similarity (highest first)
            return filtered.sort((a, b) => {
                const simA = calculateSimilarity(a.title, query);
                const simB = calculateSimilarity(b.title, query);
                return simB - simA;
            });
        }
        
        function tryPlatform(platformIndex) {
            if (platformIndex >= platforms.length) {
                console.log('[NetMirror] No content found on any platform');
                return [];
            }
            
            const platform = platforms[platformIndex];
            console.log(`[NetMirror] Trying platform: ${platform}`);
            
            // Try searching with just the title first
            function trySearch(withYear) {
                const searchQuery = withYear ? `${title} ${year}` : title;
                console.log(`[NetMirror] Searching for: "${searchQuery}"`);
                
                return searchContent(searchQuery, platform).then(function (searchResults) {
                    if (searchResults.length === 0) {
                        if (!withYear && year) {
                            console.log(`[NetMirror] No results for "${title}", trying with year...`);
                            return trySearch(true);
                        }
                        return null;
                    }
                    
                    // Filter results for relevance
                    const relevantResults = filterRelevantResults(searchResults, title);
                    
                    if (relevantResults.length === 0) {
                        console.log(`[NetMirror] Found ${searchResults.length} results but none were relevant enough`);
                        if (!withYear && year) {
                            console.log(`[NetMirror] Trying with year...`);
                            return trySearch(true);
                        }
                        return null;
                    }
                    
                    // Use the most relevant search result
                    const selectedContent = relevantResults[0];
                    console.log(`[NetMirror] Selected: ${selectedContent.title} (ID: ${selectedContent.id}) - filtered from ${searchResults.length} results`);
                    
                    return loadContent(selectedContent.id, platform).then(function (contentData) {
                        let targetContentId = selectedContent.id;
                        
                        // For TV shows, find the specific episode
                        let episodeData = null;
                        if (mediaType === 'tv' && !contentData.isMovie) {
                            const validEpisodes = contentData.episodes.filter(ep => ep !== null);
                            episodeData = validEpisodes.find(ep => {
                                let epSeason, epNumber;
                                
                                if (ep.s && ep.ep) {
                                    epSeason = parseInt(ep.s.replace('S', ''));
                                    epNumber = parseInt(ep.ep.replace('E', ''));
                                } else if (ep.season && ep.episode) {
                                    epSeason = parseInt(ep.season);
                                    epNumber = parseInt(ep.episode);
                                } else if (ep.season_number && ep.episode_number) {
                                    epSeason = parseInt(ep.season_number);
                                    epNumber = parseInt(ep.episode_number);
                                }
                                
                                return epSeason === (seasonNum || 1) && epNumber === (episodeNum || 1);
                            });
                            
                            if (episodeData) {
                                targetContentId = episodeData.id;
                                console.log(`[NetMirror] Found episode ID: ${episodeData.id}`);
                            } else {
                                console.log(`[NetMirror] Episode S${seasonNum}E${episodeNum} not found`);
                                return null;
                            }
                        }
                        
                        return getStreamingLinks(targetContentId, title, platform).then(function (streamData) {
                            if (!streamData.sources || streamData.sources.length === 0) {
                                console.log(`[NetMirror] No streaming links found`);
                                return null;
                            }
                            
                            // Convert to Nuvio stream format
                            const streams = streamData.sources.map(source => {
                                // Extract quality from URL parameters or source label
                                let quality = 'HD';
                                
                                // Try to extract quality from URL parameters
                                const urlQualityMatch = source.url.match(/[?&]q=(\d+p)/i);
                                if (urlQualityMatch) {
                                    quality = urlQualityMatch[1];
                                } else if (source.quality) {
                                    // Try to extract from source label
                                    const labelQualityMatch = source.quality.match(/(\d+p)/i);
                                    if (labelQualityMatch) {
                                        quality = labelQualityMatch[1];
                                    } else {
                                        // Normalize quality labels
                                        const normalizedQuality = source.quality.toLowerCase();
                                        if (normalizedQuality.includes('full hd') || normalizedQuality.includes('1080')) {
                                            quality = '1080p';
                                        } else if (normalizedQuality.includes('hd') || normalizedQuality.includes('720')) {
                                            quality = '720p';
                                        } else if (normalizedQuality.includes('480')) {
                                            quality = '480p';
                                        } else {
                                            quality = source.quality;
                                        }
                                    }
                                } else if (source.url.includes('720p')) {
                                    quality = '720p';
                                } else if (source.url.includes('480p')) {
                                    quality = '480p';
                                } else if (source.url.includes('1080p')) {
                                    quality = '1080p';
                                }
                                
                                // Build title with episode name if available
                                let streamTitle = `${title} ${year ? `(${year})` : ''} ${quality}`;
                                if (mediaType === 'tv') {
                                    const episodeName = episodeData && episodeData.t ? episodeData.t : '';
                                    streamTitle += ` S${seasonNum}E${episodeNum}`;
                                    if (episodeName) {
                                        streamTitle += ` - ${episodeName}`;
                                    }
                                }
                                
                                // Unified headers for all platforms (Netflix, Prime Video, and Disney)
                                const streamHeaders = {
                                    "Accept": "application/vnd.apple.mpegurl, video/mp4, */*",
                                    "Origin": "https://net2025.cc",
                                    "Referer": "https://net2025.cc/tv/home",
                                    "Cookie": "hd=on",
                                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1"
                                };
                                
                                return {
                                    name: `NetMirror (${platform.charAt(0).toUpperCase() + platform.slice(1)})`,
                                    title: streamTitle,
                                    url: source.url,
                                    quality: quality,
                                    type: source.type.includes('mpegURL') ? 'hls' : 'direct',
                                    headers: streamHeaders
                                };
                            });
                            
                            // Sort streams: Auto quality first, then by quality (highest first)
                            streams.sort((a, b) => {
                                // Auto quality always comes first
                                if (a.quality.toLowerCase() === 'auto' && b.quality.toLowerCase() !== 'auto') {
                                    return -1;
                                }
                                if (b.quality.toLowerCase() === 'auto' && a.quality.toLowerCase() !== 'auto') {
                                    return 1;
                                }
                                
                                // If both are Auto or neither is Auto, sort by quality
                                const parseQuality = (quality) => {
                                    const match = quality.match(/(\d{3,4})p/i);
                                    return match ? parseInt(match[1], 10) : 0;
                                };
                                
                                const qualityA = parseQuality(a.quality);
                                const qualityB = parseQuality(b.quality);
                                return qualityB - qualityA; // Highest quality first
                            });
                            
                            console.log(`[NetMirror] Successfully processed ${streams.length} streams from ${platform}`);
                            return streams;
                        });
                    });
                });
            }
            
            return trySearch(false).then(function (result) {
                if (result) {
                    return result;
                } else {
                    console.log(`[NetMirror] No content found on ${platform}, trying next platform`);
                    return tryPlatform(platformIndex + 1);
                }
            }).catch(function (error) {
                console.log(`[NetMirror] Error on ${platform}: ${error.message}, trying next platform`);
                return tryPlatform(platformIndex + 1);
            });
        }
        
        return tryPlatform(0);
    }).catch(function (error) {
        console.error(`[NetMirror] Error in getStreams: ${error.message}`);
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