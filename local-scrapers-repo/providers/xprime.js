// Xprime Scraper for Nuvio Local Scrapers
// React Native compatible version - Standalone (no external dependencies)

// TMDB API Configuration
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Working headers for Cloudflare Workers URLs
const WORKING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Origin': 'https://xprime.tv',
    'Referer': 'https://xprime.tv/',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
    'DNT': '1'
};

// M3U8 Resolver Functions (inlined to remove external dependency)

// Parse M3U8 content and extract quality streams
function parseM3U8(content, baseUrl) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const streams = [];
    
    let currentStream = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            // Parse stream info
            currentStream = {
                bandwidth: null,
                resolution: null,
                codecs: null,
                url: null
            };
            
            // Extract bandwidth
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            if (bandwidthMatch) {
                currentStream.bandwidth = parseInt(bandwidthMatch[1]);
            }
            
            // Extract resolution
            const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            if (resolutionMatch) {
                currentStream.resolution = resolutionMatch[1];
            }
            
            // Extract codecs
            const codecsMatch = line.match(/CODECS="([^"]+)"/);
            if (codecsMatch) {
                currentStream.codecs = codecsMatch[1];
            }
            
        } else if (currentStream && !line.startsWith('#')) {
            // This is the URL for the current stream
            currentStream.url = resolveUrl(line, baseUrl);
            streams.push(currentStream);
            currentStream = null;
        }
    }
    
    return streams;
}

// Resolve relative URLs against base URL
function resolveUrl(url, baseUrl) {
    if (url.startsWith('http')) {
        return url;
    }
    
    try {
        return new URL(url, baseUrl).toString();
    } catch (error) {
        console.log(`⚠️ Could not resolve URL: ${url} against ${baseUrl}`);
        return url;
    }
}

// Determine quality from resolution or bandwidth
function getQualityFromStream(stream) {
    if (stream.resolution) {
        const [width, height] = stream.resolution.split('x').map(Number);
        
        if (height >= 2160) return '4K';
        if (height >= 1440) return '1440p';
        if (height >= 1080) return '1080p';
        if (height >= 720) return '720p';
        if (height >= 480) return '480p';
        if (height >= 360) return '360p';
        return '240p';
    }
    
    if (stream.bandwidth) {
        const mbps = stream.bandwidth / 1000000;
        
        if (mbps >= 15) return '4K';
        if (mbps >= 8) return '1440p';
        if (mbps >= 5) return '1080p';
        if (mbps >= 3) return '720p';
        if (mbps >= 1.5) return '480p';
        if (mbps >= 0.8) return '360p';
        return '240p';
    }
    
    return 'Unknown';
}

// Fetch and resolve M3U8 playlist
function resolveM3U8(url, sourceName = 'Unknown') {
    console.log(`🔍 Resolving M3U8 playlist for ${sourceName}...`);
    console.log(`📡 URL: ${url.substring(0, 80)}...`);
    
    return fetch(url, {
        method: 'GET',
        headers: WORKING_HEADERS,
        timeout: 15000
    }).then(function(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.text().then(function(content) {
             console.log(`✅ Fetched M3U8 content (${content.length} bytes)`);
            
            // Check if it's a master playlist (contains #EXT-X-STREAM-INF)
            if (content.includes('#EXT-X-STREAM-INF:')) {
                console.log(`📋 Master playlist detected - parsing quality streams...`);
                
                const streams = parseM3U8(content, url);
                console.log(`🎬 Found ${streams.length} quality streams`);
                
                const resolvedStreams = [];
                
                for (const stream of streams) {
                    const quality = getQualityFromStream(stream);
                    
                    // Extract clean server name from sourceName
                    const cleanServerName = sourceName.replace(/^XPRIME\s+/i, '').replace(/\s+-\s+.*$/, '');
                    const formattedName = `XPRIME ${cleanServerName.charAt(0).toUpperCase() + cleanServerName.slice(1)} - ${quality}`;
                    
                    resolvedStreams.push({
                        source: sourceName,
                        name: formattedName,
                        url: stream.url,
                        quality: quality,
                        resolution: stream.resolution,
                        bandwidth: stream.bandwidth,
                        codecs: stream.codecs,
                        type: 'M3U8',
                        headers: WORKING_HEADERS,
                        referer: 'https://xprime.tv'
                    });
                    
                    console.log(`  📊 ${quality} (${stream.resolution || 'Unknown resolution'}) - ${Math.round((stream.bandwidth || 0) / 1000000 * 10) / 10} Mbps`);
                }
                
                // Sort by quality (highest first)
                resolvedStreams.sort((a, b) => {
                    const qualityOrder = { '4K': 4, '1440p': 3, '1080p': 2, '720p': 1, '480p': 0, '360p': -1, '240p': -2, 'Unknown': -3 };
                    return (qualityOrder[b.quality] || -3) - (qualityOrder[a.quality] || -3);
                });
                
                return {
                    success: true,
                    type: 'master',
                    streams: resolvedStreams,
                    originalUrl: url
                };
                
            } else if (content.includes('#EXTINF:')) {
                console.log(`📺 Media playlist detected - single quality stream`);
                
                // Extract clean server name from sourceName
                const cleanServerName = sourceName.replace(/^XPRIME\s+/i, '').replace(/\s+-\s+.*$/, '');
                const formattedName = `XPRIME ${cleanServerName.charAt(0).toUpperCase() + cleanServerName.slice(1)} - Unknown`;
                
                return {
                    success: true,
                    type: 'media',
                    streams: [{
                        source: sourceName,
                        name: formattedName,
                        url: url,
                        quality: 'Unknown',
                        type: 'M3U8',
                        headers: WORKING_HEADERS,
                        referer: 'https://xprime.tv'
                    }],
                    originalUrl: url
                };
                
            } else {
                throw new Error('Invalid M3U8 content - no playlist markers found');
            }
        });
    }).catch(function(error) {
        console.log(`❌ Failed to resolve M3U8: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            streams: [],
            originalUrl: url
        };
    });
}

// Resolve multiple M3U8 URLs
function resolveMultipleM3U8(links) {
    console.log(`🚀 Resolving ${links.length} M3U8 playlists in parallel...`);
    
    const resolvePromises = links.map(function(link) {
        return resolveM3U8(link.url, link.name).then(function(result) {
            return {
                originalLink: link,
                resolution: result
            };
        });
    });
    
    return Promise.allSettled(resolvePromises).then(function(results) {
        const allResolvedStreams = [];
        const failedResolutions = [];
        
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { originalLink, resolution } = result.value;
                
                if (resolution.success) {
                    allResolvedStreams.push(...resolution.streams);
                } else {
                    failedResolutions.push({
                        link: originalLink,
                        error: resolution.error
                    });
                }
            } else {
                failedResolutions.push({
                    link: 'Unknown',
                    error: result.reason.message
                });
            }
        }
        
        console.log(`\n📊 Resolution Summary:`);
        console.log(`✅ Successfully resolved: ${allResolvedStreams.length} streams`);
        console.log(`❌ Failed resolutions: ${failedResolutions.length}`);
        
        if (failedResolutions.length > 0) {
            console.log(`\n❌ Failed resolutions:`);
            failedResolutions.forEach((failure, index) => {
                console.log(`  ${index + 1}. ${failure.link.name || 'Unknown'}: ${failure.error}`);
            });
        }
        
        return {
            success: allResolvedStreams.length > 0,
            streams: allResolvedStreams,
            failed: failedResolutions,
            summary: {
                total: links.length,
                resolved: allResolvedStreams.length,
                failed: failedResolutions.length
            }
        };
    });
}

// Constants
const FALLBACK_DOMAIN = 'https://xprime.tv';
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Global variables for domain caching
let xprimeDomain = FALLBACK_DOMAIN;
let domainCacheTimestamp = 0;

// Utility Functions
function getQualityFromName(qualityStr) {
    if (!qualityStr) return 'Unknown';
    
    const quality = qualityStr.toLowerCase();
    const qualityMap = {
        '2160p': '4K', '4k': '4K',
        '1440p': '1440p', '2k': '1440p',
        '1080p': '1080p', 'fhd': '1080p', 'full hd': '1080p',
        '720p': '720p', 'hd': '720p',
        '480p': '480p', 'sd': '480p',
        '360p': '360p',
        '240p': '240p'
    };
    
    for (const [key, value] of Object.entries(qualityMap)) {
        if (quality.includes(key)) return value;
    }
    
    // Try to extract number from string and format consistently
    const match = qualityStr.match(/(\d{3,4})[pP]?/);
    if (match) {
        const resolution = parseInt(match[1]);
        if (resolution >= 2160) return '4K';
        if (resolution >= 1440) return '1440p';
        if (resolution >= 1080) return '1080p';
        if (resolution >= 720) return '720p';
        if (resolution >= 480) return '480p';
        if (resolution >= 360) return '360p';
        return '240p';
    }
    
    return 'Unknown';
}

// Fetch latest domain from GitHub
function getXprimeDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
        return Promise.resolve(xprimeDomain);
    }

    console.log('[Xprime] Fetching latest domain...');
    return fetch('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json', {
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }).then(function(response) {
        if (response.ok) {
            return response.json().then(function(data) {
                if (data && data.xprime) {
                    xprimeDomain = data.xprime;
                    domainCacheTimestamp = now;
                    console.log(`[Xprime] Updated domain to: ${xprimeDomain}`);
                }
                return xprimeDomain;
            });
        }
        return xprimeDomain;
    }).catch(function(error) {
        console.error(`[Xprime] Failed to fetch latest domain: ${error.message}`);
        return xprimeDomain;
    });
}

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
    };

    return fetch(url, {
        method: options.method || 'GET',
        headers: { ...defaultHeaders, ...options.headers },
        ...options
    }).then(function(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    }).catch(function(error) {
        console.error(`[Xprime] Request failed for ${url}: ${error.message}`);
        throw error;
    });
}

// Hardcoded Server List
function getXprimeServers(api) {
    console.log('[Xprime] Using hardcoded servers...');
    const hardcodedServers = [
        { name: 'primebox', status: 'ok' },
        { name: 'rage', status: 'ok' },
        // Temporarily disabled Phoenix server
        // { name: 'phoenix', status: 'ok' },
        // Temporarily disabled Fox server
        // { name: 'fox', status: 'ok' }
    ];
    console.log(`[Xprime] Using ${hardcodedServers.length} hardcoded servers: ${hardcodedServers.map(s => s.name).join(', ')}`);
    return Promise.resolve(hardcodedServers);
}

// Build Query Parameters
function buildQueryParams(serverName, title, year, id, season, episode) {
    const params = new URLSearchParams();
    params.append('name', title || '');
    
    if (serverName === 'primebox') {
        if (year) params.append('fallback_year', year.toString());
        if (season && episode) {
            params.append('season', season.toString());
            params.append('episode', episode.toString());
        }
    } else {
        if (year) params.append('year', year.toString());
        if (id) {
            params.append('id', id);
            params.append('imdb', id);
        }
        if (season && episode) {
            params.append('season', season.toString());
            params.append('episode', episode.toString());
        }
    }
    
    return params.toString();
}

// Process PrimeBox Response
function processPrimeBoxResponse(data, serverLabel, serverName) {
    const links = [];
    const subtitles = [];
    
    try {
        if (data.streams) {
            // Process quality streams - fix: use available_qualities instead of qualities
            if (data.available_qualities && Array.isArray(data.available_qualities)) {
                data.available_qualities.forEach(quality => {
                    const url = data.streams[quality];
                    if (url) {
                        const normalizedQuality = getQualityFromName(quality);
                        links.push({
                            source: serverLabel,
                            name: `XPRIME ${serverName.charAt(0).toUpperCase() + serverName.slice(1)} - ${normalizedQuality}`,
                            url: url.trim(), // Remove any whitespace
                            quality: normalizedQuality,
                            type: 'VIDEO',
                            headers: WORKING_HEADERS,
                            referer: 'https://xprime.tv'
                        });
                    }
                });
            }
        }
        
        // Process subtitles
        if (data.has_subtitles && data.subtitles && Array.isArray(data.subtitles)) {
            data.subtitles.forEach(sub => {
                if (sub.file) {
                    subtitles.push({
                        language: sub.label || 'Unknown',
                        url: sub.file.trim() // Remove any whitespace
                    });
                }
            });
        }
    } catch (error) {
        console.error(`[Xprime] Error parsing PrimeBox response: ${error.message}`);
    }
    
    return { links, subtitles };
}

// Process Other Server Response
function processOtherServerResponse(data, serverLabel, serverName) {
    const links = [];
    
    try {
        // Special handling for Rage server response
        if (serverName === 'rage' && data && data.success && Array.isArray(data.qualities)) {
            data.qualities.forEach(function(q) {
                if (q && q.url) {
                    const normalizedQuality = getQualityFromName(q.quality);
                    // Normalize size to a human-readable string
                    let sizeStr = 'Unknown';
                    if (typeof q.size === 'number' && isFinite(q.size)) {
                        const gb = q.size / (1024 * 1024 * 1024);
                        const mb = q.size / (1024 * 1024);
                        sizeStr = gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
                    } else if (typeof q.size === 'string' && q.size.trim()) {
                        sizeStr = q.size.trim();
                    }
                    links.push({
                        source: serverLabel,
                        name: `XPRIME ${serverName.charAt(0).toUpperCase() + serverName.slice(1)} - ${normalizedQuality}`,
                        url: q.url,
                        quality: normalizedQuality,
                        size: sizeStr,
                        type: 'VIDEO',
                        headers: WORKING_HEADERS,
                        referer: 'https://xprime.tv'
                    });
                }
            });
        } else if (data.url) {
            // Try to extract quality from the URL or response data
            let quality = 'Unknown';
            
            // Check if there's quality information in the response
            if (data.quality) {
                quality = getQualityFromName(data.quality);
            } else {
                // Try to extract quality from URL patterns
                const urlQualityMatch = data.url.match(/(\d{3,4})p/i);
                if (urlQualityMatch) {
                    quality = getQualityFromName(urlQualityMatch[1] + 'p');
                }
            }
            
            links.push({
                source: serverLabel,
                name: `XPRIME ${serverName.charAt(0).toUpperCase() + serverName.slice(1)} - ${quality}`,
                url: data.url,
                quality: quality,
                type: 'M3U8',
                headers: WORKING_HEADERS,
                referer: 'https://xprime.tv'
            });
        }
    } catch (error) {
        console.error(`[Xprime] Error parsing server response: ${error.message}`);
    }
    
    return { links, subtitles: [] };
}

// Group streams by quality for better organization
function groupStreamsByQuality(streams, subtitles, mediaInfo = {}) {
    // Create media title with details
    let mediaTitle = '';
    if (mediaInfo.title) {
        if (mediaInfo.mediaType === 'tv' && mediaInfo.season && mediaInfo.episode) {
            mediaTitle = `${mediaInfo.title} S${String(mediaInfo.season).padStart(2, '0')}E${String(mediaInfo.episode).padStart(2, '0')}`;
        } else if (mediaInfo.year) {
            mediaTitle = `${mediaInfo.title} (${mediaInfo.year})`;
        } else {
            mediaTitle = mediaInfo.title;
        }
    }
    
    // Group streams by quality
    const qualityGroups = {};
    
    streams.forEach(stream => {
        const quality = stream.quality || 'Unknown';
        if (!qualityGroups[quality]) {
            qualityGroups[quality] = [];
        }
        
        qualityGroups[quality].push({
            name: stream.name,
            title: mediaTitle || '',
            url: stream.url,
            quality: quality,
            size: stream.size || 'Unknown',
            headers: stream.headers || WORKING_HEADERS,
            subtitles: subtitles
        });
    });
    
    // Define quality order (highest to lowest)
    const qualityOrder = ['4K', '1440p', '1080p', '720p', '480p', '360p', '240p', 'Unknown'];
    
    // Sort and flatten the grouped streams
    const sortedStreams = [];
    qualityOrder.forEach(quality => {
        if (qualityGroups[quality]) {
            // Sort streams within the same quality by server name
            qualityGroups[quality].sort((a, b) => a.name.localeCompare(b.name));
            sortedStreams.push(...qualityGroups[quality]);
        }
    });
    
    // Add any qualities not in the predefined order
    Object.keys(qualityGroups).forEach(quality => {
        if (!qualityOrder.includes(quality)) {
            qualityGroups[quality].sort((a, b) => a.name.localeCompare(b.name));
            sortedStreams.push(...qualityGroups[quality]);
        }
    });
    
    return sortedStreams;
}

// Get movie/TV show details from TMDB
function getTMDBDetails(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    
    return makeRequest(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const title = mediaType === 'tv' ? data.name : data.title;
            const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
            const year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
            
            return {
                title: title,
                year: year,
                imdbId: data.external_ids?.imdb_id || null
            };
        });
}

// Main scraping function - Updated to match Nuvio interface
function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[Xprime] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${mediaType === 'tv' ? `, S:${season}E:${episode}` : ''}`);
    
    // First, get movie/TV show details from TMDB
    return getTMDBDetails(tmdbId, mediaType)
        .then(mediaInfo => {
            if (!mediaInfo.title) {
                throw new Error('Could not extract title from TMDB response');
            }
            
            console.log(`[Xprime] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || 'N/A'})`);
            console.log(`[Xprime] Searching for: ${mediaInfo.title} (${mediaInfo.year})`);
            
            const { title, year, imdbId } = mediaInfo;
             const type = mediaType; // Keep the original mediaType
     
             return getXprimeDomain().then(function(api) {
        return getXprimeServers(api).then(function(servers) {
            if (servers.length === 0) {
                console.log('[Xprime] No active servers found');
                return [];
            }
            
            console.log(`[Xprime] Processing ${servers.length} servers in parallel`);
            
            const allLinks = [];
            const allSubtitles = [];
            
            // Process servers in parallel for better performance
            const serverPromises = servers.map(function(server) {
                console.log(`[Xprime] Processing server: ${server.name}`);
                
                // Rage server requires a different endpoint (backend.xprime.tv) and TMDB id param
                let serverUrl;
                if (server.name === 'rage') {
                    if (type === 'tv' && season && episode) {
                        serverUrl = `https://backend.xprime.tv/rage?id=${encodeURIComponent(tmdbId)}&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}`;
                    } else {
                        serverUrl = `https://backend.xprime.tv/rage?id=${encodeURIComponent(tmdbId)}`;
                    }
                } else {
                    const queryParams = buildQueryParams(server.name, title, year, imdbId, season, episode);
                    serverUrl = `${api}/${server.name}?${queryParams}`;
                }
                
                console.log(`[Xprime] Request URL: ${serverUrl}`);
                
                return makeRequest(serverUrl, {
                    headers: {
                        'Origin': server.name === 'rage' ? 'https://xprime.tv' : api,
                        'Referer': server.name === 'rage' ? 'https://xprime.tv/' : api
                    }
                }).then(function(response) {
                    return response.json().then(function(data) {
                        const serverLabel = `Xprime ${server.name.charAt(0).toUpperCase() + server.name.slice(1)}`;
                        let result;
                        
                        if (server.name === 'primebox') {
                            result = processPrimeBoxResponse(data, serverLabel, server.name);
                        } else {
                            result = processOtherServerResponse(data, serverLabel, server.name);
                        }
                        
                        console.log(`[Xprime] Server ${server.name}: Found ${result.links.length} links, ${result.subtitles.length} subtitles`);
                        return result;
                    });
                }).catch(function(error) {
                    console.error(`[Xprime] Error on server ${server.name}: ${error.message}`);
                    return { links: [], subtitles: [] };
                });
            });

            // Wait for all server requests to complete
            return Promise.allSettled(serverPromises).then(function(results) {
                // Process results
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        const { links, subtitles } = result.value;
                        allLinks.push(...links);
                        allSubtitles.push(...subtitles);
                    }
                }
                
                console.log(`[Xprime] Total found: ${allLinks.length} links, ${allSubtitles.length} subtitles`);
                
                // Separate M3U8 links from direct video links
                const m3u8Links = allLinks.filter(link => link.type === 'M3U8');
                const directLinks = allLinks.filter(link => link.type !== 'M3U8');
                
                let resolvedStreams = [];
                
                // Resolve M3U8 playlists to extract individual quality streams
                if (m3u8Links.length > 0) {
                    console.log(`[Xprime] Resolving ${m3u8Links.length} M3U8 playlists...`);
                    
                    return resolveMultipleM3U8(m3u8Links).then(function(resolutionResult) {
                        if (resolutionResult.success && resolutionResult.streams.length > 0) {
                            console.log(`[Xprime] Successfully resolved ${resolutionResult.streams.length} quality streams`);
                            resolvedStreams = resolutionResult.streams;
                        } else {
                            console.log(`[Xprime] M3U8 resolution failed, using master playlist URLs`);
                            resolvedStreams = m3u8Links;
                        }
                        
                        // Combine resolved streams with direct links
                        const finalLinks = [...directLinks, ...resolvedStreams];
                        
                        console.log(`[Xprime] Final result: ${finalLinks.length} total streams (${resolvedStreams.length} from M3U8, ${directLinks.length} direct)`);
                        
                        // Group streams by quality and format for Nuvio
                        const mediaInfoForGrouping = {
                            title: title,
                            year: year,
                            mediaType: mediaType,
                            season: season,
                            episode: episode
                        };
                        const formattedLinks = groupStreamsByQuality(finalLinks, allSubtitles, mediaInfoForGrouping);
                        
                        // Add provider identifier for header detection
                        formattedLinks.forEach(link => {
                            link.provider = 'xprime';
                        });
                        
                        return formattedLinks;
                    }).catch(function(error) {
                        console.error(`[Xprime] M3U8 resolution error: ${error.message}`);
                        resolvedStreams = m3u8Links;
                        
                        // Combine resolved streams with direct links
                        const finalLinks = [...directLinks, ...resolvedStreams];
                        
                        console.log(`[Xprime] Final result: ${finalLinks.length} total streams (${resolvedStreams.length} from M3U8, ${directLinks.length} direct)`);
                        
                        // Group streams by quality and format for Nuvio
                        const mediaInfoForGrouping = {
                            title: title,
                            year: year,
                            mediaType: mediaType,
                            season: season,
                            episode: episode
                        };
                        const formattedLinks = groupStreamsByQuality(finalLinks, allSubtitles, mediaInfoForGrouping);
                        
                        // Add provider identifier for header detection
                        formattedLinks.forEach(link => {
                            link.provider = 'xprime';
                        });
                        
                        return formattedLinks;
                    });
                } else {
                    // No M3U8 links, just return direct links
                    const finalLinks = [...directLinks, ...resolvedStreams];
                    
                    console.log(`[Xprime] Final result: ${finalLinks.length} total streams (${resolvedStreams.length} from M3U8, ${directLinks.length} direct)`);
                    
                    // Group streams by quality and format for Nuvio
                    const mediaInfoForGrouping = {
                        title: title,
                        year: year,
                        mediaType: mediaType,
                        season: season,
                        episode: episode
                    };
                    const formattedLinks = groupStreamsByQuality(finalLinks, allSubtitles, mediaInfoForGrouping);
                    
                    // Add provider identifier for header detection
                    formattedLinks.forEach(link => {
                        link.provider = 'xprime';
                    });
                    
                    return formattedLinks;
                }
            });
        });
    }).catch(function(error) {
        console.error(`[Xprime] Scraping error: ${error.message}`);
        return [];
    });
        })
        .catch(function(error) {
            console.error(`[Xprime] TMDB or scraping error: ${error.message}`);
            return [];
        });
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    // For React Native environment
    global.XprimeScraperModule = { getStreams };
}