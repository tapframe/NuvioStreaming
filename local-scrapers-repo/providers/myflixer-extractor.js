#!/usr/bin/env node

const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');

class MyFlixerExtractor {
    constructor() {
        this.mainUrl = 'https://watch32.sx';
        this.videostrUrl = 'https://videostr.net';
    }

    async search(query) {
        try {
            const searchUrl = `${this.mainUrl}/search/${query.replace(/\s+/g, '-')}`;
            console.log(`Searching: ${searchUrl}`);
            
            const response = await axios.get(searchUrl);
            const $ = cheerio.load(response.data);
            
            const results = [];
            $('.flw-item').each((i, element) => {
                const title = $(element).find('h2.film-name > a').attr('title');
                const link = $(element).find('h2.film-name > a').attr('href');
                const poster = $(element).find('img.film-poster-img').attr('data-src');
                
                if (title && link) {
                    results.push({
                        title,
                        url: link.startsWith('http') ? link : `${this.mainUrl}${link}`,
                        poster
                    });
                }
            });
            
            console.log('Search results found:');
            results.forEach((result, index) => {
                console.log(`${index + 1}. ${result.title}`);
            });
            
            return results;
        } catch (error) {
            console.error('Search error:', error.message);
            return [];
        }
    }

    async getContentDetails(url) {
        try {
            console.log(`Getting content details: ${url}`);
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            
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
                const episodes = [];
                const seasonsResponse = await axios.get(`${this.mainUrl}/ajax/season/list/${contentId}`);
                const $seasons = cheerio.load(seasonsResponse.data);
                
                for (const season of $seasons('a.ss-item').toArray()) {
                    const seasonId = $(season).attr('data-id');
                    const seasonNum = $(season).text().replace('Season ', '');
                    
                    const episodesResponse = await axios.get(`${this.mainUrl}/ajax/season/episodes/${seasonId}`);
                    const $episodes = cheerio.load(episodesResponse.data);
                    
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
                }
                
                return {
                    type: 'series',
                    name,
                    episodes
                };
            }
        } catch (error) {
            console.error('Content details error:', error.message);
            return null;
        }
    }

    async getServerLinks(data) {
        try {
            console.log(`Getting server links: ${data}`);
            const response = await axios.get(`${this.mainUrl}/ajax/episode/${data}`);
            const $ = cheerio.load(response.data);
            
            const servers = [];
            $('a.link-item').each((i, element) => {
                const linkId = $(element).attr('data-linkid') || $(element).attr('data-id');
                if (linkId) {
                    servers.push(linkId);
                }
            });
            
            return servers;
        } catch (error) {
            console.error('Server links error:', error.message);
            return [];
        }
    }

    async getSourceUrl(linkId) {
        try {
            console.log(`Getting source URL for linkId: ${linkId}`);
            const response = await axios.get(`${this.mainUrl}/ajax/episode/sources/${linkId}`);
            return response.data.link;
        } catch (error) {
            console.error('Source URL error:', error.message);
            return null;
        }
    }

    async extractVideostrM3u8(url) {
        try {
            console.log(`Extracting from Videostr: ${url}`);
            
            const headers = {
                'Accept': '*/*',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': this.videostrUrl,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            };

            // Extract ID from URL
            const id = url.split('/').pop().split('?')[0];
            
            // Get nonce from embed page
            const embedResponse = await axios.get(url, { headers });
            const embedHtml = embedResponse.data;
            
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
            
            console.log(`Extracted nonce: ${nonce}`);
            
            // Get sources from API
            const apiUrl = `${this.videostrUrl}/embed-1/v3/e-1/getSources?id=${id}&_k=${nonce}`;
            console.log(`API URL: ${apiUrl}`);
            
            const sourcesResponse = await axios.get(apiUrl, { headers });
            const sourcesData = sourcesResponse.data;
            
            if (!sourcesData.sources) {
                throw new Error('No sources found in response');
            }
            
            let m3u8Url = sourcesData.sources;
            
            // Check if sources is already an M3U8 URL
            if (!m3u8Url.includes('.m3u8')) {
                console.log('Sources are encrypted, attempting to decrypt...');
                
                // Get decryption key
                const keyResponse = await axios.get('https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json');
                const key = keyResponse.data.vidstr;
                
                if (!key) {
                    throw new Error('Could not get decryption key');
                }
                
                // Decrypt using Google Apps Script
                const decodeUrl = 'https://script.google.com/macros/s/AKfycbx-yHTwupis_JD0lNzoOnxYcEYeXmJZrg7JeMxYnEZnLBy5V0--UxEvP-y9txHyy1TX9Q/exec';
                const fullUrl = `${decodeUrl}?encrypted_data=${encodeURIComponent(m3u8Url)}&nonce=${encodeURIComponent(nonce)}&secret=${encodeURIComponent(key)}`;
                
                const decryptResponse = await axios.get(fullUrl);
                const decryptedData = decryptResponse.data;
                
                // Extract file URL from decrypted response
                const fileMatch = decryptedData.match(/"file":"(.*?)"/); 
                if (fileMatch) {
                    m3u8Url = fileMatch[1];
                } else {
                    throw new Error('Could not extract video URL from decrypted response');
                }
            }
            
            console.log(`Final M3U8 URL: ${m3u8Url}`);
            
            // Filter only megacdn links
            if (!m3u8Url.includes('megacdn.co')) {
                console.log('Skipping non-megacdn link');
                return null;
            }
            
            // Parse master playlist to extract quality streams
            const qualities = await this.parseM3U8Qualities(m3u8Url);
            
            return {
                m3u8Url,
                qualities,
                headers: {
                    'Referer': 'https://videostr.net/',
                    'Origin': 'https://videostr.net/'
                }
            };
            
        } catch (error) {
            console.error('Videostr extraction error:', error.message);
            return null;
        }
    }

    async parseM3U8Qualities(masterUrl) {
        try {
            const response = await axios.get(masterUrl, {
                headers: {
                    'Referer': 'https://videostr.net/',
                    'Origin': 'https://videostr.net/'
                }
            });
            
            const playlist = response.data;
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
        } catch (error) {
            console.error('Error parsing M3U8 qualities:', error.message);
            return [];
        }
    }

    async extractM3u8Links(query, episodeNumber = null, seasonNumber = null) {
        try {
            // Search for content
            const searchResults = await this.search(query);
            if (searchResults.length === 0) {
                console.log('No search results found');
                return [];
            }
            
            console.log(`Found ${searchResults.length} results`);
            
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
            
            console.log(`Selected: ${selectedResult.title}`);
            
            // Get content details
            const contentDetails = await this.getContentDetails(selectedResult.url);
            if (!contentDetails) {
                console.log('Could not get content details');
                return [];
            }
            
            let dataToProcess = [];
            
            if (contentDetails.type === 'movie') {
                dataToProcess.push(contentDetails.data);
            } else {
                // For TV series, filter by episode/season if specified
                let episodes = contentDetails.episodes;
                
                if (seasonNumber) {
                    episodes = episodes.filter(ep => ep.season === seasonNumber);
                }
                
                if (episodeNumber) {
                    episodes = episodes.filter(ep => ep.episode === episodeNumber);
                }
                
                if (episodes.length === 0) {
                    console.log('No matching episodes found');
                    return [];
                }
                
                // Use first matching episode or all if no specific episode requested
                const targetEpisode = episodeNumber ? episodes[0] : episodes[0];
                console.log(`Selected episode: S${targetEpisode.season}E${targetEpisode.episode} - ${targetEpisode.name}`);
                dataToProcess.push(targetEpisode.data);
            }
            
            const allM3u8Links = [];
            
            // Process all data in parallel
            const allPromises = [];
            
            for (const data of dataToProcess) {
                // Get server links
                const serverLinksPromise = this.getServerLinks(data).then(async (serverLinks) => {
                    console.log(`Found ${serverLinks.length} servers`);
                    
                    // Process all server links in parallel
                    const linkPromises = serverLinks.map(async (linkId) => {
                        try {
                            // Get source URL
                            const sourceUrl = await this.getSourceUrl(linkId);
                            if (!sourceUrl) return null;
                            
                            console.log(`Source URL: ${sourceUrl}`);
                            
                            // Check if it's a videostr URL
                            if (sourceUrl.includes('videostr.net')) {
                                const result = await this.extractVideostrM3u8(sourceUrl);
                                if (result) {
                                    return {
                                        source: 'videostr',
                                        m3u8Url: result.m3u8Url,
                                        qualities: result.qualities,
                                        headers: result.headers
                                    };
                                }
                            }
                            return null;
                        } catch (error) {
                            console.error(`Error processing link ${linkId}:`, error.message);
                            return null;
                        }
                    });
                    
                    return Promise.all(linkPromises);
                });
                
                allPromises.push(serverLinksPromise);
            }
            
            // Wait for all promises to complete
            const results = await Promise.all(allPromises);
            
            // Flatten and filter results
            for (const serverResults of results) {
                for (const result of serverResults) {
                    if (result) {
                        allM3u8Links.push(result);
                    }
                }
            }
            
            return allM3u8Links;
            
        } catch (error) {
            console.error('Extraction error:', error.message);
            return [];
        }
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node myflixer-extractor.js "<search query>" [episode] [season]');
        console.log('Examples:');
        console.log('  node myflixer-extractor.js "Avengers Endgame"');
        console.log('  node myflixer-extractor.js "Breaking Bad" 1 1  # Season 1, Episode 1');
        process.exit(1);
    }
    
    const query = args[0];
    const episode = args[1] ? parseInt(args[1]) : null;
    const season = args[2] ? parseInt(args[2]) : null;
    
    const extractor = new MyFlixerExtractor();
    
    extractor.extractM3u8Links(query, episode, season)
        .then(links => {
            if (links.length === 0) {
                console.log('No M3U8 links found');
            } else {
                console.log('\n=== EXTRACTED M3U8 LINKS ===');
                links.forEach((link, index) => {
                    console.log(`\nLink ${index + 1}:`);
                    console.log(`Source: ${link.source}`);
                    console.log(`Master M3U8 URL: ${link.m3u8Url}`);
                    console.log(`Headers: ${JSON.stringify(link.headers, null, 2)}`);
                    
                    if (link.qualities && link.qualities.length > 0) {
                        console.log('Available Qualities:');
                        link.qualities.forEach((quality, qIndex) => {
                            console.log(`  ${qIndex + 1}. ${quality.quality} (${quality.resolution}) - ${Math.round(quality.bandwidth/1000)}kbps`);
                            console.log(`     URL: ${quality.url}`);
                        });
                    }
                });
            }
        })
        .catch(error => {
            console.error('Error:', error.message);
            process.exit(1);
        });
}

module.exports = MyFlixerExtractor;