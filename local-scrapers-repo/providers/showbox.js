// ShowBox (OG) Provider for Nuvio Local Scrapers
// React Native compatible – no Node core modules, no async/await

const cheerio = require('cheerio-without-node-native');

// Constants
var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var SHOWBOX_BASE = 'https://www.showbox.media';
var PROXY_PREFIX = 'https://timely-taiyaki-81a26d.netlify.app/?destination='; // Proxy all showbox.media
var FEBBOX_BASE = 'https://www.febbox.com';
var FEBBOX_FILE_SHARE_LIST_URL = FEBBOX_BASE + '/file/file_share_list';
var FEBBOX_COOKIE_VALUE = (typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS && SCRAPER_SETTINGS.cookie) ? SCRAPER_SETTINGS.cookie : 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NTA5MzA4NTYsIm5iZiI6MTc1MDkzMDg1NiwiZXhwIjoxNzgyMDM0ODc2LCJkYXRhIjp7InVpZCI6ODQ2NzQ4LCJ0b2tlbiI6ImIzNTllZDk1NjBkMDI5ZmQwY2IyNjdlYTZlMWIwMDlkIn19.WqD3ruYvVx8tyfFuRDMWDaTz1XdvLztW4h_rGt6xt8o';
var DEFAULT_REGION = (typeof SCRAPER_SETTINGS !== 'undefined' && SCRAPER_SETTINGS && SCRAPER_SETTINGS.region) ? SCRAPER_SETTINGS.region : null;

// Headers
var DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Connection': 'keep-alive'
};

function makeRequest(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || 'GET',
    body: options.body,
    headers: Object.assign({}, DEFAULT_HEADERS, options.headers || {})
  }).then(function (response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + response.statusText);
    }
    return response;
  });
}

function proxify(url) {
  return PROXY_PREFIX + encodeURIComponent(url);
}

// TMDB minimal helper
function getTMDBDetails(tmdbId, mediaType) {
  var u = 'https://api.themoviedb.org/3/' + (mediaType === 'tv' ? 'tv' : 'movie') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
  return makeRequest(u).then(function (r) { return r.json(); }).then(function (data) {
    if (mediaType === 'movie') {
      return { title: data.title, original_title: data.original_title, year: data.release_date ? data.release_date.split('-')[0] : null };
    } else {
      return { title: data.name, original_title: data.original_name, year: data.first_air_date ? data.first_air_date.split('-')[0] : null };
    }
  }).catch(function () { return null; });
}

function normalizeTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function calculateSimilarity(a, b) {
  var s1 = normalizeTitle(a), s2 = normalizeTitle(b);
  if (s1 === s2) return 1.0;
  var w1 = s1.split(' '), w2 = s2.split(' ');
  var matches = 0;
  for (var i = 0; i < w1.length; i++) {
    var w = w1[i];
    if (w.length > 2 && w2.some(function (x) { return x.indexOf(w) !== -1 || w.indexOf(x) !== -1; })) matches++;
  }
  return matches / Math.max(w1.length, w2.length || 1);
}

function findBestMatch(results, query, year) {
  if (!results || results.length === 0) return null;
  var scored = results.map(function (r) {
    var score = 0;
    score += calculateSimilarity(r.title, query) * 100;
    if (year && r.year && String(r.year) === String(year)) score += 35;
    if (normalizeTitle(r.title) === normalizeTitle(query)) score += 50;
    return { item: r, score: score };
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored[0].item;
}

// Search ShowBox via proxy
function searchShowbox(query, year, mediaType) {
  var searchUrl = SHOWBOX_BASE + '/search?keyword=' + encodeURIComponent(query + (year ? (' ' + year) : ''));
  return makeRequest(proxify(searchUrl)).then(function (r) { return r.text(); }).then(function (html) {
    var $ = cheerio.load(html);
    var results = [];
    $('div.film-poster a.film-poster-ahref').each(function (i, el) {
      var $el = $(el);
      var title = ($el.attr('title') || '').trim();
      var href = $el.attr('href') || '';
      if (title && href) {
        var full = SHOWBOX_BASE + (href.indexOf('/') === 0 ? '' : '/') + href;
        var y = null;
        var ym = title.match(/\((\d{4})\)$/);
        if (ym && ym[1]) y = ym[1];
        // type check from URL
        var isMovie = href.indexOf('/movie/') !== -1;
        var isTv = href.indexOf('/tv/') !== -1;
        if ((mediaType === 'movie' && isMovie) || (mediaType !== 'movie' && isTv)) {
          results.push({ title: title, url: full, year: y });
        } else {
          // still include but penalize later via similarity
          results.push({ title: title, url: full, year: y });
        }
      }
    });
    return results;
  }).catch(function () { return []; });
}

// Extract FebBox share link from ShowBox detail
function extractFebboxLink(detailUrl) {
  return makeRequest(proxify(detailUrl)).then(function (r) { return r.text(); }).then(function (html) {
    var $ = cheerio.load(html);
    var link = null;
    $('a[href*="febbox.com/share/"]').each(function (i, el) {
      var h = $(el).attr('href');
      if (h && h.indexOf('febbox.com/share/') !== -1) { link = h; return false; }
    });
    if (!link) {
      var scripts = $('script').map(function (i, el) { return $(el).html() || ''; }).get().join('\n');
      var m = scripts.match(/['"](https?:\/\/www\.febbox\.com\/share\/[a-zA-Z0-9-]+)['"]/);
      if (m && m[1]) link = m[1];
    }
    if (link) return link;
    // Fallback: try extracting numeric ID/type then call share_link API via proxy
    var idAndType = extractShowboxIdAndType(html, detailUrl);
    if (idAndType && idAndType.id && idAndType.type) {
      return getShareLinkFromApi(idAndType.id, idAndType.type).then(function (apiLink) { return apiLink || null; });
    }
    return null;
  }).catch(function () { return null; });
}

// Extract numeric content id and type (1 movie, 2 tv) from detail page
function extractShowboxIdAndType(html, url) {
  try {
    var id = null; var type = null;
    var um = (url || '').match(/\/(movie|tv)\/detail\/(\d+)/);
    if (um) {
      id = um[2];
      type = um[1] === 'movie' ? '1' : '2';
    }
    if (!id) {
      var $ = cheerio.load(html);
      var link = $('h2.heading-name a[href*="/detail/"], h1.heading-name a[href*="/detail/"]').first();
      if (link && link.length) {
        var href = link.attr('href') || '';
        var hm = href.match(/\/(movie|tv)\/detail\/(\d+)/);
        if (hm) { id = hm[2]; type = hm[1] === 'movie' ? '1' : '2'; }
      }
      if (!id) {
        var shareDiv = $('div.sharethis-inline-share-buttons');
        var href2 = null;
        shareDiv.find('a[href*="/detail/"]').each(function (i, el) { if (!href2) href2 = $(el).attr('href'); });
        if (!href2) {
          var durl = shareDiv.attr('data-url') || '';
          if (durl) href2 = durl;
        }
        if (href2) {
          var hm2 = href2.match(/\/(movie|tv)\/detail\/(\d+)/);
          if (hm2) { id = hm2[2]; type = hm2[1] === 'movie' ? '1' : '2'; }
        }
      }
    }
    if (id && type) return { id: id, type: type };
    return null;
  } catch (e) {
    return null;
  }
}

// Call ShowBox API to get FebBox link (proxied)
function getShareLinkFromApi(id, type) {
  var apiUrl = SHOWBOX_BASE + '/index/share_link?id=' + encodeURIComponent(id) + '&type=' + encodeURIComponent(type);
  return makeRequest(proxify(apiUrl), { headers: { 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' } })
    .then(function (r) { return r.text(); })
    .then(function (txt) {
      try {
        var json = JSON.parse(txt);
        if (json && json.code === 1 && json.data && json.data.link) return json.data.link;
      } catch (e) { /* ignore */ }
      return null;
    }).catch(function () { return null; });
}

// Parse direct jwplayer sources from FebBox share page (if present)
function parseDirectSourcesFromShare(html) {
  try {
    var m = html.match(/var\s+sources\s*=\s*(\[.*?\]);/s);
    if (!m) return [];
    var arr = JSON.parse(m[1]);
    return (arr || []).filter(function (x) { return x && x.file; }).map(function (x) {
      return { label: String(x.label || 'ORG'), url: String(x.file) };
    });
  } catch (e) {
    return [];
  }
}

function getQualityFromLabel(label) {
  var l = String(label || '').toLowerCase();
  if (l.indexOf('2160') !== -1 || l.indexOf('4k') !== -1 || l.indexOf('uhd') !== -1) return '2160p';
  if (l.indexOf('1080') !== -1) return '1080p';
  if (l.indexOf('720') !== -1) return '720p';
  if (l.indexOf('480') !== -1) return '480p';
  if (l.indexOf('360') !== -1) return '360p';
  return 'ORG';
}

// Size helpers via HEAD request
function formatSize(bytes) {
  var b = parseInt(bytes, 10);
  if (isNaN(b) || b <= 0) return null;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(2) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function fetchSizeForUrl(url) {
  try {
    if ((url || '').toLowerCase().indexOf('.m3u8') !== -1) return Promise.resolve('Playlist (size N/A)');
    // Try HEAD without Range to get full content-length
    return fetch(url, { method: 'HEAD', headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] } })
      .then(function (res) {
        if (!res) return null;
        var len = res.headers && res.headers.get ? res.headers.get('content-length') : null;
        if (len) return formatSize(len) || null;
        var cr = res.headers && res.headers.get ? res.headers.get('content-range') : null; // bytes 0-0/12345
        if (cr) {
          var m = cr.match(/\/(\d+)$/);
          if (m && m[1]) return formatSize(m[1]) || null;
        }
        // Fallback: do a tiny ranged GET to read Content-Range total size
        return fetch(url, { method: 'GET', headers: { 'Range': 'bytes=0-0', 'User-Agent': DEFAULT_HEADERS['User-Agent'] } })
          .then(function (r2) {
            var cr2 = r2.headers && r2.headers.get ? r2.headers.get('content-range') : null;
            if (cr2) {
              var m2 = cr2.match(/\/(\d+)$/);
              if (m2 && m2[1]) return formatSize(m2[1]) || null;
            }
            var len2 = r2.headers && r2.headers.get ? r2.headers.get('content-length') : null;
            return len2 ? (formatSize(len2) || null) : null;
          }).catch(function () { return null; });
      }).catch(function () { return null; });
  } catch (e) {
    return Promise.resolve(null);
  }
}

function attachSizes(streams) {
  var tasks = (streams || []).map(function (s) {
    return fetchSizeForUrl(s.url).then(function (sz) { s.size = sz; return s; }).catch(function () { return s; });
  });
  return Promise.all(tasks).then(function (arr) { return arr; });
}

// Build display title per README: descriptive text, not the URL
function buildStreamTitle(label, fileName) {
  if (fileName && fileName.trim()) return fileName;
  return (label && String(label).trim()) ? String(label).trim() : 'ORG';
}

// Extract detailed filename (prefer KEY5 param if present)
function extractDetailedFilename(url) {
  try {
    var u = new URL(url);
    var key5 = u.searchParams.get('KEY5');
    if (key5) {
      try { return decodeURIComponent(key5); } catch (e) { return key5; }
    }
    var base = u.pathname.split('/').pop() || '';
    try { return decodeURIComponent(base); } catch (e2) { return base; }
  } catch (e) {
    return null;
  }
}

function sortPreferMkvOrg(streams) {
  if (!streams || streams.length === 0) return streams;
  function baseOrder(q) {
    if (q === 'ORG') return 6;
    if (q === '2160p') return 5;
    if (q === '1080p') return 4;
    if (q === '720p') return 3;
    if (q === '480p') return 2;
    if (q === '360p') return 1;
    return 0;
  }
  function mkvBonus(s) {
    var fname = (s.fileName || s.title || '').toLowerCase();
    var url = (s.url || '').toLowerCase();
    return (fname.indexOf('.mkv') !== -1 || /\.mkv(\?|$)/i.test(url)) ? 1 : 0;
  }
  function sizeBytes(sz) {
    if (!sz) return 0;
    var m = String(sz).match(/([\d.]+)\s*(gb|mb|kb|b)/i);
    if (!m) return 0;
    var v = parseFloat(m[1]);
    var u = m[2].toLowerCase();
    var mult = (u==='gb')?1024*1024*1024:(u==='mb')?1024*1024:(u==='kb')?1024:1;
    return Math.floor(v*mult);
  }
  return [].concat(streams).sort(function(a,b){
    var aBase = baseOrder(a.quality||'');
    var bBase = baseOrder(b.quality||'');
    if (aBase !== bBase) return bBase - aBase;
    var aM = mkvBonus(a), bM = mkvBonus(b);
    if (aM !== bM) return bM - aM;
    var aS = sizeBytes(a.size), bS = sizeBytes(b.size);
    if (aS !== bS) return bS - aS;
    return 0;
  });
}

// Extract (share_key, fids[]) from FebBox share page
function extractShareMeta(html, url) {
  var $ = cheerio.load(html);
  var shareKey = null;
  var mk = (url || '').match(/\/share\/([a-zA-Z0-9-]+)/);
  if (mk && mk[1]) shareKey = mk[1];
  if (!shareKey) {
    var km = html.match(/(?:var\s+share_key\s*=|share_key:\s*|shareid=)"?([a-zA-Z0-9-]+)"?/);
    if (km && km[1]) shareKey = km[1];
  }
  var fids = [];
  $('div.file').each(function (i, el) {
    var $el = $(el);
    var id = $el.attr('data-id');
    if (id && /^\d+$/.test(id) && !$el.hasClass('open_dir')) fids.push(id);
  });
  fids = Array.from(new Set(fids));
  return { shareKey: shareKey, fids: fids };
}

// POST to FebBox player to resolve a fid -> sources
function resolveFid(fid, shareKey, region) {
  var url = FEBBOX_BASE + '/file/player';
  var body = new URLSearchParams();
  body.append('fid', fid);
  body.append('share_key', shareKey);
  return makeRequest(url, {
    method: 'POST',
    body: body.toString(),
    headers: {
      'Cookie': 'ui=' + FEBBOX_COOKIE_VALUE + (region ? ('; oss_group=' + region) : ''),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }).then(function (r) { return r.text(); }).then(function (txt) {
    // Either direct URL or JS with var sources = [...]
    if (/^https?:\/\//i.test(txt) && (txt.indexOf('.mp4') !== -1 || txt.indexOf('.m3u8') !== -1)) {
      return [{ label: 'DirectLink', url: txt.trim() }];
    }
    var m = txt.match(/var\s+sources\s*=\s*(\[.*?\]);/s);
    if (m && m[1]) {
      try { return JSON.parse(m[1]); } catch (e) { return []; }
    }
    try {
      var json = JSON.parse(txt);
      if (json && json.msg) return [];
    } catch (e) { /* ignore */ }
    return [];
  }).catch(function () { return []; });
}

// Fetch FebBox share page and return streams
function getStreamsFromFebboxShare(shareUrl, type, season, episode, region) {
  return makeRequest(shareUrl, { headers: { 'Cookie': 'ui=' + FEBBOX_COOKIE_VALUE + (region ? ('; oss_group=' + region) : '') } })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var direct = parseDirectSourcesFromShare(html);
      if (direct.length > 0) {
        return attachSizes(direct.map(function (s) {
          return {
            name: 'ShowBox',
            title: buildStreamTitle(s.label, extractDetailedFilename(s.url)),
            url: s.url,
            quality: getQualityFromLabel(s.label),
            size: null,
            fileName: extractDetailedFilename(s.url),
            type: 'direct'
          };
        })).then(function (arr) { return sortPreferMkvOrg(arr); });
      }
      var meta = extractShareMeta(html, shareUrl);
      if (!meta.shareKey) return [];

      // If movie or there are direct file fids on root, resolve them directly
      if (type === 'movie' || (meta.fids && meta.fids.length > 0)) {
        var fidsDirect = meta.fids || [];
        var tasksDirect = fidsDirect.map(function (fid) { return resolveFid(fid, meta.shareKey, region).then(function (arr) { return arr || []; }).catch(function () { return []; }); });
        return Promise.all(tasksDirect).then(function (arrs) {
          var flatD = [].concat.apply([], arrs).filter(function (x) { return x && x.file; });
          return attachSizes(flatD.map(function (s) { return { name: 'ShowBox', title: buildStreamTitle(s.label, extractDetailedFilename(s.file)), url: s.file, quality: getQualityFromLabel(s.label), size: null, fileName: extractDetailedFilename(s.file), type: 'direct' }; })).then(function (arr) { return sortPreferMkvOrg(arr); });
        });
      }

      // TV folder traversal: find season folder and fetch file list via FebBox API
      if (type !== 'movie' && season) {
        var $root = cheerio.load(html);
        var shareKey = meta.shareKey;
        var seasonFolderId = null;
        // locate season folders
        $root('div.file.open_dir').each(function (i, el) {
          var $el = $root(el);
          var id = $el.attr('data-id');
          var fname = ($el.find('p.file_name').text() || $el.attr('data-path') || '').toLowerCase();
          var sNum = null;
          var m1 = fname.match(/season\s+(\d+)/i);
          var m2 = fname.match(/\bs(\d+)\b/i);
          var m3 = fname.match(/season(\d+)/i);
          if (m1 && m1[1]) sNum = parseInt(m1[1], 10);
          else if (m2 && m2[1]) sNum = parseInt(m2[1], 10);
          else if (m3 && m3[1]) sNum = parseInt(m3[1], 10);
          if (!sNum) {
            var onlyNum = fname.match(/\b(\d+)\b/);
            if (onlyNum && onlyNum[1]) sNum = parseInt(onlyNum[1], 10);
          }
          if (id && sNum === parseInt(season, 10)) seasonFolderId = id;
        });
        if (!seasonFolderId) return [];

        // fetch folder content via API
        var listUrl = FEBBOX_FILE_SHARE_LIST_URL + '?share_key=' + encodeURIComponent(shareKey) + '&parent_id=' + encodeURIComponent(seasonFolderId) + '&is_html=1&pwd=';
        return makeRequest(listUrl, { headers: { 'Cookie': 'ui=' + FEBBOX_COOKIE_VALUE + (region ? ('; oss_group=' + region) : ''), 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function (res) { return res.text(); })
          .then(function (txt) {
            var folderHtml = txt;
            try { var j = JSON.parse(txt); if (j && j.html) folderHtml = j.html; } catch (e) { /* keep txt */ }
            var $folder = cheerio.load(folderHtml || '');
            var targets = [];
            $folder('div.file').each(function (i, el) {
              var $el = $folder(el);
              var id = $el.attr('data-id');
              if (!id || /open_dir/.test($el.attr('class') || '')) return;
              var name = ($el.find('p.file_name').text() || '').toLowerCase();
              var ep = null;
              var m = name.match(/(?:e|ep|episode)[\s._-]*0*(\d{1,3})/i);
              if (m && m[1]) ep = parseInt(m[1], 10);
              if (!ep) {
                var only = name.match(/\b(\d{1,3})\b/);
                if (only && only[1]) ep = parseInt(only[1], 10);
              }
              if (!episode || (ep && ep === parseInt(episode, 10))) targets.push(id);
            });
            if (targets.length === 0) return [];
            var tasks = targets.map(function (fid) { return resolveFid(fid, shareKey, region).then(function (arr) { return arr || []; }).catch(function () { return []; }); });
            return Promise.all(tasks).then(function (arrs) {
              var flat = [].concat.apply([], arrs).filter(function (x) { return x && x.file; });
              return attachSizes(flat.map(function (s) { return { name: 'ShowBox', title: buildStreamTitle(s.label, extractDetailedFilename(s.file)), url: s.file, quality: getQualityFromLabel(s.label), size: null, fileName: extractDetailedFilename(s.file), type: 'direct' }; })).then(function (arr) { return sortPreferMkvOrg(arr); });
            });
          }).catch(function () { return []; });
      }

      return [];
    }).catch(function () { return []; });
}

// Region-aware entry: force a specific oss_group region via cookie
function getStreamsByRegion(tmdbId, type, season, episode, region) {
  type = type || 'movie';
  var tmdbType = (type === 'series' ? 'tv' : type);
  return getTMDBDetails(tmdbId, tmdbType).then(function (tmdb) {
    if (!tmdb || !tmdb.title) return [];
    return searchShowbox(tmdb.title, tmdb.year, tmdbType === 'movie' ? 'movie' : 'tv').then(function (results) {
      if (!results || results.length === 0) return [];
      var best = findBestMatch(results, tmdb.title, tmdb.year) || results[0];
      return extractFebboxLink(best.url).then(function (shareUrl) {
        if (!shareUrl) return [];
        return getStreamsFromFebboxShare(shareUrl, tmdbType === 'movie' ? 'movie' : 'tv', season, episode, region)
          .then(function (streams) { return sortPreferMkvOrg(streams || []); })
          .then(function (streams) { return streams.map(function (s) { s.name = 'ShowBox - ' + region; return s; }); });
      });
    });
  }).catch(function () { return []; });
}

// Main entry – Promise-based
function getStreams(tmdbId, type, season, episode) {
  type = type || 'movie';
  var tmdbType = (type === 'series' ? 'tv' : type);
  return getTMDBDetails(tmdbId, tmdbType).then(function (tmdb) {
    if (!tmdb || !tmdb.title) return [];
    return searchShowbox(tmdb.title, tmdb.year, tmdbType === 'movie' ? 'movie' : 'tv').then(function (results) {
      if (!results || results.length === 0) return [];
      var best = findBestMatch(results, tmdb.title, tmdb.year) || results[0];
      return extractFebboxLink(best.url).then(function (shareUrl) {
        if (!shareUrl) return [];
        return getStreamsFromFebboxShare(shareUrl, tmdbType === 'movie' ? 'movie' : 'tv', season, episode, DEFAULT_REGION)
          .then(function (streams) { return sortPreferMkvOrg(streams || []); });
      });
    });
  }).catch(function () { return []; });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams, getStreamsByRegion };
} else {
  // eslint-disable-next-line no-undef
  global.getStreams = getStreams;
}


