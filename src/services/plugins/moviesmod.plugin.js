/**
 * MoviesMod Provider Plugin
 *
 * This plugin is a conversion of the original moviesmod.js provider.
 * It's designed to run in a sandboxed environment within the Nuvio app,
 * with specific helper functions and objects injected by the PluginManager.
 *
 * Required Injected Context:
 * - `logger`: A logging utility (e.g., console).
 * - `cache`: An object with `get(key)` and `set(key, value, ttl_in_seconds)` methods for caching data.
 * - `fetch`: A standard `fetch` implementation.
 * - `fetchWithCookies`: A `fetch` wrapper that maintains a cookie jar for a session.
 * - `parseHTML`: A function that takes an HTML string and returns a Cheerio-like object for DOM parsing.
 * - `URL`: The standard URL constructor.
 * - `URLSearchParams`: The standard URLSearchParams constructor.
 * - `FormData`: The standard FormData constructor.
 */
(function() {
    'use strict';

    // --- Embedded Dependencies ---

    // string-similarity: To find the best matching search result.
    function compareTwoStrings(first, second) {
        first = first.replace(/\s+/g, '');
        second = second.replace(/\s+/g, '');
        if (first === second) return 1;
        if (first.length < 2 || second.length < 2) return 0;
        let firstBigrams = new Map();
        for (let i = 0; i < first.length - 1; i++) {
            const bigram = first.substring(i, i + 2);
            const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) + 1 : 1;
            firstBigrams.set(bigram, count);
        }
        let intersectionSize = 0;
        for (let i = 0; i < second.length - 1; i++) {
            const bigram = second.substring(i, i + 2);
            const count = firstBigrams.has(bigram) ? firstBigrams.get(bigram) : 0;
            if (count > 0) {
                firstBigrams.set(bigram, count - 1);
                intersectionSize++;
            }
        }
        return (2.0 * intersectionSize) / (first.length + second.length - 2);
    }

    function findBestMatch(mainString, targetStrings) {
        const ratings = targetStrings.map(target => ({
            target,
            rating: compareTwoStrings(mainString, target)
        }));
        let bestMatchIndex = 0;
        for (let i = 1; i < ratings.length; i++) {
            if (ratings[i].rating > ratings[bestMatchIndex].rating) {
                bestMatchIndex = i;
            }
        }
        return { ratings, bestMatch: ratings[bestMatchIndex], bestMatchIndex };
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }


    // --- Plugin Definition ---

    const plugin = {
        name: 'MoviesMod',
        version: '1.1.0',
        author: 'Nuvio',
        description: 'Scraper for MoviesMod. Provides movie and TV show streams.',
        type: 'scraper',
        getStreams: mainGetStreams,
    };


    // --- Domain and Caching ---

    let moviesModDomain = 'https://moviesmod.chat'; // Fallback domain
    let domainCacheTimestamp = 0;
    const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

    async function getMoviesModDomain(injected) {
        const now = Date.now();
        if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
            return moviesModDomain;
        }
        try {
            injected.logger.log('[MoviesMod] Fetching latest domain...');
            const response = await injected.fetch('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json', { timeout: 10000 });
            const data = await response.json();
            if (data && data.moviesmod) {
                moviesModDomain = data.moviesmod;
                domainCacheTimestamp = now;
                injected.logger.log(`[MoviesMod] Updated domain to: ${moviesModDomain}`);
            } else {
                injected.logger.warn('[MoviesMod] Domain JSON fetched, but "moviesmod" key was not found. Using fallback.');
            }
        } catch (error) {
            injected.logger.error(`[MoviesMod] Failed to fetch latest domain, using fallback. Error: ${error.message}`);
        }
        return moviesModDomain;
    }


    // --- Helper Functions ---

    function extractQuality(text) {
        if (!text) return 'Unknown';
        const qualityMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
        if (qualityMatch) return qualityMatch[1];
        const cleanMatch = text.match(/(480p|720p|1080p|2160p|4k)[^)]*\)/i);
        if (cleanMatch) return cleanMatch[0];
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


    // --- Core Scraping Logic ---

    async function searchMoviesMod(query, injected) {
        try {
            const baseUrl = await getMoviesModDomain(injected);
            const searchUrl = `${baseUrl}/?s=${encodeURIComponent(query)}`;
            const response = await injected.fetch(searchUrl);
            const data = await response.text();
            const $ = injected.parseHTML(data);
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
            injected.logger.error(`[MoviesMod] Error searching: ${error.message}`);
            return [];
        }
    }

    async function extractDownloadLinks(moviePageUrl, injected) {
        try {
            const response = await injected.fetch(moviePageUrl);
            const data = await response.text();
            const $ = injected.parseHTML(data);
            const links = [];
            const contentBox = $('.thecontent');
            const headers = contentBox.find('h3:contains("Season"), h4');

            headers.each((i, el) => {
                const header = $(el);
                const headerText = header.text().trim();
                const blockContent = header.nextUntil('h3, h4');

                if (header.is('h3') && headerText.toLowerCase().includes('season')) {
                    const linkElements = blockContent.find('a.maxbutton-episode-links, a.maxbutton-batch-zip');
                    linkElements.each((j, linkEl) => {
                        const buttonText = $(linkEl).text().trim();
                        const linkUrl = $(linkEl).attr('href');
                        if (linkUrl && !buttonText.toLowerCase().includes('batch')) {
                            links.push({ quality: `${headerText} - ${buttonText}`, url: linkUrl });
                        }
                    });
                } else if (header.is('h4')) {
                    const linkElement = blockContent.find('a[href*="modrefer.in"]').first();
                    if (linkElement.length > 0) {
                        const link = linkElement.attr('href');
                        links.push({ quality: extractQuality(headerText), url: link });
                    }
                }
            });
            return links;
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error extracting download links: ${error.message}`);
            return [];
        }
    }

    async function resolveIntermediateLink(initialUrl, refererUrl, quality, injected) {
        try {
            const urlObject = new injected.URL(initialUrl);

            if (urlObject.hostname.includes('dramadrip.com')) {
                const response = await injected.fetchWithCookies(initialUrl, { headers: { 'Referer': refererUrl } });
                const dramaData = await response.text();
                const $$ = injected.parseHTML(dramaData);
                let episodePageLink = null;
                const seasonMatch = quality.match(/Season \d+/i);
                const specificQualityMatch = quality.match(/(480p|720p|1080p|2160p|4k)[ \w\d-]*/i);

                if (seasonMatch && specificQualityMatch) {
                    const seasonIdentifier = seasonMatch[0].toLowerCase();
                    const qualityParts = specificQualityMatch[0].toLowerCase().replace(/msubs.*/i, '').replace(/esubs.*/i, '').replace(/\{.*/, '').trim().split(/\s+/);

                    $$('a[href*="episodes.modpro.blog"], a[href*="cinematickit.org"]').each((i, el) => {
                        const link = $$(el);
                        const linkText = link.text().trim().toLowerCase();
                        const seasonHeader = link.closest('.wp-block-buttons').prevAll('h2.wp-block-heading').first().text().trim().toLowerCase();
                        const seasonIsMatch = seasonHeader.includes(seasonIdentifier);
                        const allPartsMatch = qualityParts.every(part => linkText.includes(part));

                        if (seasonIsMatch && allPartsMatch) {
                            episodePageLink = link.attr('href');
                            return false;
                        }
                    });
                }
                if (!episodePageLink) return [];
                return await resolveIntermediateLink(episodePageLink, initialUrl, quality, injected);

            } else if (urlObject.hostname.includes('cinematickit.org')) {
                const response = await injected.fetchWithCookies(initialUrl, { headers: { 'Referer': refererUrl } });
                const data = await response.text();
                const $ = injected.parseHTML(data);
                const finalLinks = [];
                $('a[href*="driveseed.org"]').each((i, el) => {
                    const link = $(el).attr('href');
                    const text = $(el).text().trim();
                    if (link && text && !text.toLowerCase().includes('batch')) {
                        finalLinks.push({ server: text.replace(/\s+/g, ' '), url: link });
                    }
                });
                if (finalLinks.length === 0) {
                    $('a[href*="modrefer.in"], a[href*="dramadrip.com"]').each((i, el) => {
                        const link = $(el).attr('href');
                        const text = $(el).text().trim();
                        if (link && text) {
                            finalLinks.push({ server: text.replace(/\s+/g, ' '), url: link });
                        }
                    });
                }
                return finalLinks;

            } else if (urlObject.hostname.includes('episodes.modpro.blog')) {
                const response = await injected.fetchWithCookies(initialUrl, { headers: { 'Referer': refererUrl } });
                const data = await response.text();
                const $ = injected.parseHTML(data);
                const finalLinks = [];
                $('.entry-content a[href*="driveseed.org"], .entry-content a[href*="tech.unblockedgames.world"], .entry-content a[href*="tech.creativeexpressionsblog.com"]').each((i, el) => {
                    const link = $(el).attr('href');
                    const text = $(el).text().trim();
                    if (link && text && !text.toLowerCase().includes('batch')) {
                        finalLinks.push({ server: text.replace(/\s+/g, ' '), url: link });
                    }
                });
                return finalLinks;

            } else if (urlObject.hostname.includes('modrefer.in')) {
                const encodedUrl = new injected.URL(initialUrl).searchParams.get('url');
                if (!encodedUrl) return [];
                const decodedUrl = atob(encodedUrl);
                const response = await injected.fetchWithCookies(decodedUrl, { headers: { 'Referer': refererUrl } });
                const data = await response.text();
                const $ = injected.parseHTML(data);
                const finalLinks = [];
                $('.timed-content-client_show_0_5_0 a').each((i, el) => {
                    const link = $(el).attr('href');
                    const text = $(el).text().trim();
                    if (link) {
                        finalLinks.push({ server: text, url: link });
                    }
                });
                return finalLinks;
            }
            return [];
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error resolving intermediate link: ${error.message}`);
            return [];
        }
    }

    async function resolveTechUnblockedLink(sidUrl, injected) {
        injected.logger.log(`[MoviesMod] Resolving SID link: ${sidUrl}`);
        const { origin } = new injected.URL(sidUrl);
        try {
            const responseStep0 = await injected.fetchWithCookies(sidUrl);
            let html = await responseStep0.text();
            let $ = injected.parseHTML(html);
            const initialForm = $('#landing');
            const wp_http_step1 = initialForm.find('input[name="_wp_http"]').val();
            const action_url_step1 = initialForm.attr('action');
            if (!wp_http_step1 || !action_url_step1) {
                injected.logger.warn('[MoviesMod SID] Could not find initial form.');
                return null;
            }

            const step1Data = new injected.URLSearchParams({ '_wp_http': wp_http_step1 });
            const responseStep1 = await injected.fetchWithCookies(action_url_step1, {
                method: 'POST',
                headers: { 'Referer': sidUrl, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: step1Data.toString(),
            });

            html = await responseStep1.text();
            $ = injected.parseHTML(html);
            const verificationForm = $('#landing');
            const action_url_step2 = verificationForm.attr('action');
            const wp_http2 = verificationForm.find('input[name="_wp_http2"]').val();
            const token = verificationForm.find('input[name="token"]').val();
            if (!action_url_step2) {
                injected.logger.warn('[MoviesMod SID] Could not find verification form.');
                return null;
            }

            const step2Data = new injected.URLSearchParams({ '_wp_http2': wp_http2, 'token': token });
            const responseStep2 = await injected.fetchWithCookies(action_url_step2, {
                method: 'POST',
                headers: { 'Referer': responseStep1.url, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: step2Data.toString(),
            });

            const scriptContent = await responseStep2.text();
            
            const cookieMatch = scriptContent.match(/s_343\('([^']+)',\s*'([^']+)'/);
            const linkMatch = scriptContent.match(/c\.setAttribute\("href",\s*"([^"]+)"\)/);

            if (!linkMatch) {
                injected.logger.warn('[MoviesMod SID] Could not find final link in script.');
                return null;
            }
             if (cookieMatch) {
                const cookieName = cookieMatch[1].trim();
                const cookieValue = cookieMatch[2].trim();
                injected.logger.log(`[MoviesMod SID] Found dynamic cookie: ${cookieName}. Setting it now.`);
                injected.setCookie(cookieName, cookieValue);
            } else {
                injected.logger.warn('[MoviesMod SID] Could not find dynamic cookie in script.');
            }

            const finalUrl = new injected.URL(linkMatch[1], origin).href;
            injected.logger.log(`[MoviesMod SID] Following final link: ${finalUrl}`);
            const finalResponse = await injected.fetchWithCookies(finalUrl, { headers: { 'Referer': responseStep2.url } });
            
            html = await finalResponse.text();
            $ = injected.parseHTML(html);
            const metaRefresh = $('meta[http-equiv="refresh"]');
            if (metaRefresh.length > 0) {
                const content = metaRefresh.attr('content');
                const urlMatch = content.match(/url=(.*)/i);
                if (urlMatch && urlMatch[1]) {
                    const driveleechUrl = urlMatch[1].replace(/"/g, "").replace(/'/g, "");
                    injected.logger.log(`[MoviesMod SID] Success! Resolved Driveleech URL: ${driveleechUrl}`);
                    return driveleechUrl;
                }
            }
            injected.logger.warn('[MoviesMod SID] Could not find meta refresh tag in final response.');
            return null;
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error during SID resolution: ${error.message}`);
            return null;
        }
    }

    async function resolveDriveseedLink(driveseedUrl, injected) {
        try {
            const response = await injected.fetch(driveseedUrl, { headers: { 'Referer': 'https://links.modpro.blog/' } });
            const data = await response.text();
            const redirectMatch = data.match(/window\.location\.replace\("([^"]+)"\)/);
            if (redirectMatch && redirectMatch[1]) {
                const finalUrl = `https://driveseed.org${redirectMatch[1]}`;
                const finalResponse = await injected.fetch(finalUrl, { headers: { 'Referer': driveseedUrl } });
                const $ = injected.parseHTML(await finalResponse.text());
                const downloadOptions = [];
                let size = null;
                let fileName = null;

                $('ul.list-group li').each((i, el) => {
                    const text = $(el).text();
                    if (text.includes('Size :')) size = text.split(':')[1].trim();
                    else if (text.includes('Name :')) fileName = text.split(':')[1].trim();
                });

                const resumeCloudLink = $('a:contains("Resume Cloud")').attr('href');
                if (resumeCloudLink) downloadOptions.push({ title: 'Resume Cloud', type: 'resume', url: `https://driveseed.org${resumeCloudLink}`, priority: 1 });
                const workerSeedLink = $('a:contains("Resume Worker Bot")').attr('href');
                if (workerSeedLink) downloadOptions.push({ title: 'Resume Worker Bot', type: 'worker', url: workerSeedLink, priority: 2 });
                const instantDownloadLink = $('a:contains("Instant Download")').attr('href');
                if (instantDownloadLink) downloadOptions.push({ title: 'Instant Download', type: 'instant', url: instantDownloadLink, priority: 3 });

                downloadOptions.sort((a, b) => a.priority - b.priority);
                return { downloadOptions, size, fileName };
            }
            return { downloadOptions: [], size: null, fileName: null };
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error resolving Driveseed link: ${error.message}`);
            return { downloadOptions: [], size: null, fileName: null };
        }
    }

    async function resolveResumeCloudLink(resumeUrl, injected) {
        try {
            const response = await injected.fetch(resumeUrl, { headers: { 'Referer': 'https://driveseed.org/' } });
            const $ = injected.parseHTML(await response.text());
            return $('a:contains("Cloud Resume Download")').attr('href') || null;
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error resolving Resume Cloud link: ${error.message}`);
            return null;
        }
    }

    async function resolveWorkerSeedLink(workerSeedUrl, injected) {
        try {
            injected.logger.log(`[MoviesMod] Resolving WorkerSeed link: ${workerSeedUrl}`);
            const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

            const pageResponse = await injected.fetchWithCookies(workerSeedUrl, {
                headers: { 'User-Agent': userAgent }
            });

            const pageHtml = await pageResponse.text();
            const scriptContent = pageHtml.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/g)?.find(s => s.includes("formData.append('token'") || s.includes("fetch('/download?id="));

            if (!scriptContent) {
                injected.logger.warn('[MoviesMod] WorkerSeed: Could not find relevant script tag.');
                return null;
            }

            let tokenMatch = scriptContent.match(/formData\.append\('token', '([^']+)'\)/);
            let idMatch = scriptContent.match(/fetch\('\/download\?id=([^']+)',/);

            // Add fallbacks from original script
            if (!tokenMatch) {
                tokenMatch = scriptContent.match(/token['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
            }
            if (!idMatch) {
                idMatch = scriptContent.match(/id['"]?\s*[:=]\s*['"]([^'"]+)['"]/);
            }

            if (!tokenMatch || !tokenMatch[1] || !idMatch || !idMatch[1]) {
                injected.logger.error('[MoviesMod] WorkerSeed: Could not extract token or ID from script.');
                injected.logger.log('[MoviesMod] WorkerSeed script snippet:', scriptContent.substring(0, 500));
                return null;
            }

            const token = tokenMatch[1];
            const correctId = idMatch[1];
            injected.logger.log(`[MoviesMod] WorkerSeed: Extracted token and ID.`);
            const apiUrl = `https://workerseed.dev/download?id=${correctId}`;

            // Use multipart/form-data (FormData) as the original site expects.
            const formData = new injected.FormData();
            formData.append('token', token);

            const apiResponse = await injected.fetchWithCookies(apiUrl, {
                method: 'POST',
                body: formData,
                headers: {
                    'User-Agent': userAgent,
                    'Referer': workerSeedUrl,
                    'x-requested-with': 'XMLHttpRequest',
                    'Accept': 'application/json'
                    // NOTE: We purposely do NOT set Content-Type so RN fetch will add the correct multipart boundary.
                }
            });

            if (!apiResponse.ok) {
                injected.logger.error(`[MoviesMod] WorkerSeed API request failed with status ${apiResponse.status}`);
                const errorText = await apiResponse.text();
                injected.logger.error(`[MoviesMod] WorkerSeed API response: ${errorText.substring(0, 300)}`);
                return null;
            }

            const responseText = await apiResponse.text();
            try {
                const data = JSON.parse(responseText);
                if (data.url) {
                    injected.logger.log(`[MoviesMod] ✓ Successfully resolved worker-seed link`);
                    return data.url;
                } else {
                    injected.logger.warn('[MoviesMod] WorkerSeed API did not return a URL in JSON.');
                    injected.logger.log(data);
                    return null;
                }
            } catch (e) {
                // Fallback: try to parse HTML for a direct link (sometimes returned instead of JSON)
                injected.logger.warn('[MoviesMod] WorkerSeed API returned HTML – attempting fallback parse.');
                const maybeLinkMatch = responseText.match(/href="(https?:[^"']+\.(?:mp4|mkv|m3u8)[^"']*)"/i);
                if (maybeLinkMatch && maybeLinkMatch[1]) {
                    const directUrl = maybeLinkMatch[1];
                    injected.logger.log(`[MoviesMod] ✓ Fallback found direct link in HTML: ${directUrl}`);
                    return directUrl;
                }
                injected.logger.error('[MoviesMod] Fallback HTML parse failed to locate a video link.');
                injected.logger.error(responseText.substring(0, 300));
                return null;
            }
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error resolving WorkerSeed link: ${error.message}`);
            return null;
        }
    }

    async function resolveVideoSeedLink(videoSeedUrl, injected) {
        try {
            const urlParams = new injected.URLSearchParams(new injected.URL(videoSeedUrl).search);
            const keys = urlParams.get('url');
            if (!keys) return null;
            const apiUrl = `${new injected.URL(videoSeedUrl).origin}/api`;
            const formData = new injected.FormData();
            formData.append('keys', keys);

            const apiResponse = await injected.fetch(apiUrl, {
                method: 'POST',
                body: formData,
                headers: { 'x-token': new injected.URL(videoSeedUrl).hostname }
            });
            const data = await apiResponse.json();
            return data.url || null;
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error resolving VideoSeed link: ${error.message}`);
            return null;
        }
    }

    async function resolveUrlFlixLink(url, injected) {
        try {
            injected.logger.log(`[MoviesMod] Resolving UrlFlix link: ${url}`);
            const response = await injected.fetch(url, { headers: { 'Referer': 'https://driveseed.org/' }});
            const data = await response.text();
            
            // Regex to find video URLs in script tags. Looks for common player config patterns.
            const urlMatch = data.match(/(?:file|src|source)\s*:\s*["'](https?:\/\/[^"']+\.(?:mp4|mkv|m3u8)[^"']*)["']/);

            if (urlMatch && urlMatch[1]) {
                const finalUrl = urlMatch[1].replace(/\\/g, ''); // Remove escaping backslashes
                injected.logger.log(`[MoviesMod] ✓ Found final link on UrlFlix page: ${finalUrl}`);
                return finalUrl;
            } else {
                injected.logger.warn('[MoviesMod] ✗ Could not find a direct video link on UrlFlix page.');
                return null;
            }
        } catch (error) {
            injected.logger.error(`[MoviesMod] Error resolving UrlFlix link: ${error.message}`);
            return null;
        }
    }

    async function validateVideoUrl(url, injected, timeout = 10000) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            const response = await injected.fetch(url, { method: 'HEAD', headers: { 'Range': 'bytes=0-1' }, signal: controller.signal });
            clearTimeout(id);
            if (response.status >= 200 && response.status < 400) {
                return true;
            }
            // Some servers block HEAD; fall back to GET with small range
            const getResp = await injected.fetch(url, { method: 'GET', headers: { 'Range': 'bytes=0-1' }, signal: controller.signal });
            return getResp.status >= 200 && getResp.status < 400;
        } catch (error) {
            // In the constrained environment (RN fetch + CORS) HEAD/GET may fail even though the URL works in player.
            // We'll optimistically accept the URL to avoid discarding good streams.
            injected.logger.log(`[MoviesMod] URL validation errored (${error.message}). Assuming valid.`);
            return true;
        }
    }


    // --- Main Plugin Entrypoint ---

    async function mainGetStreams(options) {
        // Accept optional title/year passed from the host so we can skip TMDB calls when metadata is already available.
        const { tmdbId, mediaType, seasonNum, episodeNum, tmdbApiKey, title: providedTitle, year: providedYear, ...injected } = options;
        injected.logger.log(`[MoviesMod] Fetching streams for TMDB ${mediaType}/${tmdbId}${seasonNum ? ", S"+seasonNum+"E"+episodeNum: ''}`);

        try {
            const cacheKey = `moviesmod_v7_${tmdbId}_${mediaType}${seasonNum ? `_s${seasonNum}` : ''}`;
            let resolvedQualities = await injected.cache.get(cacheKey);

            if (!resolvedQualities) {
                injected.logger.log(`[MoviesMod Cache] MISS for key: ${cacheKey}.`);
                // Prefer provided metadata to avoid extra API calls.
                let title = providedTitle;
                let year = providedYear ? String(providedYear) : undefined;

                if (!title) {
                    // Fallback to TMDB API if title is not provided.
                    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${tmdbApiKey}&language=en-US`;
                    const tmdbResponse = await injected.fetch(tmdbUrl);
                    const tmdbDetails = await tmdbResponse.json();
                    title = mediaType === 'tv' ? tmdbDetails.name : tmdbDetails.title;
                    year = mediaType === 'tv' ? tmdbDetails.first_air_date?.substring(0, 4) : tmdbDetails.release_date?.substring(0, 4);
                }

                if (!title) throw new Error('Could not get title from metadata or TMDB');

                const searchResults = await searchMoviesMod(title, injected);
                if (!searchResults.length) throw new Error(`No search results for "${title}"`);

                const { bestMatch } = findBestMatch(title, searchResults.map(r => r.title));
                let selectedResult = null;
                if (bestMatch.rating > 0.3) {
                    selectedResult = searchResults.find(r => r.title === bestMatch.target);
                    if (mediaType === 'movie' && year && !selectedResult.title.includes(year)) {
                        selectedResult = null;
                    }
                }
                if (!selectedResult) {
                    const titleRegex = new RegExp(`\\b${escapeRegExp(title.toLowerCase())}\\b`);
                    selectedResult = searchResults.find(r => titleRegex.test(r.title.toLowerCase()) && (!year || r.title.includes(year) || mediaType !== 'movie'));
                }
                if (!selectedResult) throw new Error(`No suitable search result found for "${title} (${year})".`);

                injected.logger.log(`[MoviesMod] Selected: ${selectedResult.title}`);
                const downloadLinks = await extractDownloadLinks(selectedResult.url, injected);
                if (!downloadLinks.length) throw new Error('No download links found');

                let relevantLinks = downloadLinks.filter(link => !link.quality.toLowerCase().includes('480p'));
                if (mediaType === 'tv' && seasonNum !== null) {
                    relevantLinks = relevantLinks.filter(link => link.quality.toLowerCase().includes(`season ${seasonNum}`) || link.quality.toLowerCase().includes(`s${seasonNum}`));
                }

                if (relevantLinks.length > 0) {
                    const qualityPromises = relevantLinks.map(async (link) => {
                        const finalLinks = await resolveIntermediateLink(link.url, selectedResult.url, link.quality, injected);
                        return finalLinks?.length > 0 ? { quality: link.quality, finalLinks } : null;
                    });
                    resolvedQualities = (await Promise.all(qualityPromises)).filter(Boolean);
                } else {
                    resolvedQualities = [];
                }
                await injected.cache.set(cacheKey, resolvedQualities, 4 * 3600); // 4 hour cache
            } else {
                injected.logger.log(`[MoviesMod Cache] HIT for key: ${cacheKey}.`);
            }

            if (!resolvedQualities || resolvedQualities.length === 0) return [];

            const streams = [];
            const processedFileNames = new Set();
            const qualityProcessingPromises = resolvedQualities.map(async ({ quality, finalLinks }) => {
                let targetLinks = finalLinks;
                if (mediaType === 'tv' && episodeNum !== null) {
                    const ep = `episode ${episodeNum}`;
                    const epShort = `ep ${episodeNum}`;
                    const epShorter = `e${episodeNum}`;
                    targetLinks = finalLinks.filter(fl => fl.server.toLowerCase().includes(ep) || fl.server.toLowerCase().includes(epShort) || fl.server.toLowerCase().includes(epShorter));
                    if (targetLinks.length === 0) return [];
                }

                const finalStreamPromises = targetLinks.map(async (targetLink) => {
                    try {
                        let currentUrl = targetLink.url;
                        if (currentUrl.includes('tech.unblockedgames.world') || currentUrl.includes('tech.creativeexpressionsblog.com')) {
                            currentUrl = await resolveTechUnblockedLink(currentUrl, injected);
                        }
                        if (!currentUrl) return null;
                        
                        // If the link is still a tech.unblockedgames.world/creativeexpressionsblog.com SID link
                        // and we failed to resolve it, we will still pass it through so the player (or user)
                        // can attempt to open it. These links usually redirect to Google Drive after a short UI
                        // delay which many external players can cope with.
                        if (!currentUrl.includes('driveseed.org')) {
                            // Explicitly filter out unresolved urlflix links
                            if (currentUrl.includes('urlflix.xyz')) {
                                injected.logger.log(`[MoviesMod] Filtering out unresolved urlflix link: ${currentUrl}`);
                                return null;
                            }
                            injected.logger.warn(`[MoviesMod] Could not bypass SID → driveseed for URL. Passing unresolved link through.`);
                            return {
                                name: `MoviesMod`,
                                title: `Unresolved link – may require redirect`,
                                url: currentUrl,
                                quality: 'Unknown',
                            };
                        }

                        const { downloadOptions, size, fileName } = await resolveDriveseedLink(currentUrl, injected);
                        if (!downloadOptions?.length || (fileName && processedFileNames.has(fileName))) return null;
                        if (fileName) processedFileNames.add(fileName);

                        for (const option of downloadOptions) {
                            let finalDownloadUrl = null;
                            if (option.type === 'resume') finalDownloadUrl = await resolveResumeCloudLink(option.url, injected);
                            else if (option.type === 'worker') finalDownloadUrl = await resolveWorkerSeedLink(option.url, injected);
                            else if (option.type === 'instant') finalDownloadUrl = await resolveVideoSeedLink(option.url, injected);
                            
                            if (finalDownloadUrl) {
                                if (finalDownloadUrl.includes('urlflix.xyz')) {
                                    injected.logger.log(`[MoviesMod] Detected UrlFlix link, attempting to resolve: ${finalDownloadUrl}`);
                                    finalDownloadUrl = await resolveUrlFlixLink(finalDownloadUrl, injected);
                                }

                                if (finalDownloadUrl && await validateVideoUrl(finalDownloadUrl, injected)) {
                                    const actualQuality = extractQuality(quality);
                                    const sizeInfo = size || quality.match(/\[([^\]]+)\]/)?.[1];
                                    const cleanFileName = fileName ? fileName.replace(/\.[^/.]+$/, "").replace(/[._]/g, ' ') : `Stream from ${quality}`;
                                    const techDetails = getTechDetails(quality);
                                    const techDetailsString = techDetails.length > 0 ? ` • ${techDetails.join(' • ')}` : '';
                                    return {
                                        name: `MoviesMod`,
                                        title: `${option.title} • ${actualQuality} • ${cleanFileName}\n${sizeInfo || ''}${techDetailsString}`,
                                        url: finalDownloadUrl,
                                        quality: actualQuality,
                                    };
                                }
                            }
                        }
                        return null;
                    } catch (e) {
                        injected.logger.error(`[MoviesMod] Error processing target link ${targetLink.url}: ${e.message}`);
                        return null;
                    }
                });
                return (await Promise.all(finalStreamPromises)).filter(Boolean);
            });

            const allResults = await Promise.all(qualityProcessingPromises);
            allResults.flat().forEach(s => streams.push(s));
            streams.sort((a, b) => parseQualityForSort(b.quality) - parseQualityForSort(a.quality));

            injected.logger.log(`[MoviesMod] Successfully extracted and sorted ${streams.length} streams.`);
            injected.logger.log('[MoviesMod] Final streams:', JSON.stringify(streams, null, 2));
            return streams;

        } catch (error) {
            options.logger.error(`[MoviesMod] FATAL: ${error.message}\n${error.stack}`);
            return [];
        }
    }


    // --- Register Plugin ---
    if (typeof registerPlugin === 'function') {
        registerPlugin(plugin);
    } else {
        console.error("Plugin system not found. Cannot register MoviesMod plugin.");
    }

})(); 
