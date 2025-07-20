const axios = require('axios');
const cheerio = require('cheerio');
const { URLSearchParams, URL } = require('url');
const FormData = require('form-data');
const { CookieJar } = require('tough-cookie');
const fs = require('fs').promises;
const path = require('path');
const RedisCache = require('../utils/redisCache');

// Dynamic import for axios-cookiejar-support
let axiosCookieJarSupport = null;
const getAxiosCookieJarSupport = async () => {
  if (!axiosCookieJarSupport) {
    axiosCookieJarSupport = await import('axios-cookiejar-support');
  }
  return axiosCookieJarSupport;
};

// --- Domain Fetching ---
let uhdMoviesDomain = 'https://uhdmovies.email'; // Fallback domain
let domainCacheTimestamp = 0;
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function getUHDMoviesDomain() {
  const now = Date.now();
  if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
    return uhdMoviesDomain;
  }

  try {
    console.log('[UHDMovies] Fetching latest domain...');
    const response = await axios.get('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json', { timeout: 10000 });
    if (response.data && response.data.UHDMovies) {
      uhdMoviesDomain = response.data.UHDMovies;
      domainCacheTimestamp = now;
      console.log(`[UHDMovies] Updated domain to: ${uhdMoviesDomain}`);
    } else {
      console.warn('[UHDMovies] Domain JSON fetched, but "UHDMovies" key was not found. Using fallback.');
    }
  } catch (error) {
    console.error(`[UHDMovies] Failed to fetch latest domain, using fallback. Error: ${error.message}`);
  }
  return uhdMoviesDomain;
}

// Constants
const TMDB_API_KEY_UHDMOVIES = "439c478a771f35c05022f9feabcca01c"; // Public TMDB API key

// --- Caching Configuration ---
const CACHE_ENABLED = process.env.DISABLE_CACHE !== 'true'; // Set to true to disable caching for this provider
console.log(`[UHDMovies] Internal cache is ${CACHE_ENABLED ? 'enabled' : 'disabled'}.`);
const CACHE_DIR = process.env.VERCEL ? path.join('/tmp', '.uhd_cache') : path.join(__dirname, '.cache', 'uhdmovies'); // Cache directory inside providers/uhdmovies

// Initialize Redis cache
const redisCache = new RedisCache('UHDMovies');

// --- Caching Helper Functions ---
const ensureCacheDir = async () => {
  if (!CACHE_ENABLED) return;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      console.error(`[UHDMovies Cache] Error creating cache directory: ${error.message}`);
    }
  }
};

const getFromCache = async (key) => {
  if (!CACHE_ENABLED) return null;

  // Try Redis cache first, then fallback to file system
  const cachedData = await redisCache.getFromCache(key, '', CACHE_DIR);
  if (cachedData) {
    return cachedData.data || cachedData; // Support both new format (data field) and legacy format
  }

  return null;
};

const saveToCache = async (key, data) => {
  if (!CACHE_ENABLED) return;

  const cacheData = {
    data: data
  };

  // Save to both Redis and file system
  await redisCache.saveToCache(key, cacheData, '', CACHE_DIR);
};

// Initialize cache directory on startup
ensureCacheDir();

// Configure axios with headers to mimic a browser
const axiosInstance = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0'
  },
  timeout: 30000
});

// Simple In-Memory Cache
const uhdMoviesCache = {
  search: {},
  movie: {},
  show: {}
};

// Function to search for movies
async function searchMovies(query) {
  try {
    const baseUrl = await getUHDMoviesDomain();
    console.log(`[UHDMovies] Searching for: ${query}`);
    const searchUrl = `${baseUrl}/search/${encodeURIComponent(query)}`;

    const response = await axiosInstance.get(searchUrl);
    const $ = cheerio.load(response.data);

    const searchResults = [];

    // New logic for grid-based search results
    $('article.gridlove-post').each((index, element) => {
      const linkElement = $(element).find('a[href*="/download-"]');
      if (linkElement.length > 0) {
        const link = linkElement.first().attr('href');
        // Prefer the 'title' attribute, fallback to h1 text
        const title = linkElement.first().attr('title') || $(element).find('h1.sanket').text().trim();

        if (link && title && !searchResults.some(item => item.link === link)) {
          searchResults.push({
            title,
            link: link.startsWith('http') ? link : `${baseUrl}${link}`
          });
        }
      }
    });

    // Fallback for original list-based search if new logic fails
    if (searchResults.length === 0) {
      console.log('[UHDMovies] Grid search logic found no results, trying original list-based logic...');
      $('a[href*="/download-"]').each((index, element) => {
        const link = $(element).attr('href');
        // Avoid duplicates by checking if link already exists in results
        if (link && !searchResults.some(item => item.link === link)) {
          const title = $(element).text().trim();
          if (title) {
            searchResults.push({
              title,
              link: link.startsWith('http') ? link : `${baseUrl}${link}`
            });
          }
        }
      });
    }

    console.log(`[UHDMovies] Found ${searchResults.length} results`);
    return searchResults;
  } catch (error) {
    console.error(`[UHDMovies] Error searching movies: ${error.message}`);
    return [];
  }
}

// Function to extract clean quality information from verbose text
function extractCleanQuality(fullQualityText) {
  if (!fullQualityText || fullQualityText === 'Unknown Quality') {
    return 'Unknown Quality';
  }

  const cleanedFullQualityText = fullQualityText.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '').trim();
  const text = cleanedFullQualityText.toLowerCase();
  let quality = [];

  // Extract resolution
  if (text.includes('2160p') || text.includes('4k')) {
    quality.push('4K');
  } else if (text.includes('1080p')) {
    quality.push('1080p');
  } else if (text.includes('720p')) {
    quality.push('720p');
  } else if (text.includes('480p')) {
    quality.push('480p');
  }

  // Extract special features
  if (text.includes('hdr')) {
    quality.push('HDR');
  }
  if (text.includes('dolby vision') || text.includes('dovi') || /\bdv\b/.test(text)) {
    quality.push('DV');
  }
  if (text.includes('imax')) {
    quality.push('IMAX');
  }
  if (text.includes('bluray') || text.includes('blu-ray')) {
    quality.push('BluRay');
  }

  // If we found any quality indicators, join them
  if (quality.length > 0) {
    return quality.join(' | ');
  }

  // Fallback: try to extract a shorter version of the original text
  // Look for patterns like "Movie Name (Year) Resolution ..."
  const patterns = [
    /(\d{3,4}p.*?(?:x264|x265|hevc).*?)[\[\(]/i,
    /(\d{3,4}p.*?)[\[\(]/i,
    /((?:720p|1080p|2160p|4k).*?)$/i
  ];

  for (const pattern of patterns) {
    const match = cleanedFullQualityText.match(pattern);
    if (match && match[1].trim().length < 100) {
      return match[1].trim().replace(/x265/ig, 'HEVC');
    }
  }

  // Final fallback: truncate if too long
  if (cleanedFullQualityText.length > 80) {
    return cleanedFullQualityText.substring(0, 77).replace(/x265/ig, 'HEVC') + '...';
  }

  return cleanedFullQualityText.replace(/x265/ig, 'HEVC');
}

// Function to extract download links for TV shows from a page
async function extractTvShowDownloadLinks(showPageUrl, season, episode) {
  try {
    console.log(`[UHDMovies] Extracting TV show links from: ${showPageUrl} for S${season}E${episode}`);
    const response = await axiosInstance.get(showPageUrl);
    const $ = cheerio.load(response.data);

    const showTitle = $('h1').first().text().trim();
    const downloadLinks = [];

    // --- NEW LOGIC TO SCOPE SEARCH TO THE CORRECT SEASON ---
    let inTargetSeason = false;
    let qualityText = '';

    $('.entry-content').find('*').each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      const seasonMatch = text.match(/^SEASON\s+(\d+)/i);

      // Check if we are entering a new season block
      if (seasonMatch) {
        const currentSeasonNum = parseInt(seasonMatch[1], 10);
        if (currentSeasonNum == season) {
          inTargetSeason = true;
          console.log(`[UHDMovies] Entering Season ${season} block.`);
        } else if (inTargetSeason) {
          // We've hit the next season, so we stop.
          console.log(`[UHDMovies] Exiting Season ${season} block, now in Season ${currentSeasonNum}.`);
          inTargetSeason = false;
          return false; // Exit .each() loop
        }
      }

      if (inTargetSeason) {
        // This element is within the correct season's block.

        // Is this a quality header? (e.g., a <pre> or a <p> with <strong>)
        // It often contains resolution, release group, etc.
        const isQualityHeader = $el.is('pre, p:has(strong), p:has(b), h3, h4');
        if (isQualityHeader) {
          const headerText = $el.text().trim();
          // Filter out irrelevant headers. We can be more aggressive here.
          if (headerText.length > 5 && !/plot|download|screenshot|trailer|join|powered by|season/i.test(headerText) && !($el.find('a').length > 0)) {
            qualityText = headerText; // Store the most recent quality header
          }
        }

        // Is this a paragraph with episode links?
        if ($el.is('p') && $el.find('a[href*="tech.unblockedgames.world"], a[href*="tech.examzculture.in"]').length > 0) {
          const linksParagraph = $el;
          const episodeRegex = new RegExp(`^Episode\\s+0*${episode}(?!\\d)`, 'i');
          const targetEpisodeLink = linksParagraph.find('a').filter((i, el) => {
            return episodeRegex.test($(el).text().trim());
          }).first();

          if (targetEpisodeLink.length > 0) {
            const link = targetEpisodeLink.attr('href');
            if (link && !downloadLinks.some(item => item.link === link)) {
              const sizeMatch = qualityText.match(/\[\s*([0-9.,]+\s*[KMGT]B)/i);
              const size = sizeMatch ? sizeMatch[1] : 'Unknown';

              const cleanQuality = extractCleanQuality(qualityText);
              const rawQuality = qualityText.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim();

              console.log(`[UHDMovies] Found match: Quality='${qualityText}', Link='${link}'`);
              downloadLinks.push({ quality: cleanQuality, size: size, link: link, rawQuality: rawQuality });
            }
          }
        }
      }
    });

    if (downloadLinks.length === 0) {
      console.log('[UHDMovies] Main extraction logic failed. Trying fallback method without season scoping.');
      $('.entry-content').find('a[href*="tech.unblockedgames.world"], a[href*="tech.examzculture.in"]').each((i, el) => {
        const linkElement = $(el);
        const episodeRegex = new RegExp(`^Episode\\s+0*${episode}(?!\\d)`, 'i');

        if (episodeRegex.test(linkElement.text().trim())) {
          const link = linkElement.attr('href');
          if (link && !downloadLinks.some(item => item.link === link)) {
            let qualityText = 'Unknown Quality';
            const parentP = linkElement.closest('p, div');
            const prevElement = parentP.prev();
            if (prevElement.length > 0) {
              const prevText = prevElement.text().trim();
              if (prevText && prevText.length > 5 && !prevText.toLowerCase().includes('download')) {
                qualityText = prevText;
              }
            }

            const sizeMatch = qualityText.match(/\[([0-9.,]+[KMGT]B[^\]]*)\]/i);
            const size = sizeMatch ? sizeMatch[1] : 'Unknown';
            const cleanQuality = extractCleanQuality(qualityText);
            const rawQuality = qualityText.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim();

            console.log(`[UHDMovies] Found match via fallback: Quality='${qualityText}', Link='${link}'`);
            downloadLinks.push({ quality: cleanQuality, size: size, link: link, rawQuality: rawQuality });
          }
        }
      });
    }

    if (downloadLinks.length > 0) {
      console.log(`[UHDMovies] Found ${downloadLinks.length} links for S${season}E${episode}.`);
    } else {
      console.log(`[UHDMovies] Could not find links for S${season}E${episode}. It's possible the logic needs adjustment or the links aren't on the page.`);
    }

    return { title: showTitle, links: downloadLinks };

  } catch (error) {
    console.error(`[UHDMovies] Error extracting TV show download links: ${error.message}`);
    return { title: 'Unknown', links: [] };
  }
}

// Function to extract download links from a movie page
async function extractDownloadLinks(moviePageUrl, targetYear = null) {
  try {
    console.log(`[UHDMovies] Extracting links from: ${moviePageUrl}`);
    const response = await axiosInstance.get(moviePageUrl);
    const $ = cheerio.load(response.data);

    const movieTitle = $('h1').first().text().trim();
    const downloadLinks = [];

    // Find all download links (the new SID links) and their associated quality information
    $('a[href*="tech.unblockedgames.world"], a[href*="tech.examzculture.in"]').each((index, element) => {
      const link = $(element).attr('href');

      if (link && !downloadLinks.some(item => item.link === link)) {
        let quality = 'Unknown Quality';
        let size = 'Unknown';

        // Method 1: Look for quality in the closest preceding paragraph or heading
        const prevElement = $(element).closest('p').prev();
        if (prevElement.length > 0) {
          const prevText = prevElement.text().trim();
          if (prevText && prevText.length > 20 && !prevText.includes('Download')) {
            quality = prevText;
          }
        }

        // Method 2: Look for quality in parent's siblings
        if (quality === 'Unknown Quality') {
          const parentSiblings = $(element).parent().prevAll().first().text().trim();
          if (parentSiblings && parentSiblings.length > 20) {
            quality = parentSiblings;
          }
        }

        // Method 3: Look for bold/strong text above the link
        if (quality === 'Unknown Quality') {
          const strongText = $(element).closest('p').prevAll().find('strong, b').last().text().trim();
          if (strongText && strongText.length > 20) {
            quality = strongText;
          }
        }

        // Method 4: Look for the entire paragraph containing quality info
        if (quality === 'Unknown Quality') {
          let currentElement = $(element).parent();
          for (let i = 0; i < 5; i++) {
            currentElement = currentElement.prev();
            if (currentElement.length === 0) break;

            const text = currentElement.text().trim();
            if (text && text.length > 30 &&
              (text.includes('1080p') || text.includes('720p') || text.includes('2160p') ||
                text.includes('4K') || text.includes('HEVC') || text.includes('x264') || text.includes('x265'))) {
              quality = text;
              break;
            }
          }
        }

        // Year-based filtering for collections
        if (targetYear && quality !== 'Unknown Quality') {
          // Check for years in quality text
          const yearMatches = quality.match(/\((\d{4})\)/g);
          let hasMatchingYear = false;

          if (yearMatches && yearMatches.length > 0) {
            for (const yearMatch of yearMatches) {
              const year = parseInt(yearMatch.replace(/[()]/g, ''));
              if (year === targetYear) {
                hasMatchingYear = true;
                break;
              }
            }
            if (!hasMatchingYear) {
              console.log(`[UHDMovies] Skipping link due to year mismatch. Target: ${targetYear}, Found: ${yearMatches.join(', ')} in "${quality}"`);
              return; // Skip this link
            }
          } else {
            // If no year in quality text, check filename and other indicators
            const linkText = $(element).text().trim();
            const parentText = $(element).parent().text().trim();
            const combinedText = `${quality} ${linkText} ${parentText}`;

            // Look for years in combined text
            const allYearMatches = combinedText.match(/\((\d{4})\)/g) || combinedText.match(/(\d{4})/g);
            if (allYearMatches) {
              let foundTargetYear = false;
              for (const yearMatch of allYearMatches) {
                const year = parseInt(yearMatch.replace(/[()]/g, ''));
                if (year >= 1900 && year <= 2030) { // Valid movie year range
                  if (year === targetYear) {
                    foundTargetYear = true;
                    break;
                  }
                }
              }
              if (!foundTargetYear && allYearMatches.length > 0) {
                console.log(`[UHDMovies] Skipping link due to no matching year found. Target: ${targetYear}, Found years: ${allYearMatches.join(', ')} in combined text`);
                return; // Skip this link
              }
            }

            // Additional check: if quality contains movie names that don't match target year
            const lowerQuality = quality.toLowerCase();
            if (targetYear === 2015) {
              if (lowerQuality.includes('wasp') || lowerQuality.includes('quantumania')) {
                console.log(`[UHDMovies] Skipping link for 2015 target as it contains 'wasp' or 'quantumania': "${quality}"`);
                return; // Skip this link
              }
            }
          }
        }

        // Extract size from quality text if present
        const sizeMatch = quality.match(/\[([0-9.,]+\s*[KMGT]B[^\]]*)\]/);
        if (sizeMatch) {
          size = sizeMatch[1];
        }

        // Clean up the quality information
        const cleanQuality = extractCleanQuality(quality);

        downloadLinks.push({
          quality: cleanQuality,
          size: size,
          link: link,
          rawQuality: quality.replace(/(\r\n|\n|\r)/gm, " ").replace(/\s+/g, ' ').trim()
        });
      }
    });

    return {
      title: movieTitle,
      links: downloadLinks
    };

  } catch (error) {
    console.error(`[UHDMovies] Error extracting download links: ${error.message}`);
    return { title: 'Unknown', links: [] };
  }
}

function extractCodecs(rawQuality) {
  const codecs = [];
  const text = rawQuality.toLowerCase();

  if (text.includes('hevc') || text.includes('x265')) {
    codecs.push('H.265');
  } else if (text.includes('x264')) {
    codecs.push('H.264');
  }

  if (text.includes('10bit') || text.includes('10-bit')) {
    codecs.push('10-bit');
  }

  if (text.includes('atmos')) {
    codecs.push('Atmos');
  } else if (text.includes('dts-hd')) {
    codecs.push('DTS-HD');
  } else if (text.includes('dts')) {
    codecs.push('DTS');
  } else if (text.includes('ddp5.1') || text.includes('dd+ 5.1') || text.includes('eac3')) {
    codecs.push('EAC3');
  } else if (text.includes('ac3')) {
    codecs.push('AC3');
  }

  if (text.includes('dovi') || text.includes('dolby vision') || /\bdv\b/.test(text)) {
    codecs.push('DV');
  } else if (text.includes('hdr')) {
    codecs.push('HDR');
  }

  return codecs;
}

// Function to try Instant Download method
async function tryInstantDownload($) {
  const instantDownloadLink = $('a:contains("Instant Download")').attr('href');
  if (!instantDownloadLink) {
    return null;
  }

  console.log('[UHDMovies] Found "Instant Download" link, attempting to extract final URL...');

  try {
    const urlParams = new URLSearchParams(new URL(instantDownloadLink).search);
    const keys = urlParams.get('url');

    if (keys) {
      const apiUrl = `${new URL(instantDownloadLink).origin}/api`;
      const formData = new FormData();
      formData.append('keys', keys);

      const apiResponse = await axiosInstance.post(apiUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'x-token': new URL(instantDownloadLink).hostname
        }
      });

      if (apiResponse.data && apiResponse.data.url) {
        let finalUrl = apiResponse.data.url;
        // Fix spaces in workers.dev URLs by encoding them properly
        if (finalUrl.includes('workers.dev')) {
          const urlParts = finalUrl.split('/');
          const filename = urlParts[urlParts.length - 1];
          const encodedFilename = filename.replace(/ /g, '%20');
          urlParts[urlParts.length - 1] = encodedFilename;
          finalUrl = urlParts.join('/');
        }
        console.log('[UHDMovies] Extracted final link from API:', finalUrl);
        return finalUrl;
      }
    }

    console.log('[UHDMovies] Could not find a valid final download link from Instant Download.');
    return null;
  } catch (error) {
    console.log(`[UHDMovies] Error processing "Instant Download": ${error.message}`);
    return null;
  }
}

// Function to try Resume Cloud method
async function tryResumeCloud($) {
  // Look for both "Resume Cloud" and "Cloud Resume Download" buttons
  const resumeCloudButton = $('a:contains("Resume Cloud"), a:contains("Cloud Resume Download")');

  if (resumeCloudButton.length === 0) {
    return null;
  }

  const resumeLink = resumeCloudButton.attr('href');
  if (!resumeLink) {
    return null;
  }

  // Check if it's already a direct download link (workers.dev)
  if (resumeLink.includes('workers.dev') || resumeLink.startsWith('http')) {
    let directLink = resumeLink;
    // Fix spaces in workers.dev URLs by encoding them properly
    if (directLink.includes('workers.dev')) {
      const urlParts = directLink.split('/');
      const filename = urlParts[urlParts.length - 1];
      const encodedFilename = filename.replace(/ /g, '%20');
      urlParts[urlParts.length - 1] = encodedFilename;
      directLink = urlParts.join('/');
    }
    console.log(`[UHDMovies] Found direct "Cloud Resume Download" link: ${directLink}`);
    return directLink;
  }

  // Otherwise, follow the link to get the final download
  try {
    const resumeUrl = new URL(resumeLink, 'https://driveleech.net').href;
    console.log(`[UHDMovies] Found 'Resume Cloud' page link. Following to: ${resumeUrl}`);

    // "Click" the link by making another request
    const finalPageResponse = await axiosInstance.get(resumeUrl, { maxRedirects: 10 });
    const $$ = cheerio.load(finalPageResponse.data);

    // Look for direct download links
    let finalDownloadLink = $$('a.btn-success[href*="workers.dev"], a[href*="driveleech.net/d/"]').attr('href');

    if (finalDownloadLink) {
      // Fix spaces in workers.dev URLs by encoding them properly
      if (finalDownloadLink.includes('workers.dev')) {
        // Split the URL at the last slash to separate the base URL from the filename
        const urlParts = finalDownloadLink.split('/');
        const filename = urlParts[urlParts.length - 1];
        // Encode spaces in the filename part only
        const encodedFilename = filename.replace(/ /g, '%20');
        urlParts[urlParts.length - 1] = encodedFilename;
        finalDownloadLink = urlParts.join('/');
      }
      console.log(`[UHDMovies] Extracted final Resume Cloud link: ${finalDownloadLink}`);
      return finalDownloadLink;
    } else {
      console.log('[UHDMovies] Could not find the final download link on the "Resume Cloud" page.');
      return null;
    }
  } catch (error) {
    console.log(`[UHDMovies] Error processing "Resume Cloud": ${error.message}`);
    return null;
  }
}

// Environment variable to control URL validation
const URL_VALIDATION_ENABLED = process.env.DISABLE_URL_VALIDATION !== 'true';
console.log(`[UHDMovies] URL validation is ${URL_VALIDATION_ENABLED ? 'enabled' : 'disabled'}.`);

// Validate if a video URL is working (not 404 or broken)
async function validateVideoUrl(url, timeout = 10000) {
  // Skip validation if disabled via environment variable
  if (!URL_VALIDATION_ENABLED) {
    console.log(`[UHDMovies] URL validation disabled, skipping validation for: ${url.substring(0, 100)}...`);
    return true;
  }

  try {
    console.log(`[UHDMovies] Validating URL: ${url.substring(0, 100)}...`);
    const response = await axiosInstance.head(url, {
      timeout,
      headers: {
        'Range': 'bytes=0-1' // Just request first byte to test
      }
    });

    // Check if status is OK (200-299) or partial content (206)
    if (response.status >= 200 && response.status < 400) {
      console.log(`[UHDMovies] ✓ URL validation successful (${response.status})`);
      return true;
    } else {
      console.log(`[UHDMovies] ✗ URL validation failed with status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`[UHDMovies] ✗ URL validation failed: ${error.message}`);
    return false;
  }
}

// Function to follow redirect links and get the final download URL with size info
async function getFinalLink(redirectUrl) {
  try {
    console.log(`[UHDMovies] Following redirect: ${redirectUrl}`);

    // Request the driveleech page
    let response = await axiosInstance.get(redirectUrl, { maxRedirects: 10 });
    let $ = cheerio.load(response.data);

    // --- Check for JavaScript redirect ---
    const scriptContent = $('script').html();
    const redirectMatch = scriptContent && scriptContent.match(/window\.location\.replace\("([^"]+)"\)/);

    if (redirectMatch && redirectMatch[1]) {
      const newPath = redirectMatch[1];
      const newUrl = new URL(newPath, 'https://driveleech.net/').href;
      console.log(`[UHDMovies] Found JavaScript redirect. Following to: ${newUrl}`);
      response = await axiosInstance.get(newUrl, { maxRedirects: 10 });
      $ = cheerio.load(response.data);
    }

    // Extract size and filename information from the page
    let sizeInfo = 'Unknown';
    let fileName = null;

    const sizeElement = $('li.list-group-item:contains("Size :")').text();
    if (sizeElement) {
      const sizeMatch = sizeElement.match(/Size\s*:\s*([0-9.,]+\s*[KMGT]B)/i);
      if (sizeMatch) sizeInfo = sizeMatch[1];
    }

    const nameElement = $('li.list-group-item:contains("Name :")').text();
    if (nameElement) {
      fileName = nameElement.replace('Name :', '').trim();
    }

    // Try each download method in order until we find a working one
    const downloadMethods = [
      { name: 'Resume Cloud', func: tryResumeCloud },
      { name: 'Instant Download', func: tryInstantDownload }
    ];

    for (const method of downloadMethods) {
      try {
        console.log(`[UHDMovies] Trying ${method.name}...`);
        const finalUrl = await method.func($);

        if (finalUrl) {
          // Validate the URL before using it
          const isValid = await validateVideoUrl(finalUrl);
          if (isValid) {
            console.log(`[UHDMovies] ✓ Successfully resolved using ${method.name}`);
            return { url: finalUrl, size: sizeInfo, fileName: fileName };
          } else {
            console.log(`[UHDMovies] ✗ ${method.name} returned invalid/broken URL, trying next method...`);
          }
        } else {
          console.log(`[UHDMovies] ✗ ${method.name} failed to resolve URL, trying next method...`);
        }
      } catch (error) {
        console.log(`[UHDMovies] ✗ ${method.name} threw error: ${error.message}, trying next method...`);
      }
    }

    console.log('[UHDMovies] ✗ All download methods failed.');
    return null;

  } catch (error) {
    console.error(`[UHDMovies] Error in getFinalLink: ${error.message}`);
    return null;
  }
}

// Compare media to find matching result
function compareMedia(mediaInfo, searchResult) {
  const normalizeString = (str) => String(str || '').toLowerCase().replace(/[^a-zA-Z0-9]/g, '');

  const titleWithAnd = mediaInfo.title.replace(/\s*&\s*/g, ' and ');
  const normalizedMediaTitle = normalizeString(titleWithAnd);
  const normalizedResultTitle = normalizeString(searchResult.title);

  console.log(`[UHDMovies] Comparing: "${mediaInfo.title}" (${mediaInfo.year}) vs "${searchResult.title}"`);
  console.log(`[UHDMovies] Normalized: "${normalizedMediaTitle}" vs "${normalizedResultTitle}"`);

  // Check if titles match or result title contains media title
  let titleMatches = normalizedResultTitle.includes(normalizedMediaTitle);

  // If direct match fails, try checking for franchise/collection matches
  if (!titleMatches) {
    const mainTitle = normalizedMediaTitle.split('and')[0];
    const isCollection = normalizedResultTitle.includes('duology') ||
      normalizedResultTitle.includes('trilogy') ||
      normalizedResultTitle.includes('quadrilogy') ||
      normalizedResultTitle.includes('collection') ||
      normalizedResultTitle.includes('saga');

    if (isCollection && normalizedResultTitle.includes(mainTitle)) {
      console.log(`[UHDMovies] Found collection match: "${mainTitle}" in collection "${searchResult.title}"`);
      titleMatches = true;
    }
  }

  if (!titleMatches) {
    console.log(`[UHDMovies] Title mismatch: "${normalizedResultTitle}" does not contain "${normalizedMediaTitle}"`);
    return false;
  }

  // NEW: Negative keyword check for spinoffs
  const negativeKeywords = ['challenge', 'conversation', 'story', 'in conversation'];
  const originalTitleLower = mediaInfo.title.toLowerCase();
  for (const keyword of negativeKeywords) {
    if (normalizedResultTitle.includes(keyword.replace(/\s/g, '')) && !originalTitleLower.includes(keyword)) {
      console.log(`[UHDMovies] Rejecting spinoff due to keyword: "${keyword}"`);
      return false; // It's a spinoff, reject it.
    }
  }

  // Check year if both are available
  if (mediaInfo.year && searchResult.title) {
    const yearRegex = /\b(19[89]\d|20\d{2})\b/g; // Look for years 1980-2099
    const yearMatchesInResult = searchResult.title.match(yearRegex);
    const yearRangeMatch = searchResult.title.match(/\((\d{4})\s*-\s*(\d{4})\)/);

    let hasMatchingYear = false;

    if (yearMatchesInResult) {
      console.log(`[UHDMovies] Found years in result: ${yearMatchesInResult.join(', ')}`);
      if (yearMatchesInResult.some(yearStr => Math.abs(parseInt(yearStr) - mediaInfo.year) <= 1)) {
        hasMatchingYear = true;
      }
    }

    if (!hasMatchingYear && yearRangeMatch) {
      console.log(`[UHDMovies] Found year range in result: ${yearRangeMatch[0]}`);
      const startYear = parseInt(yearRangeMatch[1]);
      const endYear = parseInt(yearRangeMatch[2]);
      if (mediaInfo.year >= startYear - 1 && mediaInfo.year <= endYear + 1) {
        hasMatchingYear = true;
      }
    }

    // If there are any years found in the title, one of them MUST match.
    if ((yearMatchesInResult || yearRangeMatch) && !hasMatchingYear) {
      console.log(`[UHDMovies] Year mismatch. Target: ${mediaInfo.year}, but no matching year found in result.`);
      return false;
    }
  }

  console.log(`[UHDMovies] Match successful!`);
  return true;
}

// Function to score search results based on quality keywords
function scoreResult(title) {
  let score = 0;
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes('remux')) score += 10;
  if (lowerTitle.includes('bluray') || lowerTitle.includes('blu-ray')) score += 8;
  if (lowerTitle.includes('imax')) score += 6;
  if (lowerTitle.includes('4k') || lowerTitle.includes('2160p')) score += 5;
  if (lowerTitle.includes('dovi') || lowerTitle.includes('dolby vision') || /\\bdv\\b/.test(lowerTitle)) score += 4;
  if (lowerTitle.includes('hdr')) score += 3;
  if (lowerTitle.includes('1080p')) score += 2;
  if (lowerTitle.includes('hevc') || lowerTitle.includes('x265')) score += 1;

  return score;
}

// Function to parse size string into MB
function parseSize(sizeString) {
  if (!sizeString || typeof sizeString !== 'string') {
    return 0;
  }

  const upperCaseSizeString = sizeString.toUpperCase();

  // Regex to find a number (integer or float) followed by GB, MB, or KB
  const match = upperCaseSizeString.match(/([0-9.,]+)\s*(GB|MB|KB)/);

  if (!match) {
    return 0;
  }

  const sizeValue = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(sizeValue)) {
    return 0;
  }

  const unit = match[2];

  if (unit === 'GB') {
    return sizeValue * 1024;
  } else if (unit === 'MB') {
    return sizeValue;
  } else if (unit === 'KB') {
    return sizeValue / 1024;
  }

  return 0;
}

// New function to resolve the tech.unblockedgames.world links
async function resolveSidToDriveleech(sidUrl) {
  console.log(`[UHDMovies] Resolving SID link: ${sidUrl}`);
  const { origin } = new URL(sidUrl);
  const jar = new CookieJar();

  // Get the wrapper function from dynamic import
  const { wrapper } = await getAxiosCookieJarSupport();
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

// Main function to get streams for TMDB content
async function getUHDMoviesStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  console.log(`[UHDMovies] Attempting to fetch streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${mediaType === 'tv' ? `, S:${season}E:${episode}` : ''}`);

  const cacheKey = `uhd_final_v12_${tmdbId}_${mediaType}${season ? `_s${season}e${episode}` : ''}`;

  try {
    // 1. Check cache first
    let cachedLinks = await getFromCache(cacheKey);
    if (cachedLinks && cachedLinks.length > 0) {
      console.log(`[UHDMovies] Cache HIT for ${cacheKey}. Using ${cachedLinks.length} cached Driveleech links.`);
    } else {
      if (cachedLinks && cachedLinks.length === 0) {
        console.log(`[UHDMovies] Cache contains empty data for ${cacheKey}. Refetching from source.`);
      } else {
        console.log(`[UHDMovies] Cache MISS for ${cacheKey}. Fetching from source.`);
      }
      console.log(`[UHDMovies] Cache MISS for ${cacheKey}. Fetching from source.`);
      // 2. If cache miss, get TMDB info to perform search
      const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY_UHDMOVIES}`;
      const tmdbResponse = await axios.get(tmdbUrl);
      const tmdbData = tmdbResponse.data;
      const mediaInfo = {
        title: mediaType === 'tv' ? tmdbData.name : tmdbData.title,
        year: parseInt(((mediaType === 'tv' ? tmdbData.first_air_date : tmdbData.release_date) || '').split('-')[0], 10)
      };

      if (!mediaInfo.title) throw new Error('Could not extract title from TMDB response.');
      console.log(`[UHDMovies] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || 'N/A'})`);

      // 3. Search for the media on UHDMovies
      let searchTitle = mediaInfo.title.replace(/:/g, '').replace(/\s*&\s*/g, ' and ');
      let searchResults = await searchMovies(searchTitle);

      // If no results or only wrong year results, try fallback search with just main title
      if (searchResults.length === 0 || !searchResults.some(result => compareMedia(mediaInfo, result))) {
        console.log(`[UHDMovies] Primary search failed or no matches. Trying fallback search...`);

        // Extract main title (remove subtitles after colon, "and the", etc.)
        let fallbackTitle = mediaInfo.title.split(':')[0].trim();
        if (fallbackTitle.includes('and the')) {
          fallbackTitle = fallbackTitle.split('and the')[0].trim();
        }
        if (fallbackTitle !== searchTitle) {
          console.log(`[UHDMovies] Fallback search with: "${fallbackTitle}"`);
          const fallbackResults = await searchMovies(fallbackTitle);
          if (fallbackResults.length > 0) {
            searchResults = fallbackResults;
          }
        }
      }

      if (searchResults.length === 0) {
        console.log(`[UHDMovies] No search results found for "${mediaInfo.title}".`);
        // Don't cache empty results to allow retrying later
        return [];
      }

      // 4. Find the best matching result
      const matchingResults = searchResults.filter(result => compareMedia(mediaInfo, result));

      if (matchingResults.length === 0) {
        console.log(`[UHDMovies] No matching content found for "${mediaInfo.title}" (${mediaInfo.year}).`);
        // Don't cache empty results to allow retrying later
        return [];
      }

      let matchingResult;

      if (matchingResults.length === 1) {
        matchingResult = matchingResults[0];
      } else {
        console.log(`[UHDMovies] Found ${matchingResults.length} matching results. Scoring to find the best...`);

        const scoredResults = matchingResults.map(result => {
          const score = scoreResult(result.title);
          console.log(`  - Score ${score}: ${result.title}`);
          return { ...result, score };
        }).sort((a, b) => b.score - a.score);

        matchingResult = scoredResults[0];
        console.log(`[UHDMovies] Best match selected with score ${matchingResult.score}: "${matchingResult.title}"`);
      }

      console.log(`[UHDMovies] Found matching content: "${matchingResult.title}"`);

      // 5. Extract SID links from the movie/show page
      const downloadInfo = await (mediaType === 'tv' ? extractTvShowDownloadLinks(matchingResult.link, season, episode) : extractDownloadLinks(matchingResult.link, mediaInfo.year));
      if (downloadInfo.links.length === 0) {
        console.log('[UHDMovies] No download links found on page.');
        // Don't cache empty results to allow retrying later
        return [];
      }

      // 6. Resolve all SID links to driveleech redirect URLs (intermediate step)
      console.log(`[UHDMovies] Resolving ${downloadInfo.links.length} SID link(s) to driveleech redirect URLs...`);
      const resolutionPromises = downloadInfo.links.map(async (linkInfo) => {
        try {
          let driveleechUrl = null;

          if (linkInfo.link && (linkInfo.link.includes('tech.unblockedgames.world') || linkInfo.link.includes('tech.creativeexpressionsblog.com') || linkInfo.link.includes('tech.examzculture.in'))) {
            driveleechUrl = await resolveSidToDriveleech(linkInfo.link);
          } else if (linkInfo.link && (linkInfo.link.includes('driveseed.org') || linkInfo.link.includes('driveleech.net'))) {
            // If it's already a direct driveseed/driveleech link, use it
            driveleechUrl = linkInfo.link;
          }

          if (!driveleechUrl) return null;

          console.log(`[UHDMovies] Caching driveleech redirect URL for ${linkInfo.quality}: ${driveleechUrl}`);
          return { ...linkInfo, driveleechRedirectUrl: driveleechUrl };
        } catch (error) {
          console.error(`[UHDMovies] Error resolving ${linkInfo.quality}: ${error.message}`);
          return null;
        }
      });

      cachedLinks = (await Promise.all(resolutionPromises)).filter(Boolean);

      // 7. Save the successfully resolved driveleech redirect URLs to the cache
      if (cachedLinks.length > 0) {
        console.log(`[UHDMovies] Caching ${cachedLinks.length} resolved driveleech redirect URLs for key: ${cacheKey}`);
        await saveToCache(cacheKey, cachedLinks);
      } else {
        console.log(`[UHDMovies] No driveleech redirect URLs could be resolved. Not caching to allow retrying later.`);
        return [];
      }
    }

    if (!cachedLinks || cachedLinks.length === 0) {
      console.log('[UHDMovies] No final file page URLs found after scraping/cache check.');
      return [];
    }

    // 8. Process all cached driveleech redirect URLs to get streaming links
    console.log(`[UHDMovies] Processing ${cachedLinks.length} cached driveleech redirect URL(s) to get streaming links.`);
    const streamPromises = cachedLinks.map(async (linkInfo) => {
      try {
        // First, resolve the driveleech redirect URL to get the final file page URL
        const response = await axiosInstance.get(linkInfo.driveleechRedirectUrl, { maxRedirects: 10 });
        let $ = cheerio.load(response.data);

        // Check for JavaScript redirect (window.location.replace)
        const scriptContent = $('script').html();
        const redirectMatch = scriptContent && scriptContent.match(/window\.location\.replace\("([^"]+)"\)/);

        let finalFilePageUrl = linkInfo.driveleechRedirectUrl;
        if (redirectMatch && redirectMatch[1]) {
          finalFilePageUrl = new URL(redirectMatch[1], 'https://driveleech.net/').href;
          console.log(`[UHDMovies] Resolved redirect to final file page: ${finalFilePageUrl}`);

          // Load the final file page
          const finalResponse = await axiosInstance.get(finalFilePageUrl, { maxRedirects: 10 });
          $ = cheerio.load(finalResponse.data);
        }

        // Extract file size and name information
        let sizeInfo = 'Unknown';
        let fileName = null;

        const sizeElement = $('li.list-group-item:contains("Size :")').text();
        if (sizeElement) {
          const sizeMatch = sizeElement.match(/Size\s*:\s*([0-9.,]+\s*[KMGT]B)/);
          if (sizeMatch) {
            sizeInfo = sizeMatch[1];
          }
        }

        const nameElement = $('li.list-group-item:contains("Name :")');
        if (nameElement.length > 0) {
          fileName = nameElement.text().replace('Name :', '').trim();
        } else {
          const h5Title = $('div.card-header h5').clone().children().remove().end().text().trim();
          if (h5Title) {
            fileName = h5Title.replace(/\[.*\]/, '').trim();
          }
        }

        // Try download methods to get final streaming URL
        const downloadMethods = [
          { name: 'Resume Cloud', func: tryResumeCloud },
          { name: 'Instant Download', func: tryInstantDownload }
        ];

        for (const method of downloadMethods) {
          try {
            const finalUrl = await method.func($);

            if (finalUrl) {
              const isValid = await validateVideoUrl(finalUrl);
              if (isValid) {
                const rawQuality = linkInfo.rawQuality || '';
                const codecs = extractCodecs(rawQuality);
                const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, "").replace(/[._]/g, ' ') : (linkInfo.quality || 'Unknown');

                return {
                  name: `UHDMovies`,
                  title: `${cleanFileName}\n${sizeInfo}`,
                  url: finalUrl,
                  quality: linkInfo.quality,
                  size: sizeInfo,
                  fileName: fileName,
                  fullTitle: rawQuality,
                  codecs: codecs,
                  behaviorHints: { bingeGroup: `uhdmovies-${linkInfo.quality}` }
                };
              }
            }
          } catch (error) {
            console.log(`[UHDMovies] ${method.name} failed: ${error.message}`);
          }
        }

        return null;
      } catch (error) {
        console.error(`[UHDMovies] Error processing cached driveleech redirect ${linkInfo.driveleechRedirectUrl}: ${error.message}`);
        return null;
      }
    });

    const streams = (await Promise.all(streamPromises)).filter(Boolean);
    console.log(`[UHDMovies] Successfully processed ${streams.length} final stream links.`);

    // Sort final streams by size
    streams.sort((a, b) => {
      const sizeA = parseSize(a.size);
      const sizeB = parseSize(b.size);
      return sizeB - sizeA;
    });

    return streams;
  } catch (error) {
    console.error(`[UHDMovies] A critical error occurred in getUHDMoviesStreams for ${tmdbId}: ${error.message}`);
    if (error.stack) console.error(error.stack);
    return [];
  }
}

module.exports = { getUHDMoviesStreams };