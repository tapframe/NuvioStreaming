/**
 * MoviesMod Provider for Stremio Addon
 * Supports both movies and TV series
 */

const axios = require('axios');
const cheerio = require('cheerio');
const FormData = require('form-data');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const { URLSearchParams, URL } = require('url');
const fs = require('fs').promises;
const path = require('path');
const { findBestMatch } = require('string-similarity');

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// --- Domain Fetching ---
let moviesModDomain = 'https://moviesmod.chat'; // Fallback domain
let domainCacheTimestamp = 0;
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function getMoviesModDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
        return moviesModDomain;
    }

    try {
        console.log('[MoviesMod] Fetching latest domain...');
        const response = await axios.get('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json', { timeout: 10000 });
        if (response.data && response.data.moviesmod) {
            moviesModDomain = response.data.moviesmod;
            domainCacheTimestamp = now;
            console.log(`[MoviesMod] Updated domain to: ${moviesModDomain}`);
        } else {
            console.warn('[MoviesMod] Domain JSON fetched, but "moviesmod" key was not found. Using fallback.');
        }
    } catch (error) {
        console.error(`[MoviesMod] Failed to fetch latest domain, using fallback. Error: ${error.message}`);
    }
    return moviesModDomain;
}

// --- Caching Configuration ---
const CACHE_ENABLED = process.env.DISABLE_CACHE !== 'true';
console.log(`[MoviesMod Cache] Internal cache is ${CACHE_ENABLED ? 'enabled' : 'disabled'}.`);
const CACHE_DIR = process.env.VERCEL ? path.join('/tmp', '.moviesmod_cache') : path.join(__dirname, '.cache', 'moviesmod');
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

// --- Caching Helper Functions ---
const ensureCacheDir = async () => {
    if (!CACHE_ENABLED) return;
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            console.error(`[MoviesMod Cache] Error creating cache directory: ${error.message}`);
        }
    }
};

const getFromCache = async (key) => {
    if (!CACHE_ENABLED) return null;
    const cacheFile = path.join(CACHE_DIR, `${key}.json`);
    try {
        const data = await fs.readFile(cacheFile, 'utf-8');
        const cached = JSON.parse(data);

        if (Date.now() > cached.expiry) {
            console.log(`[MoviesMod Cache] EXPIRED for key: ${key}`);
            await fs.unlink(cacheFile).catch(() => {});
            return null;
        }

        console.log(`[MoviesMod Cache] HIT for key: ${key}`);
        return cached.data;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`[MoviesMod Cache] READ ERROR for key ${key}: ${error.message}`);
        }
        return null;
    }
};

const saveToCache = async (key, data) => {
    if (!CACHE_ENABLED) return;
    const cacheFile = path.join(CACHE_DIR, `${key}.json`);
    const cacheData = {
        expiry: Date.now() + CACHE_TTL,
        data: data
    };
    try {
        await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
        console.log(`[MoviesMod Cache] SAVED for key: ${key}`);
    } catch (error) {
        console.error(`[MoviesMod Cache] WRITE ERROR for key ${key}: ${error.message}`);
    }
};

// Initialize cache directory on startup
ensureCacheDir();

// Helper function to extract quality from text
function extractQuality(text) {
    if (!text) return 'Unknown';
    
    const qualityMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
    if (qualityMatch) {
        return qualityMatch[1];
    }
    
    // Try to extract from full text
    const cleanMatch = text.match(/(480p|720p|1080p|2160p|4k)[^)]*\)/i);
    if (cleanMatch) {
        return cleanMatch[0];
    }
    
    return 'Unknown';
}

function parseQualityForSort(qualityString) {
    if (!qualityString) return 0;
    const match = qualityString.match(/(\d{3,4})p/i);
    return match ? parseInt(match[1], 10) : 0;
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

// Search for content on MoviesMod
async function searchMoviesMod(query) {
    try {
        const baseUrl = await getMoviesModDomain();
        const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
        const { data } = await axios.get(searchUrl);
        const $ = cheerio.load(data);

        const results = [];
        $('.latestPost').each((i, element) => {
            const linkElement = $(element).find('a');
            const title = linkElement.attr('title');
            const url = linkElement.attr('href');
            if (title && url) {
                results.push({ title, url });
            }
        });

        return results;
    } catch (error) {
        console.error(`[MoviesMod] Error searching: ${error.message}`);
        return [];
    }
}

// Extract download links from a movie/series page
async function extractDownloadLinks(moviePageUrl) {
    try {
        const { data } = await axios.get(moviePageUrl);
        const $ = cheerio.load(data);
        const links = [];
        const contentBox = $('.thecontent');

        // Get all relevant headers (for movies and TV shows) in document order
        const headers = contentBox.find('h3:contains("Season"), h4');
        
        headers.each((i, el) => {
            const header = $(el);
            const headerText = header.text().trim();
            
            // Define the content block for this header
            const blockContent = header.nextUntil('h3, h4');

            if (header.is('h3') && headerText.toLowerCase().includes('season')) {
                // TV Show Logic
                const linkElements = blockContent.find('a.maxbutton-episode-links, a.maxbutton-batch-zip');
                linkElements.each((j, linkEl) => {
                    const buttonText = $(linkEl).text().trim();
                    const linkUrl = $(linkEl).attr('href');
                    if (linkUrl && !buttonText.toLowerCase().includes('batch')) {
                        links.push({
                            quality: `${headerText} - ${buttonText}`,
                            url: linkUrl
                        });
                    }
                });
            } else if (header.is('h4')) {
                // Movie Logic
                const linkElement = blockContent.find('a[href*="modrefer.in"]').first();
                if (linkElement.length > 0) {
                    const link = linkElement.attr('href');
                    const cleanQuality = extractQuality(headerText);
                    links.push({
                        quality: cleanQuality,
                        url: link
                    });
                }
            }
        });

        return links;
    } catch (error) {
        console.error(`[MoviesMod] Error extracting download links: ${error.message}`);
        return [];
    }
}

// Resolve intermediate links (dramadrip, episodes.modpro.blog, modrefer.in)
async function resolveIntermediateLink(initialUrl, refererUrl, quality) {
    try {
        const urlObject = new URL(initialUrl);

        if (urlObject.hostname.includes('dramadrip.com')) {
            const { data: dramaData } = await axios.get(initialUrl, { headers: { 'Referer': refererUrl } });
            const $$ = cheerio.load(dramaData);
            
            let episodePageLink = null;
            const seasonMatch = quality.match(/Season \d+/i);
            // Extract the specific quality details, e.g., "1080p x264"
            const specificQualityMatch = quality.match(/(480p|720p|1080p|2160p|4k)[ \w\d-]*/i);

            if (seasonMatch && specificQualityMatch) {
                const seasonIdentifier = seasonMatch[0].toLowerCase();
                // Clean up the identifier to get only the essential parts
                let specificQualityIdentifier = specificQualityMatch[0].toLowerCase().replace(/msubs.*/i, '').replace(/esubs.*/i, '').replace(/\{.*/, '').trim();
                const qualityParts = specificQualityIdentifier.split(/\s+/); // -> ['1080p', 'x264']

                $$('a[href*="episodes.modpro.blog"], a[href*="cinematickit.org"]').each((i, el) => {
                    const link = $$(el);
                    const linkText = link.text().trim().toLowerCase();
                    const seasonHeader = link.closest('.wp-block-buttons').prevAll('h2.wp-block-heading').first().text().trim().toLowerCase();
                    
                    const seasonIsMatch = seasonHeader.includes(seasonIdentifier);
                    // Ensure that the link text contains all parts of our specific quality
                    const allPartsMatch = qualityParts.every(part => linkText.includes(part));

                    if (seasonIsMatch && allPartsMatch) {
                        episodePageLink = link.attr('href');
                        console.log(`[MoviesMod] Found specific match for "${quality}" -> "${link.text().trim()}": ${episodePageLink}`);
                        return false; // Break loop, we found our specific link
                    }
                });
            }

            if (!episodePageLink) {
                console.error(`[MoviesMod] Could not find a specific quality match on dramadrip page for: ${quality}`);
                return [];
            }
            
            // Pass quality to recursive call
            return await resolveIntermediateLink(episodePageLink, initialUrl, quality);
            
        } else if (urlObject.hostname.includes('cinematickit.org')) {
            // Handle cinematickit.org pages
            const { data } = await axios.get(initialUrl, { headers: { 'Referer': refererUrl } });
            const $ = cheerio.load(data);
            const finalLinks = [];
            
            // Look for episode links on cinematickit.org
            $('a[href*="driveseed.org"]').each((i, el) => {
                const link = $(el).attr('href');
                const text = $(el).text().trim();
                if (link && text && !text.toLowerCase().includes('batch')) {
                    finalLinks.push({
                        server: text.replace(/\s+/g, ' '),
                        url: link,
                    });
                }
            });
            
            // If no driveseed links found, try other patterns
            if (finalLinks.length === 0) {
                $('a[href*="modrefer.in"], a[href*="dramadrip.com"]').each((i, el) => {
                    const link = $(el).attr('href');
                    const text = $(el).text().trim();
                    if (link && text) {
                        finalLinks.push({
                            server: text.replace(/\s+/g, ' '),
                            url: link,
                        });
                    }
                });
            }
            
            return finalLinks;

        } else if (urlObject.hostname.includes('episodes.modpro.blog')) {
            const { data } = await axios.get(initialUrl, { headers: { 'Referer': refererUrl } });
            const $ = cheerio.load(data);
            const finalLinks = [];
            
            $('.entry-content a[href*="driveseed.org"], .entry-content a[href*="tech.unblockedgames.world"], .entry-content a[href*="tech.creativeexpressionsblog.com"]').each((i, el) => {
                const link = $(el).attr('href');
                const text = $(el).text().trim();
                if (link && text && !text.toLowerCase().includes('batch')) {
                    finalLinks.push({
                        server: text.replace(/\s+/g, ' '),
                        url: link,
                    });
                }
            });
            return finalLinks;

        } else if (urlObject.hostname.includes('modrefer.in')) {
            const encodedUrl = urlObject.searchParams.get('url');
            if (!encodedUrl) {
                console.error('[MoviesMod] Could not find encoded URL in modrefer.in link.');
                return [];
            }

            const decodedUrl = Buffer.from(encodedUrl, 'base64').toString('utf8');
            const { data } = await axios.get(decodedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': refererUrl,
                }
            });

            const $ = cheerio.load(data);
            const finalLinks = [];
            
            $('.timed-content-client_show_0_5_0 a').each((i, el) => {
                const link = $(el).attr('href');
                const text = $(el).text().trim();
                if (link) {
                    finalLinks.push({
                        server: text,
                        url: link,
                    });
                }
            });
            return finalLinks;
        } else {
            console.warn(`[MoviesMod] Unknown hostname: ${urlObject.hostname}`);
            return [];
        }
    } catch (error) {
        console.error(`[MoviesMod] Error resolving intermediate link: ${error.message}`);
        return [];
    }
}

// Function to resolve tech.unblockedgames.world links to driveleech URLs (adapted from UHDMovies)
async function resolveTechUnblockedLink(sidUrl) {
  console.log(`[MoviesMod] Resolving SID link: ${sidUrl}`);
  const { origin } = new URL(sidUrl);
  const jar = new CookieJar();
  const session = wrapper(axios.create({
    jar,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }
  }));

  try {
    // Step 0: Get the _wp_http value
    console.log("  [SID] Step 0: Fetching initial page...");
    const responseStep0 = await session.get(sidUrl);
    let $ = cheerio.load(responseStep0.data);
    const initialForm = $('#landing');
    const wp_http_step1 = initialForm.find('input[name="_wp_http"]').val();
    const action_url_step1 = initialForm.attr('action');

    if (!wp_http_step1 || !action_url_step1) {
      console.error("  [SID] Error: Could not find _wp_http in initial form.");
      return null;
    }

    // Step 1: POST to the first form's action URL
    console.log("  [SID] Step 1: Submitting initial form...");
    const step1Data = new URLSearchParams({ '_wp_http': wp_http_step1 });
    const responseStep1 = await session.post(action_url_step1, step1Data, {
      headers: { 'Referer': sidUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // Step 2: Parse verification page for second form
    console.log("  [SID] Step 2: Parsing verification page...");
    $ = cheerio.load(responseStep1.data);
    const verificationForm = $('#landing');
    const action_url_step2 = verificationForm.attr('action');
    const wp_http2 = verificationForm.find('input[name="_wp_http2"]').val();
    const token = verificationForm.find('input[name="token"]').val();

    if (!action_url_step2) {
      console.error("  [SID] Error: Could not find verification form.");
      return null;
    }

    // Step 3: POST to the verification URL
    console.log("  [SID] Step 3: Submitting verification...");
    const step2Data = new URLSearchParams({ '_wp_http2': wp_http2, 'token': token });
    const responseStep2 = await session.post(action_url_step2, step2Data, {
      headers: { 'Referer': responseStep1.request.res.responseUrl, 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    // Step 4: Find dynamic cookie and link from JavaScript
    console.log("  [SID] Step 4: Parsing final page for JS data...");
    let finalLinkPath = null;
    let cookieName = null;
    let cookieValue = null;

    const scriptContent = responseStep2.data;
    const cookieMatch = scriptContent.match(/s_343\('([^']+)',\s*'([^']+)'/);
    const linkMatch = scriptContent.match(/c\.setAttribute\("href",\s*"([^"]+)"\)/);
    
    if (cookieMatch) {
      cookieName = cookieMatch[1].trim();
      cookieValue = cookieMatch[2].trim();
    }
    if (linkMatch) {
      finalLinkPath = linkMatch[1].trim();
    }

    if (!finalLinkPath || !cookieName || !cookieValue) {
      console.error("  [SID] Error: Could not extract dynamic cookie/link from JS.");
      return null;
    }
    
    const finalUrl = new URL(finalLinkPath, origin).href;
    console.log(`  [SID] Dynamic link found: ${finalUrl}`);
    console.log(`  [SID] Dynamic cookie found: ${cookieName}`);

    // Step 5: Set cookie and make final request
    console.log("  [SID] Step 5: Setting cookie and making final request...");
    await jar.setCookie(`${cookieName}=${cookieValue}`, origin);
    
    const finalResponse = await session.get(finalUrl, {
      headers: { 'Referer': responseStep2.request.res.responseUrl }
    });

    // Step 6: Extract driveleech URL from meta refresh tag
    $ = cheerio.load(finalResponse.data);
    const metaRefresh = $('meta[http-equiv="refresh"]');
    if (metaRefresh.length > 0) {
        const content = metaRefresh.attr('content');
        const urlMatch = content.match(/url=(.*)/i);
        if (urlMatch && urlMatch[1]) {
            const driveleechUrl = urlMatch[1].replace(/"/g, "").replace(/'/g, "");
            console.log(`  [SID] SUCCESS! Resolved Driveleech URL: ${driveleechUrl}`);
            return driveleechUrl;
        }
    }

    console.error("  [SID] Error: Could not find meta refresh tag with Driveleech URL.");
    return null;

  } catch (error) {
    console.error(`  [SID] Error during SID resolution: ${error.message}`);
    if (error.response) {
      console.error(`  [SID] Status: ${error.response.status}`);
    }
    return null;
  }
}

// Resolve driveseed.org links to get download options
async function resolveDriveseedLink(driveseedUrl) {
    try {
        const { data } = await axios.get(driveseedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://links.modpro.blog/',
            }
        });

        const redirectMatch = data.match(/window\.location\.replace\("([^"]+)"\)/);

        if (redirectMatch && redirectMatch[1]) {
            const finalPath = redirectMatch[1];
            const finalUrl = `https://driveseed.org${finalPath}`;
            
            const finalResponse = await axios.get(finalUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': driveseedUrl,
                }
            });

            const $ = cheerio.load(finalResponse.data);
            const downloadOptions = [];
            let size = null;
            let fileName = null;

            // Extract size and filename from the list
            $('ul.list-group li').each((i, el) => {
                const text = $(el).text();
                if (text.includes('Size :')) {
                    size = text.split(':')[1].trim();
                } else if (text.includes('Name :')) {
                    fileName = text.split(':')[1].trim();
                }
            });

            // Find Resume Cloud button (primary)
            const resumeCloudLink = $('a:contains("Resume Cloud")').attr('href');
            if (resumeCloudLink) {
                downloadOptions.push({
                    title: 'Resume Cloud',
                    type: 'resume',
                    url: `https://driveseed.org${resumeCloudLink}`,
                    priority: 1
                });
            }

            // Find Resume Worker Bot (fallback)
            const workerSeedLink = $('a:contains("Resume Worker Bot")').attr('href');
            if (workerSeedLink) {
                downloadOptions.push({
                    title: 'Resume Worker Bot',
                    type: 'worker',
                    url: workerSeedLink,
                    priority: 2
                });
            }

            // Find Instant Download (final fallback)
            const instantDownloadLink = $('a:contains("Instant Download")').attr('href');
            if (instantDownloadLink) {
                downloadOptions.push({
                    title: 'Instant Download',
                    type: 'instant',
                    url: instantDownloadLink,
                    priority: 3
                });
            }

            // Sort by priority
            downloadOptions.sort((a, b) => a.priority - b.priority);
            return { downloadOptions, size, fileName };
        }
        return { downloadOptions: [], size: null, fileName: null };
    } catch (error) {
        console.error(`[MoviesMod] Error resolving Driveseed link: ${error.message}`);
        return { downloadOptions: [], size: null, fileName: null };
    }
}

// Resolve Resume Cloud link to final download URL
async function resolveResumeCloudLink(resumeUrl) {
    try {
        const { data } = await axios.get(resumeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://driveseed.org/',
            }
        });
        const $ = cheerio.load(data);
        const downloadLink = $('a:contains("Cloud Resume Download")').attr('href');
        return downloadLink || null;
    } catch (error) {
        console.error(`[MoviesMod] Error resolving Resume Cloud link: ${error.message}`);
        return null;
    }
}

// Resolve Worker Seed link to final download URL
async function resolveWorkerSeedLink(workerSeedUrl) {
    try {
        console.log(`[MoviesMod] Resolving Worker-seed link: ${workerSeedUrl}`);

        const jar = new CookieJar();
        const session = wrapper(axios.create({
            jar,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            }
        }));

        // Step 1: GET the page to get the script content and cookies
        console.log(`[MoviesMod] Step 1: Fetching page to get script content and cookies...`);
        const { data: pageHtml } = await session.get(workerSeedUrl);

        // Step 2: Use regex to extract the token and the correct ID from the script
        const scriptTags = pageHtml.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/g);
        
        if (!scriptTags) {
            console.error('[MoviesMod] Could not find any script tags on the page.');
            return null;
        }

        const scriptContent = scriptTags.find(s => s.includes("formData.append('token'"));

        if (!scriptContent) {
            console.error('[MoviesMod] Could not find the relevant script tag containing formData.append.');
            
            // Debug: Log available script content
            console.log(`[MoviesMod] Found ${scriptTags.length} script tags. Checking for token patterns...`);
            scriptTags.forEach((script, i) => {
                if (script.includes('token') || script.includes('formData')) {
                    console.log(`[MoviesMod] Script ${i} snippet:`, script.substring(0, 300));
                }
            });
            
            return null;
        }

        const tokenMatch = scriptContent.match(/formData\.append\('token', '([^']+)'\)/);
        const idMatch = scriptContent.match(/fetch\('\/download\?id=([^']+)',/);

        if (!tokenMatch || !tokenMatch[1] || !idMatch || !idMatch[1]) {
            console.error('[MoviesMod] Could not extract token or correct ID from the script.');
            console.log('[MoviesMod] Script content snippet:', scriptContent.substring(0, 500));
            
            // Try alternative patterns
            const altTokenMatch = scriptContent.match(/token['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
            const altIdMatch = scriptContent.match(/id['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
            
            if (altTokenMatch && altIdMatch) {
                console.log('[MoviesMod] Found alternative patterns, trying those...');
                const token = altTokenMatch[1];
                const id = altIdMatch[1];
                console.log(`[MoviesMod] Alternative token: ${token.substring(0, 20)}...`);
                console.log(`[MoviesMod] Alternative id: ${id}`);
                
                // Continue with these values
                return await makeWorkerSeedRequest(session, token, id, workerSeedUrl);
            }
            
            return null;
        }

        const token = tokenMatch[1];
        const correctId = idMatch[1];
        console.log(`[MoviesMod] Step 2: Extracted token: ${token.substring(0, 20)}...`);
        console.log(`[MoviesMod] Step 2: Extracted correct ID: ${correctId}`);

        return await makeWorkerSeedRequest(session, token, correctId, workerSeedUrl);

    } catch (error) {
        console.error(`[MoviesMod] Error resolving WorkerSeed link: ${error.message}`);
        if (error.response) {
            console.error('[MoviesMod] Error response data:', error.response.data);
        }
        return null;
    }
}

// Helper function to make the actual WorkerSeed API request
async function makeWorkerSeedRequest(session, token, correctId, workerSeedUrl) {
    // Step 3: Make the POST request with the correct data using the same session
    const apiUrl = `https://workerseed.dev/download?id=${correctId}`;
    
    const formData = new FormData();
    formData.append('token', token);
   
    console.log(`[MoviesMod] Step 3: POSTing to endpoint: ${apiUrl} with extracted token.`);

    // Use the session instance, which will automatically include the cookies
    const { data: apiResponse } = await session.post(apiUrl, formData, {
        headers: {
            ...formData.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': workerSeedUrl,
            'x-requested-with': 'XMLHttpRequest'
        }
    });

    if (apiResponse && apiResponse.url) {
        console.log(`[MoviesMod] SUCCESS! Final video link from Worker-seed API: ${apiResponse.url}`);
        return apiResponse.url;
    } else {
        console.log('[MoviesMod] Worker-seed API did not return a URL. Full response:');
        console.log(apiResponse);
        return null;
    }
}

// Resolve Video Seed (Instant Download) link
async function resolveVideoSeedLink(videoSeedUrl) {
    try {
        const urlParams = new URLSearchParams(new URL(videoSeedUrl).search);
        const keys = urlParams.get('url');

        if (keys) {
            const apiUrl = `${new URL(videoSeedUrl).origin}/api`;
            const formData = new FormData();
            formData.append('keys', keys);

            const apiResponse = await axios.post(apiUrl, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'x-token': new URL(videoSeedUrl).hostname
                }
            });

            if (apiResponse.data && apiResponse.data.url) {
                return apiResponse.data.url;
            }
        }
        return null;
    } catch (error) {
        console.error(`[MoviesMod] Error resolving VideoSeed link: ${error.message}`);
        return null;
    }
}

// Validate if a video URL is working (not 404 or broken)
async function validateVideoUrl(url, timeout = 10000) {
    try {
        console.log(`[MoviesMod] Validating URL: ${url.substring(0, 100)}...`);
        const response = await axios.head(url, {
            timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Range': 'bytes=0-1' // Just request first byte to test
            }
        });
        
        // Check if status is OK (200-299) or partial content (206)
        if (response.status >= 200 && response.status < 400) {
            console.log(`[MoviesMod] ✓ URL validation successful (${response.status})`);
            return true;
        } else {
            console.log(`[MoviesMod] ✗ URL validation failed with status: ${response.status}`);
            return false;
        }
    } catch (error) {
        console.log(`[MoviesMod] ✗ URL validation failed: ${error.message}`);
        return false;
    }
}

// Main function to get streams for TMDB content
async function getMoviesModStreams(tmdbId, mediaType, seasonNum = null, episodeNum = null) {
    try {
        console.log(`[MoviesMod] Fetching streams for TMDB ${mediaType}/${tmdbId}${seasonNum ? `, S${seasonNum}E${episodeNum}`: ''}`);
        
        // Define a cache key based on the media type and ID. For series, cache per season.
        const cacheKey = `moviesmod_driveseed_v6_${tmdbId}_${mediaType}${seasonNum ? `_s${seasonNum}` : ''}`;
        let resolvedQualities = await getFromCache(cacheKey);

        if (!resolvedQualities) {
            console.log(`[MoviesMod Cache] MISS for key: ${cacheKey}. Fetching from source.`);

        // We need to fetch title and year from TMDB API
        const TMDB_API_KEY = process.env.TMDB_API_KEY;
            if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY not configured.');

            const { default: fetch } = await import('node-fetch');
            const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
            const tmdbDetails = await (await fetch(tmdbUrl)).json();
            
            const title = mediaType === 'tv' ? tmdbDetails.name : tmdbDetails.title;
            const year = mediaType === 'tv' ? tmdbDetails.first_air_date?.substring(0, 4) : tmdbDetails.release_date?.substring(0, 4);
            if (!title) throw new Error('Could not get title from TMDB');

            console.log(`[MoviesMod] Found metadata: ${title} (${year})`);
            const searchResults = await searchMoviesMod(title);
            if (searchResults.length === 0) throw new Error(`No search results found for "${title}"`);

            // --- NEW: Use string similarity to find the best match ---
            const titles = searchResults.map(r => r.title);
            const bestMatch = findBestMatch(title, titles);
            
            console.log(`[MoviesMod] Best match for "${title}" is "${bestMatch.bestMatch.target}" with a rating of ${bestMatch.bestMatch.rating.toFixed(2)}`);

            let selectedResult = null;
            // Set a minimum similarity threshold (e.g., 0.3) to avoid obviously wrong matches
            if (bestMatch.bestMatch.rating > 0.3) {
                selectedResult = searchResults[bestMatch.bestMatchIndex];

                // Additional check for year if it's a movie
                if (mediaType === 'movie' && year) {
                    if (!selectedResult.title.includes(year)) {
                        console.warn(`[MoviesMod] Title match found, but year mismatch. Matched: "${selectedResult.title}", Expected year: ${year}. Discarding match.`);
                        selectedResult = null; // Discard if year doesn't match
                    }
                }
            }
            
            if (!selectedResult) {
                // If no good match is found, try a stricter direct search using regex with word boundaries
                console.log('[MoviesMod] Similarity match failed or was below threshold. Trying stricter name/year search with word boundaries...');
                const titleRegex = new RegExp(`\\b${escapeRegExp(title.toLowerCase())}\\b`);

                if (mediaType === 'movie') {
                    selectedResult = searchResults.find(r => 
                        titleRegex.test(r.title.toLowerCase()) &&
                        (!year || r.title.includes(year))
                    );
                } else { // for 'tv'
                    // For TV, be more lenient on year, but check for title and 'season' keyword.
                    selectedResult = searchResults.find(r => 
                        titleRegex.test(r.title.toLowerCase()) &&
                        r.title.toLowerCase().includes('season')
                    );
                }
            }

            if (!selectedResult) {
                throw new Error(`No suitable search result found for "${title} (${year})". Best similarity match was too low or failed year check.`);
            }
            
            console.log(`[MoviesMod] Selected: ${selectedResult.title}`);
            const downloadLinks = await extractDownloadLinks(selectedResult.url);
            if (downloadLinks.length === 0) throw new Error('No download links found');

            let relevantLinks = downloadLinks;
            if ((mediaType === 'tv' || mediaType === 'series') && seasonNum !== null) {
                relevantLinks = downloadLinks.filter(link => link.quality.toLowerCase().includes(`season ${seasonNum}`) || link.quality.toLowerCase().includes(`s${seasonNum}`));
            }
            
            // Filter out 480p links before processing
            relevantLinks = relevantLinks.filter(link => !link.quality.toLowerCase().includes('480p'));
            console.log(`[MoviesMod] ${relevantLinks.length} links remaining after 480p filter.`);

            if (relevantLinks.length > 0) {
                console.log(`[MoviesMod] Found ${relevantLinks.length} relevant quality links.`);
                const qualityPromises = relevantLinks.map(async (link) => {
                    const finalLinks = await resolveIntermediateLink(link.url, selectedResult.url, link.quality);
                    if (finalLinks && finalLinks.length > 0) {
                        return { quality: link.quality, finalLinks: finalLinks };
                    }
                    return null;
                });

                resolvedQualities = (await Promise.all(qualityPromises)).filter(Boolean);
            } else {
                resolvedQualities = [];
            }
            
            await saveToCache(cacheKey, resolvedQualities);
        }

        if (!resolvedQualities || resolvedQualities.length === 0) {
            console.log('[MoviesMod] No intermediate links found from cache or scraping.');
            return [];
        }

        console.log(`[MoviesMod] Processing ${resolvedQualities.length} qualities to get final streams.`);
        const streams = [];
        const processedFileNames = new Set();

        const qualityProcessingPromises = resolvedQualities.map(async (qualityInfo) => {
            const { quality, finalLinks } = qualityInfo;
            
                let targetLinks = finalLinks;
            if ((mediaType === 'tv' || mediaType === 'series') && episodeNum !== null) {
                targetLinks = finalLinks.filter(fl => fl.server.toLowerCase().includes(`episode ${episodeNum}`) || fl.server.toLowerCase().includes(`ep ${episodeNum}`) || fl.server.toLowerCase().includes(`e${episodeNum}`));
                if (targetLinks.length === 0) {
                    console.log(`[MoviesMod] No episode ${episodeNum} found for ${quality}`);
                        return [];
                    }
                }

            const finalStreamPromises = targetLinks.map(async (targetLink) => {
                try {
                    let currentUrl = targetLink.url;

                    // Step 1: Handle SID links if they appear
                    if (currentUrl.includes('tech.unblockedgames.world') || currentUrl.includes('tech.creativeexpressionsblog.com')) {
                        console.log(`[MoviesMod] Bypassing SID link: ${currentUrl}`);
                        const resolvedUrl = await resolveTechUnblockedLink(currentUrl);
                        if (!resolvedUrl) {
                            console.warn(`[MoviesMod] Failed to bypass tech.unblockedgames.world for: ${currentUrl}`);
                            return null;
                        }
                        console.log(`[MoviesMod] Bypassed. Continuing with resolved URL: ${resolvedUrl}`);
                        currentUrl = resolvedUrl; // The resolved URL should be a driveseed link
                    }
                    
                    // Step 2: Now process the (potentially resolved) driveseed link
                    if (currentUrl.includes('driveseed.org')) {
                        const { downloadOptions, size: driveseedSize, fileName } = await resolveDriveseedLink(currentUrl);
                        
                        if (fileName && processedFileNames.has(fileName)) {
                            console.log(`[MoviesMod] Skipping duplicate file: ${fileName}`);
                            return null;
                        }
                        if (fileName) processedFileNames.add(fileName);

                        if (!downloadOptions || downloadOptions.length === 0) return null;

                        // Try each download method in order of priority until we find a working one
                        let selectedResult = null;
                        for (const option of downloadOptions) {
                            try {
                                console.log(`[MoviesMod] Trying ${option.title} for ${quality}...`);
                                let finalDownloadUrl = null;
                                
                                if (option.type === 'resume') {
                                    finalDownloadUrl = await resolveResumeCloudLink(option.url);
                                } else if (option.type === 'worker') {
                                    finalDownloadUrl = await resolveWorkerSeedLink(option.url);
                                } else if (option.type === 'instant') {
                                    finalDownloadUrl = await resolveVideoSeedLink(option.url);
                                }
                                
                                if (finalDownloadUrl) {
                                    // Validate the URL before using it
                                    const isValid = await validateVideoUrl(finalDownloadUrl);
                                    if (isValid) {
                                        selectedResult = { url: finalDownloadUrl, method: option.title };
                                        console.log(`[MoviesMod] ✓ Successfully resolved ${quality} using ${option.title}`);
                                        break; // Found working URL, stop trying other methods
                                    } else {
                                        console.log(`[MoviesMod] ✗ ${option.title} returned invalid/broken URL, trying next method...`);
                                    }
                                } else {
                                    console.log(`[MoviesMod] ✗ ${option.title} failed to resolve URL, trying next method...`);
                                }
                            } catch (error) {
                                console.log(`[MoviesMod] ✗ ${option.title} threw error: ${error.message}, trying next method...`);
                            }
                        }
                        
                        if (!selectedResult) {
                            console.log(`[MoviesMod] ✗ All download methods failed for ${quality}`);
                            return null;
                        }
                        
                        let actualQuality = extractQuality(quality);
                        const sizeInfo = driveseedSize || quality.match(/\[([^\]]+)\]/)?.[1];
                        const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, "").replace(/[._]/g, ' ') : `Stream from ${quality}`;
                        const techDetails = getTechDetails(quality);
                        const techDetailsString = techDetails.length > 0 ? ` • ${techDetails.join(' • ')}` : '';
                            
                        return {
                            name: `MoviesMod\n${actualQuality}`,
                            title: `${cleanFileName}\n${sizeInfo || ''}${techDetailsString}`,
                            url: selectedResult.url,
                            quality: actualQuality,
                        };
                    } else {
                        console.warn(`[MoviesMod] Unsupported URL type for final processing: ${currentUrl}`);
                        return null;
                    }
                } catch (e) {
                    console.error(`[MoviesMod] Error processing target link ${targetLink.url}: ${e.message}`);
                    return null;
                }
            });

            return (await Promise.all(finalStreamPromises)).filter(Boolean);
        });

        const allResults = await Promise.all(qualityProcessingPromises);
        allResults.flat().forEach(s => streams.push(s));

        // Sort by quality descending
        streams.sort((a, b) => {
            const qualityA = parseQualityForSort(a.quality);
            const qualityB = parseQualityForSort(b.quality);
            return qualityB - qualityA;
        });

        console.log(`[MoviesMod] Successfully extracted and sorted ${streams.length} streams`);
        return streams;

    } catch (error) {
        console.error(`[MoviesMod] Error getting streams: ${error.message}`);
        return [];
    }
}

module.exports = {
    getMoviesModStreams
}; 