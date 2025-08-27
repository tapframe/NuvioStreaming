// MoviesMod Scraper for Nuvio Local Scrapers
// React Native compatible version with Cheerio support

// Import cheerio-without-node-native for React Native
const cheerio = require('cheerio-without-node-native');

console.log('[MoviesMod] Using cheerio-without-node-native for DOM parsing');

// Escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const FALLBACK_DOMAIN = 'https://moviesmod.chat';
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Global variables for domain caching
let moviesModDomain = FALLBACK_DOMAIN;
let domainCacheTimestamp = 0;

// Fetch latest domain from GitHub
async function getMoviesModDomain() {
  const now = Date.now();
  if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
    return moviesModDomain;
  }

  try {
    console.log('[MoviesMod] Fetching latest domain...');
    const response = await fetch('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.moviesmod) {
        moviesModDomain = data.moviesmod;
        domainCacheTimestamp = now;
        console.log(`[MoviesMod] Updated domain to: ${moviesModDomain}`);
      }
    }
  } catch (error) {
    console.error(`[MoviesMod] Failed to fetch latest domain: ${error.message}`);
  }

  return moviesModDomain;
}

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
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

// Helper function to extract quality from text
function extractQuality(text) {
  if (!text) return 'Unknown';

  const qualityMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
  if (qualityMatch) {
    return qualityMatch[1];
  }

  const cleanMatch = text.match(/(480p|720p|1080p|2160p|4k)[^)]*\)/i);
  if (cleanMatch) {
    return cleanMatch[0];
  }

  return 'Unknown';
}

// Parse quality for sorting
function parseQualityForSort(qualityString) {
  if (!qualityString) return 0;
  const match = qualityString.match(/(\d{3,4})p/i);
  return match ? parseInt(match[1], 10) : 0;
}

// Get technical details from quality string
function getTechDetails(qualityString) {
  if (!qualityString) return [];
  const details = [];
  const lowerText = qualityString.toLowerCase();
  if (lowerText.includes('10bit')) details.push('10-bit');
  if (lowerText.includes('hevc') || lowerText.includes('x265')) details.push('HEVC');
  if (lowerText.includes('hdr')) details.push('HDR');
  return details;
}

// Simple string similarity function
function findBestMatch(mainString, targetStrings) {
  if (!targetStrings || targetStrings.length === 0) {
    return { bestMatch: { target: '', rating: 0 }, bestMatchIndex: -1 };
  }

  const ratings = targetStrings.map(target => {
    if (!target) return 0;
    
    const main = mainString.toLowerCase();
    const targ = target.toLowerCase();
    
    if (main === targ) return 1;
    if (targ.includes(main) || main.includes(targ)) return 0.8;
    
    // Simple word matching
    const mainWords = main.split(/\s+/);
    const targWords = targ.split(/\s+/);
    let matches = 0;
    
    for (const word of mainWords) {
      if (word.length > 2 && targWords.some(tw => tw.includes(word) || word.includes(tw))) {
        matches++;
      }
    }
    
    return matches / Math.max(mainWords.length, targWords.length);
  });

  const bestRating = Math.max(...ratings);
  const bestIndex = ratings.indexOf(bestRating);

  return {
    bestMatch: { target: targetStrings[bestIndex], rating: bestRating },
    bestMatchIndex: bestIndex
  };
}

// Search for content on MoviesMod
async function searchMoviesMod(query) {
  try {
    const baseUrl = await getMoviesModDomain();
    const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
    console.log(`[MoviesMod] Searching: ${searchUrl}`);
    
    const response = await makeRequest(searchUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const results = [];
    $('.latestPost').each((i, element) => {
      const linkElement = $(element).find('a');
      const title = linkElement.attr('title');
      const url = linkElement.attr('href');
      if (title && url) {
        results.push({ title, url });
      }
    });

    console.log(`[MoviesMod] Found ${results.length} search results`);
    return results;
  } catch (error) {
    console.error(`[MoviesMod] Error searching: ${error.message}`);
    return [];
  }
}

// Extract download links from a movie/series page
async function extractDownloadLinks(moviePageUrl) {
  try {
    const response = await makeRequest(moviePageUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
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

    console.log(`[MoviesMod] Extracted ${links.length} download links`);
    return links;
  } catch (error) {
    console.error(`[MoviesMod] Error extracting download links: ${error.message}`);
    return [];
  }
}

// Resolve intermediate links
async function resolveIntermediateLink(initialUrl, refererUrl, quality) {
  try {
    const urlObject = new URL(initialUrl);

    if (urlObject.hostname.includes('modrefer.in')) {
      const encodedUrl = urlObject.searchParams.get('url');
      if (!encodedUrl) {
        console.error('[MoviesMod] Could not find encoded URL in modrefer.in link.');
        return [];
      }

      // Use atob for base64 decoding (React Native compatible)
      const decodedUrl = atob(encodedUrl);
      console.log(`[MoviesMod] Decoded modrefer URL: ${decodedUrl}`);
      
      const response = await makeRequest(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': refererUrl,
        }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      const finalLinks = [];

      // Debug: Check what content is available on the page
      console.log(`[MoviesMod] Page title: ${$('title').text()}`);
      console.log(`[MoviesMod] Total links on page: ${$('a').length}`);
      console.log(`[MoviesMod] HTML length: ${html.length} characters`);
      
      // Look for timed content links (this is the key part from OG)
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
      
      // If no timed content found, look for any driveseed or tech links
      if (finalLinks.length === 0) {
        console.log(`[MoviesMod] No timed content found, looking for direct links...`);
        $('a').each((i, el) => {
          const link = $(el).attr('href');
          const text = $(el).text().trim();
          if (link && (link.includes('driveseed.org') || link.includes('tech.unblockedgames.world') || link.includes('tech.examzculture.in') || link.includes('tech.creativeexpressionsblog.com') || link.includes('tech.examdegree.site'))) {
            console.log(`[MoviesMod] Found direct link: ${text} -> ${link}`);
            finalLinks.push({
              server: text || 'Download Link',
              url: link,
            });
          }
        });
      }
      
      // Also look for any additional download buttons or links that might be hidden
      if (finalLinks.length === 0) {
        console.log(`[MoviesMod] Looking for alternative download patterns...`);
        $('button, .download-btn, .btn, [class*="download"], [class*="btn"]').each((i, el) => {
          const $el = $(el);
          const link = $el.attr('href') || $el.attr('data-href') || $el.find('a').attr('href');
          const text = $el.text().trim();
          if (link && (link.includes('driveseed.org') || link.includes('tech.unblockedgames.world') || link.includes('tech.examzculture.in') || link.includes('tech.creativeexpressionsblog.com') || link.includes('tech.examdegree.site'))) {
            console.log(`[MoviesMod] Found alternative link: ${text} -> ${link}`);
            finalLinks.push({
              server: text || 'Alternative Download',
              url: link,
            });
          }
        });
      }
      
      console.log(`[MoviesMod] Found ${finalLinks.length} total links`);
      return finalLinks;
    }

    return [];
  } catch (error) {
    console.error(`[MoviesMod] Error resolving intermediate link: ${error.message}`);
    return [];
  }
}

// Resolve tech.unblockedgames.world SID links to driveleech URLs
async function resolveTechUnblockedLink(sidUrl) {
  console.log(`[MoviesMod] Resolving SID link: ${sidUrl}`);
  
  try {
    // Step 1: Get the initial page
    const response = await makeRequest(sidUrl);
    const html = await response.text();
    const $ = cheerio.load(html);
    
    const initialForm = $('#landing');
    const wp_http_step1 = initialForm.find('input[name="_wp_http"]').val();
    const action_url_step1 = initialForm.attr('action');

    if (!wp_http_step1 || !action_url_step1) {
      console.error("  [SID] Error: Could not find _wp_http in initial form.");
      return null;
    }

    // Step 2: POST to the first form's action URL
    const step1Data = new URLSearchParams({ '_wp_http': wp_http_step1 });
    const responseStep1 = await makeRequest(action_url_step1, {
      method: 'POST',
      headers: { 
        'Referer': sidUrl, 
        'Content-Type': 'application/x-www-form-urlencoded' 
      },
      body: step1Data.toString()
    });

    // Step 3: Parse verification page for second form
    const html2 = await responseStep1.text();
    const $2 = cheerio.load(html2);
    const verificationForm = $2('#landing');
    const action_url_step2 = verificationForm.attr('action');
    const wp_http2 = verificationForm.find('input[name="_wp_http2"]').val();
    const token = verificationForm.find('input[name="token"]').val();

    if (!action_url_step2) {
      console.error("  [SID] Error: Could not find verification form.");
      return null;
    }

    // Step 4: POST to the verification URL
    const step2Data = new URLSearchParams({ '_wp_http2': wp_http2, 'token': token });
    const responseStep2 = await makeRequest(action_url_step2, {
      method: 'POST',
      headers: { 
        'Referer': responseStep1.url, 
        'Content-Type': 'application/x-www-form-urlencoded' 
      },
      body: step2Data.toString()
    });

    // Step 5: Find dynamic cookie and link from JavaScript
    const finalHtml = await responseStep2.text();
    let finalLinkPath = null;
    let cookieName = null;
    let cookieValue = null;

    const cookieMatch = finalHtml.match(/s_343\('([^']+)',\s*'([^']+)'/);
    const linkMatch = finalHtml.match(/c\.setAttribute\("href",\s*"([^"]+)"\)/);

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

    const { origin } = new URL(sidUrl);
    const finalUrl = new URL(finalLinkPath, origin).href;

    // Step 6: Make final request with cookie
    const finalResponse = await makeRequest(finalUrl, {
      headers: { 
        'Referer': responseStep2.url,
        'Cookie': `${cookieName}=${cookieValue}`
      }
    });

    // Step 7: Extract driveleech URL from meta refresh tag
    const metaHtml = await finalResponse.text();
    const $3 = cheerio.load(metaHtml);
    const metaRefresh = $3('meta[http-equiv="refresh"]');
    
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
    return null;
  }
}

// Resolve driveseed.org links to get download options
async function resolveDriveseedLink(driveseedUrl) {
  try {
    const response = await makeRequest(driveseedUrl, {
      headers: {
        'Referer': 'https://links.modpro.blog/',
      }
    });
    const html = await response.text();

    const redirectMatch = html.match(/window\.location\.replace\("([^"]+)"\)/);

    if (redirectMatch && redirectMatch[1]) {
      const finalPath = redirectMatch[1];
      const finalUrl = `https://driveseed.org${finalPath}`;

      const finalResponse = await makeRequest(finalUrl, {
        headers: {
          'Referer': driveseedUrl,
        }
      });
      const finalHtml = await finalResponse.text();
      const $ = cheerio.load(finalHtml);
      
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

      // Find any other download links as additional fallbacks
      $('a[href*="/download/"]').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href && text && !downloadOptions.some(opt => opt.url === href)) {
          downloadOptions.push({
            title: text,
            type: 'generic',
            url: href.startsWith('http') ? href : `https://driveseed.org${href}`,
            priority: 4
          });
        }
      });

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
    const response = await makeRequest(resumeUrl, {
      headers: {
        'Referer': 'https://driveseed.org/',
      }
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const downloadLink = $('a:contains("Cloud Resume Download")').attr('href');
    return downloadLink || null;
  } catch (error) {
    console.error(`[MoviesMod] Error resolving Resume Cloud link: ${error.message}`);
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
      const formData = new URLSearchParams();
      formData.append('keys', keys);

      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-token': new URL(videoSeedUrl).hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (apiResponse.ok) {
        const responseData = await apiResponse.json();
        if (responseData && responseData.url) {
          return responseData.url;
        }
      }
    }
    return null;
  } catch (error) {
    console.error(`[MoviesMod] Error resolving VideoSeed link: ${error.message}`);
    return null;
  }
}

// Validate if a video URL is working
async function validateVideoUrl(url, timeout = 10000) {
  try {
    console.log(`[MoviesMod] Validating URL: ${url.substring(0, 100)}...`);
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'Range': 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.ok || response.status === 206) {
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

// Process a single download link to get final stream
async function processDownloadLink(link, selectedResult, mediaType, episodeNum) {
  try {
    console.log(`[MoviesMod] Processing quality: ${link.quality}`);

    const finalLinks = await resolveIntermediateLink(link.url, selectedResult.url, link.quality);
    if (!finalLinks || finalLinks.length === 0) {
      console.log(`[MoviesMod] No final links found for ${link.quality}`);
      return null;
    }

    // Filter for specific episode if needed
    let targetLinks = finalLinks;
    if ((mediaType === 'tv' || mediaType === 'series') && episodeNum !== null) {
      targetLinks = finalLinks.filter(targetLink => {
        const serverName = targetLink.server.toLowerCase();
        const episodePatterns = [
          new RegExp(`episode\\s+${episodeNum}\\b`, 'i'),
          new RegExp(`ep\\s+${episodeNum}\\b`, 'i'),
          new RegExp(`e${episodeNum}\\b`, 'i'),
          new RegExp(`\\b${episodeNum}\\b`)
        ];

        return episodePatterns.some(pattern => pattern.test(serverName));
      });

      if (targetLinks.length === 0) {
        console.log(`[MoviesMod] No episode ${episodeNum} found for ${link.quality}`);
        return null;
      }
    }

    // Process each target link
    for (const targetLink of targetLinks) {
      try {
        let currentUrl = targetLink.url;

        // Handle SID links if they appear
        if (currentUrl && (currentUrl.includes('tech.unblockedgames.world') || currentUrl.includes('tech.creativeexpressionsblog.com') || currentUrl.includes('tech.examzculture.in') || currentUrl.includes('tech.examdegree.site'))) {
          console.log(`[MoviesMod] Resolving SID link: ${targetLink.server}`);
          const resolvedUrl = await resolveTechUnblockedLink(currentUrl);
          if (!resolvedUrl) {
            console.log(`[MoviesMod] Failed to resolve SID link for ${targetLink.server}`);
            continue;
          }
          
          // Skip broken link report pages
          if (resolvedUrl.includes('report-broken-links') || resolvedUrl.includes('moviesmod.wiki')) {
            console.log(`[MoviesMod] Skipping broken link report page for ${targetLink.server}`);
            continue;
          }
          
          currentUrl = resolvedUrl;
        }

        if (currentUrl && currentUrl.includes('driveseed.org')) {
          const { downloadOptions, size, fileName } = await resolveDriveseedLink(currentUrl);

          if (!downloadOptions || downloadOptions.length === 0) {
            console.log(`[MoviesMod] No download options found for ${targetLink.server} - ${currentUrl}`);
            continue;
          }

          // Try download methods in order of priority
          let finalDownloadUrl = null;
          let usedMethod = null;

          for (const option of downloadOptions) {
            try {
              console.log(`[MoviesMod] Trying ${option.title} for ${link.quality}...`);

              if (option.type === 'resume') {
                finalDownloadUrl = await resolveResumeCloudLink(option.url);
              } else if (option.type === 'instant') {
                finalDownloadUrl = await resolveVideoSeedLink(option.url);
              }

              if (finalDownloadUrl) {
                // Check if URL validation is enabled
                if (typeof URL_VALIDATION_ENABLED !== 'undefined' && !URL_VALIDATION_ENABLED) {
                  usedMethod = option.title;
                  console.log(`[MoviesMod] ✓ URL validation disabled, accepting ${usedMethod} result`);
                  break;
                }
                
                const isValid = await validateVideoUrl(finalDownloadUrl);
                if (isValid) {
                  usedMethod = option.title;
                  console.log(`[MoviesMod] ✓ Successfully resolved using ${usedMethod}`);
                  break;
                } else {
                  console.log(`[MoviesMod] ✗ ${option.title} returned invalid URL`);
                  finalDownloadUrl = null;
                }
              }
            } catch (error) {
              console.log(`[MoviesMod] ✗ ${option.title} failed: ${error.message}`);
            }
          }

          if (finalDownloadUrl) {
            const actualQuality = extractQuality(link.quality);
            const sizeInfo = size || link.quality.match(/\[([^\]]+)\]/)?.[1];
            const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, "").replace(/[._]/g, ' ') : `Stream from ${link.quality}`;
            const techDetails = getTechDetails(link.quality);
            const techDetailsString = techDetails.length > 0 ? ` • ${techDetails.join(' • ')}` : '';

            return {
              name: `MoviesMod`,
              title: `${cleanFileName}\n${sizeInfo || ''}${techDetailsString}`,
              url: finalDownloadUrl,
              quality: actualQuality,
              size: sizeInfo,
              fileName: fileName,
              type: 'direct'
            };
          }
        }
      } catch (error) {
        console.error(`[MoviesMod] Error processing target link: ${error.message}`);
      }
    }
    return null;
  } catch (error) {
    console.error(`[MoviesMod] Error processing quality ${link.quality}: ${error.message}`);
    return null;
  }
}

// Main function to get streams for TMDB content
async function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
  console.log(`[MoviesMod] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${seasonNum ? `, S${seasonNum}E${episodeNum}` : ''}`);

  try {
    // Get TMDB info
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const tmdbResponse = await makeRequest(tmdbUrl);
    const tmdbData = await tmdbResponse.json();

    const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
    const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);

    if (!title) {
      throw new Error('Could not extract title from TMDB response');
    }

    console.log(`[MoviesMod] TMDB Info: "${title}" (${year})`);

    // Search for the media
    const searchResults = await searchMoviesMod(title);
    if (searchResults.length === 0) {
      console.log(`[MoviesMod] No search results found`);
      return [];
    }

    // Use string similarity to find the best match
    const titles = searchResults.map(r => r.title);
    const bestMatch = findBestMatch(title, titles);

    console.log(`[MoviesMod] Best match for "${title}" is "${bestMatch.bestMatch.target}" with a rating of ${bestMatch.bestMatch.rating.toFixed(2)}`);

    let selectedResult = null;
    if (bestMatch.bestMatch.rating > 0.3) {
      selectedResult = searchResults[bestMatch.bestMatchIndex];

      // Additional check for year if it's a movie
      if (mediaType === 'movie' && year) {
        if (!selectedResult.title.includes(year)) {
          console.warn(`[MoviesMod] Title match found, but year mismatch. Matched: "${selectedResult.title}", Expected year: ${year}. Discarding match.`);
          selectedResult = null;
        }
      }
    }

    if (!selectedResult) {
      // Try stricter search
      console.log('[MoviesMod] Similarity match failed. Trying stricter search...');
      const titleRegex = new RegExp(`\\b${escapeRegExp(title.toLowerCase())}\\b`);

      if (mediaType === 'movie') {
        selectedResult = searchResults.find(r =>
          titleRegex.test(r.title.toLowerCase()) &&
          (!year || r.title.includes(year))
        );
      } else {
        selectedResult = searchResults.find(r =>
          titleRegex.test(r.title.toLowerCase()) &&
          r.title.toLowerCase().includes('season')
        );
      }
    }

    if (!selectedResult) {
      console.log(`[MoviesMod] No suitable search result found for "${title} (${year})"`);
      return [];
    }

    console.log(`[MoviesMod] Selected: ${selectedResult.title}`);

    // Extract download links
    const downloadLinks = await extractDownloadLinks(selectedResult.url);
    if (downloadLinks.length === 0) {
      console.log(`[MoviesMod] No download links found`);
      return [];
    }

    let relevantLinks = downloadLinks;
    if ((mediaType === 'tv' || mediaType === 'series') && seasonNum !== null) {
      relevantLinks = downloadLinks.filter(link =>
        link.quality.toLowerCase().includes(`season ${seasonNum}`) ||
        link.quality.toLowerCase().includes(`s${seasonNum}`)
      );
    }

    // Filter out 480p links
    relevantLinks = relevantLinks.filter(link => !link.quality.toLowerCase().includes('480p'));
    console.log(`[MoviesMod] ${relevantLinks.length} links remaining after 480p filter.`);

    if (relevantLinks.length === 0) {
      console.log(`[MoviesMod] No relevant links found after filtering`);
      return [];
    }

    // Process links to get final streams - using Promise.all like UHDMovies
    const streamPromises = relevantLinks.map(link => processDownloadLink(link, selectedResult, mediaType, episodeNum));
    const streams = (await Promise.all(streamPromises)).filter(Boolean);

    // Sort by quality descending
    streams.sort((a, b) => {
      const qualityA = parseQualityForSort(a.quality);
      const qualityB = parseQualityForSort(b.quality);
      return qualityB - qualityA;
    });

    console.log(`[MoviesMod] Successfully processed ${streams.length} streams`);
    return streams;

  } catch (error) {
    console.error(`[MoviesMod] Error in getStreams: ${error.message}`);
    return [];
  }
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  // For React Native environment
  global.getStreams = getStreams;
}