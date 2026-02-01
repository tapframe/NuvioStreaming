package com.nuvio.tv.core.plugin

import android.util.Log
import com.dokar.quickjs.binding.asyncFunction
import com.dokar.quickjs.binding.define
import com.dokar.quickjs.binding.function
import com.dokar.quickjs.quickJs
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.nuvio.tv.domain.model.LocalScraperResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import org.jsoup.select.Elements
import java.io.ByteArrayInputStream
import java.net.URL
import java.security.MessageDigest
import java.util.Base64
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPInputStream
import java.util.zip.InflaterInputStream
import kotlin.text.Charsets
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "PluginRuntime"
private const val PLUGIN_TIMEOUT_MS = 60_000L

@Singleton
class PluginRuntime @Inject constructor() {

    private val gson: Gson = GsonBuilder().create()

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    // Store parsed documents for cheerio
    private val documentCache = ConcurrentHashMap<String, Document>()
    private val elementCache = ConcurrentHashMap<String, Element>()

    // Pre-compiled regex for :contains() selector conversion
    private val containsRegex = Regex(""":contains\(["']([^"']+)["']\)""")

    @Volatile
    private var cachedCryptoJsSource: String? = null

    private fun loadCryptoJsSourceOrNull(): String? {
        cachedCryptoJsSource?.let { return it }
        val cl = this::class.java.classLoader ?: return null

        // WebJars layout: META-INF/resources/webjars/crypto-js/<version>/...
        val candidatePaths = listOf(
            "META-INF/resources/webjars/crypto-js/4.2.0/crypto-js.min.js",
            "META-INF/resources/webjars/crypto-js/4.2.0/crypto-js.js",
            "META-INF/resources/webjars/crypto-js/4.2.0/crypto-js/crypto-js.min.js",
            "META-INF/resources/webjars/crypto-js/4.2.0/crypto-js/crypto-js.js",
        )

        for (path in candidatePaths) {
            try {
                cl.getResourceAsStream(path)?.use { input ->
                    val text = input.readBytes().toString(Charsets.UTF_8)
                    cachedCryptoJsSource = text
                    return text
                }
            } catch (_: Exception) {
                // Try next candidate
            }
        }
        return null
    }

    private fun normalizeBase64(input: String): String {
        var s = input.trim().replace("\n", "").replace("\r", "").replace(" ", "")
        s = s.replace('-', '+').replace('_', '/')
        val mod = s.length % 4
        if (mod != 0) {
            s += "=".repeat(4 - mod)
        }
        return s
    }

    private fun base64Decode(input: String): ByteArray {
        return Base64.getDecoder().decode(normalizeBase64(input))
    }

    private fun base64Encode(bytes: ByteArray): String {
        return Base64.getEncoder().encodeToString(bytes)
    }

    private fun bytesToHex(bytes: ByteArray): String {
        val sb = StringBuilder(bytes.size * 2)
        for (b in bytes) {
            sb.append(((b.toInt() shr 4) and 0xF).toString(16))
            sb.append((b.toInt() and 0xF).toString(16))
        }
        return sb.toString()
    }

    /**
     * Execute a plugin and return streams
     */
    suspend fun executePlugin(
        code: String,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
        scraperId: String,
        scraperSettings: Map<String, Any> = emptyMap()
    ): List<LocalScraperResult> = withContext(Dispatchers.IO) {
        withTimeout(PLUGIN_TIMEOUT_MS) {
            executePluginInternal(code, tmdbId, mediaType, season, episode, scraperId, scraperSettings)
        }
    }

    private suspend fun executePluginInternal(
        code: String,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
        scraperId: String,
        scraperSettings: Map<String, Any>
    ): List<LocalScraperResult> {
        // Clear caches before execution
        documentCache.clear()
        elementCache.clear()

        var resultJson = "[]"

        try {
            quickJs(Dispatchers.IO) {
                // Define console object
                define("console") {
                    function("log") { args ->
                        Log.d("Plugin:$scraperId", args.joinToString(" ") { it?.toString() ?: "null" })
                    }
                    function("error") { args ->
                        Log.e("Plugin:$scraperId", args.joinToString(" ") { it?.toString() ?: "null" })
                    }
                    function("warn") { args ->
                        Log.w("Plugin:$scraperId", args.joinToString(" ") { it?.toString() ?: "null" })
                    }
                    function("info") { args ->
                        Log.i("Plugin:$scraperId", args.joinToString(" ") { it?.toString() ?: "null" })
                    }
                    function("debug") { args ->
                        Log.d("Plugin:$scraperId", args.joinToString(" ") { it?.toString() ?: "null" })
                    }
                }

                // Define native fetch function (async)
                asyncFunction("__native_fetch") { args ->
                    val url = args.getOrNull(0)?.toString() ?: ""
                    val method = args.getOrNull(1)?.toString() ?: "GET"
                    val headersJson = args.getOrNull(2)?.toString() ?: "{}"
                    val body = args.getOrNull(3)?.toString() ?: ""
                    performNativeFetch(url, method, headersJson, body)
                }

                // Define URL parser
                function("__parse_url") { args ->
                    val urlString = args.getOrNull(0)?.toString() ?: ""
                    parseUrl(urlString)
                }

                // Define cheerio load function
                function("__cheerio_load") { args ->
                    val html = args.getOrNull(0)?.toString() ?: ""
                    val docId = UUID.randomUUID().toString()
                    val doc = Jsoup.parse(html)
                    documentCache[docId] = doc
                    docId
                }

                // Define cheerio select function
                function("__cheerio_select") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    var selector = args.getOrNull(1)?.toString() ?: ""
                    val doc = documentCache[docId] ?: return@function "[]"
                    try {
                        // Convert cheerio :contains("text") to jsoup :contains(text)
                        selector = selector.replace(containsRegex, ":contains($1)")
                        val elements = if (selector.isEmpty()) {
                            Elements()
                        } else {
                            doc.select(selector)
                        }
                        val ids = elements.mapIndexed { index, el ->
                            val elId = "$docId:$index:${el.hashCode()}"
                            elementCache[elId] = el
                            elId
                        }
                        // Use simple JSON array construction to avoid Gson issues
                        "[" + ids.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" } + "]"
                    } catch (e: Exception) {
                        "[]"
                    }
                }

                // Define cheerio find function
                function("__cheerio_find") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    var selector = args.getOrNull(2)?.toString() ?: ""
                    val element = elementCache[elementId] ?: return@function "[]"
                    try {
                        // Convert cheerio :contains("text") to jsoup :contains(text)
                        selector = selector.replace(containsRegex, ":contains($1)")
                        val elements = element.select(selector)
                        val ids = elements.mapIndexed { index, el ->
                            val elId = "$docId:find:$index:${el.hashCode()}"
                            elementCache[elId] = el
                            elId
                        }
                        // Use simple JSON array construction to avoid Gson issues
                        "[" + ids.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" } + "]"
                    } catch (e: Exception) {
                        "[]"
                    }
                }

                // Define cheerio text function
                function("__cheerio_text") { args ->
                    val elementIds = args.getOrNull(1)?.toString() ?: ""
                    val ids = elementIds.split(",").filter { it.isNotEmpty() }
                    val texts = ids.mapNotNull { id ->
                        elementCache[id]?.text()
                    }
                    texts.joinToString(" ")
                }

                // Define cheerio html function
                function("__cheerio_html") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    if (elementId.isEmpty()) {
                        documentCache[docId]?.html() ?: ""
                    } else {
                        elementCache[elementId]?.html() ?: ""
                    }
                }

                // Define cheerio inner html function
                function("__cheerio_inner_html") { args ->
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    elementCache[elementId]?.html() ?: ""
                }

                // Define cheerio attr function
                function("__cheerio_attr") { args ->
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    val attrName = args.getOrNull(2)?.toString() ?: ""
                    val value = elementCache[elementId]?.attr(attrName)
                    if (value.isNullOrEmpty()) "__UNDEFINED__" else value
                }

                // Define cheerio next function
                function("__cheerio_next") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    val el = elementCache[elementId] ?: return@function "__NONE__"
                    val next = el.nextElementSibling() ?: return@function "__NONE__"
                    val nextId = "$docId:next:${next.hashCode()}"
                    elementCache[nextId] = next
                    nextId
                }

                // Define cheerio prev function
                function("__cheerio_prev") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    val el = elementCache[elementId] ?: return@function "__NONE__"
                    val prev = el.previousElementSibling() ?: return@function "__NONE__"
                    val prevId = "$docId:prev:${prev.hashCode()}"
                    elementCache[prevId] = prev
                    prevId
                }

                // Note: crypto-js is now loaded as a real library (WebJars) before plugin execution.

                // Function to capture results
                function("__capture_result") { args ->
                    resultJson = args.getOrNull(0)?.toString() ?: "[]"
                }

                // Inject JavaScript polyfills
                val settingsJson = gson.toJson(scraperSettings)
                val polyfillCode = buildPolyfillCode(scraperId, settingsJson)
                evaluate<Any?>(polyfillCode)

                // Load real crypto-js into the JS runtime before plugin code runs.
                loadCryptoJsSourceOrNull()?.let { cryptoJsSource ->
                    evaluate<Any?>(cryptoJsSource)
                }

                // Execute plugin code with module wrapper
                val wrappedCode = """
                    var module = { exports: {} };
                    var exports = module.exports;
                    $code
                """.trimIndent()
                evaluate<Any?>(wrappedCode)

                // Call getStreams and capture result
                val seasonArg = season?.toString() ?: "undefined"
                val episodeArg = episode?.toString() ?: "undefined"

                val callCode = """
                    (async function() {
                        try {
                            var getStreams = module.exports.getStreams || globalThis.getStreams;
                            if (!getStreams) {
                                __capture_result(JSON.stringify([]));
                                return;
                            }
                            var result = await getStreams("$tmdbId", "$mediaType", $seasonArg, $episodeArg);
                            __capture_result(JSON.stringify(result || []));
                        } catch (e) {
                            console.error("getStreams error:", e.message || e);
                            __capture_result(JSON.stringify([]));
                        }
                    })();
                """.trimIndent()

                evaluate<Any?>(callCode)
            }

            return parseJsonResults(resultJson)

        } catch (e: Exception) {
            Log.e(TAG, "Plugin execution failed: ${e.message}", e)
            throw e
        } finally {
            // Clean up caches
            documentCache.clear()
            elementCache.clear()
        }
    }

    private fun performNativeFetch(url: String, method: String, headersJson: String, body: String): String {
        return try {
            val headers = mutableMapOf<String, String>()
            try {
                val headersMap = gson.fromJson(headersJson, Map::class.java)
                headersMap?.forEach { (k, v) ->
                    if (k != null && v != null) {
                        val key = k.toString()
                        // If callers set Accept-Encoding manually, OkHttp will not transparently decompress.
                        // Strip it so OkHttp can negotiate and decode automatically.
                        if (!key.equals("Accept-Encoding", ignoreCase = true)) {
                            headers[key] = v.toString()
                        }
                    }
                }
            } catch (e: Exception) {
                // Ignore header parsing errors
            }

            // Default User-Agent
            if (!headers.containsKey("User-Agent")) {
                headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }

            val requestBuilder = Request.Builder()
                .url(url)
                .headers(Headers.headersOf(*headers.flatMap { listOf(it.key, it.value) }.toTypedArray()))

            when (method.uppercase()) {
                "POST" -> {
                    val contentType = headers["Content-Type"] ?: "application/x-www-form-urlencoded"
                    requestBuilder.post(body.toRequestBody(contentType.toMediaType()))
                }
                "PUT" -> {
                    val contentType = headers["Content-Type"] ?: "application/json"
                    requestBuilder.put(body.toRequestBody(contentType.toMediaType()))
                }
                "DELETE" -> requestBuilder.delete()
                else -> requestBuilder.get()
            }

            val request = requestBuilder.build()
            val response = httpClient.newCall(request).execute()

            val responseBodyBytes = response.body?.bytes() ?: ByteArray(0)
            val contentEncoding = response.header("Content-Encoding")?.lowercase()?.trim()
            val decodedBytes = try {
                when (contentEncoding) {
                    "gzip" -> GZIPInputStream(ByteArrayInputStream(responseBodyBytes)).use { it.readBytes() }
                    "deflate" -> InflaterInputStream(ByteArrayInputStream(responseBodyBytes)).use { it.readBytes() }
                    else -> responseBodyBytes
                }
            } catch (e: Exception) {
                // If decoding fails, fall back to raw bytes.
                responseBodyBytes
            }

            val charset = response.body?.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
            val responseBody = try {
                String(decodedBytes, charset)
            } catch (e: Exception) {
                String(decodedBytes, Charsets.UTF_8)
            }
            val responseHeaders = mutableMapOf<String, String>()
            response.headers.forEach { (name, value) ->
                responseHeaders[name.lowercase()] = value
            }

            val result = mapOf(
                "ok" to response.isSuccessful,
                "status" to response.code,
                "statusText" to response.message,
                "url" to response.request.url.toString(),
                "body" to responseBody,
                "headers" to responseHeaders
            )

            gson.toJson(result)
        } catch (e: Exception) {
            Log.e(TAG, "Fetch error: ${e.message}")
            gson.toJson(mapOf(
                "ok" to false,
                "status" to 0,
                "statusText" to (e.message ?: "Fetch failed"),
                "url" to url,
                "body" to "",
                "headers" to emptyMap<String, String>()
            ))
        }
    }

    private fun parseUrl(urlString: String): String {
        return try {
            val url = URL(urlString)
            gson.toJson(mapOf(
                "protocol" to "${url.protocol}:",
                "host" to if (url.port > 0) "${url.host}:${url.port}" else url.host,
                "hostname" to url.host,
                "port" to if (url.port > 0) url.port.toString() else "",
                "pathname" to (url.path ?: "/"),
                "search" to if (url.query != null) "?${url.query}" else "",
                "hash" to if (url.ref != null) "#${url.ref}" else ""
            ))
        } catch (e: Exception) {
            gson.toJson(mapOf(
                "protocol" to "",
                "host" to "",
                "hostname" to "",
                "port" to "",
                "pathname" to "/",
                "search" to "",
                "hash" to ""
            ))
        }
    }

    private fun buildPolyfillCode(scraperId: String, settingsJson: String): String {
        return """
            // Global constants (using globalThis to avoid redeclaration errors)
            globalThis.SCRAPER_ID = "$scraperId";
            globalThis.SCRAPER_SETTINGS = $settingsJson;
            if (typeof TMDB_API_KEY === 'undefined') {
                globalThis.TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
            }

            // Fetch implementation (async)
            var fetch = async function(url, options) {
                options = options || {};
                var method = (options.method || 'GET').toUpperCase();
                var headers = options.headers || {};
                var body = options.body || '';

                // Add default User-Agent
                if (!headers['User-Agent']) {
                    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
                }

                var result = await __native_fetch(url, method, JSON.stringify(headers), body);
                var parsed = JSON.parse(result);

                return {
                    ok: parsed.ok,
                    status: parsed.status,
                    statusText: parsed.statusText,
                    url: parsed.url,
                    headers: {
                        get: function(name) {
                            return parsed.headers[name.toLowerCase()] || null;
                        }
                    },
                    text: function() {
                        return Promise.resolve(parsed.body);
                    },
                    json: function() {
                        try {
                            return Promise.resolve(JSON.parse(parsed.body));
                        } catch (e) {
                            return Promise.reject(new Error('JSON parse error: ' + e.message));
                        }
                    }
                };
            };

            // URL class
            var URL = function(urlString) {
                var parsed = __parse_url(urlString);
                var data = JSON.parse(parsed);
                this.href = urlString;
                this.protocol = data.protocol;
                this.host = data.host;
                this.hostname = data.hostname;
                this.port = data.port;
                this.pathname = data.pathname;
                this.search = data.search;
                this.hash = data.hash;
            };

            // URLSearchParams class
            var URLSearchParams = function(init) {
                this._params = {};
                var self = this;
                if (init && typeof init === 'object' && !Array.isArray(init)) {
                    Object.keys(init).forEach(function(key) {
                        self._params[key] = String(init[key]);
                    });
                } else if (typeof init === 'string') {
                    init.replace(/^\?/, '').split('&').forEach(function(pair) {
                        var parts = pair.split('=');
                        if (parts[0]) {
                            self._params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
                        }
                    });
                }
            };
            URLSearchParams.prototype.toString = function() {
                var self = this;
                return Object.keys(this._params).map(function(key) {
                    return encodeURIComponent(key) + '=' + encodeURIComponent(self._params[key]);
                }).join('&');
            };
            URLSearchParams.prototype.get = function(key) {
                return this._params.hasOwnProperty(key) ? this._params[key] : null;
            };
            URLSearchParams.prototype.set = function(key, value) {
                this._params[key] = String(value);
            };
            URLSearchParams.prototype.append = function(key, value) {
                this._params[key] = String(value);
            };
            URLSearchParams.prototype.has = function(key) {
                return this._params.hasOwnProperty(key);
            };
            URLSearchParams.prototype.delete = function(key) {
                delete this._params[key];
            };

            // Cheerio implementation
            var cheerio = {
                load: function(html) {
                    var docId = __cheerio_load(html);

                    var $ = function(selector, context) {
                        // Handle $(wrapper) - return wrapper as-is
                        if (selector && selector._elementIds) {
                            return selector;
                        }
                        // Handle $(selector, context) pattern
                        if (context && context._elementIds && context._elementIds.length > 0) {
                            // Search within context element
                            var allIds = [];
                            for (var i = 0; i < context._elementIds.length; i++) {
                                var childIdsJson = __cheerio_find(docId, context._elementIds[i], selector);
                                var childIds = JSON.parse(childIdsJson);
                                allIds = allIds.concat(childIds);
                            }
                            return createCheerioWrapperFromIds(docId, allIds);
                        }
                        // Standard $(selector) call
                        return createCheerioWrapper(docId, selector);
                    };

                    $.html = function(el) {
                        if (el && el._elementIds && el._elementIds.length > 0) {
                            return __cheerio_html(docId, el._elementIds[0]);
                        }
                        return __cheerio_html(docId, '');
                    };

                    return $;
                }
            };

            function createCheerioWrapper(docId, selector) {
                var elementIds;
                if (typeof selector === 'string') {
                    var idsJson = __cheerio_select(docId, selector);
                    elementIds = JSON.parse(idsJson);
                } else {
                    elementIds = [];
                }

                var wrapper = {
                    _docId: docId,
                    _elementIds: elementIds,
                    length: elementIds.length,

                    each: function(callback) {
                        for (var i = 0; i < elementIds.length; i++) {
                            var elWrapper = createCheerioWrapperFromIds(docId, [elementIds[i]]);
                            callback.call(elWrapper, i, elWrapper);
                        }
                        return wrapper;
                    },

                    find: function(sel) {
                        var allIds = [];
                        for (var i = 0; i < elementIds.length; i++) {
                            var childIdsJson = __cheerio_find(docId, elementIds[i], sel);
                            var childIds = JSON.parse(childIdsJson);
                            allIds = allIds.concat(childIds);
                        }
                        return createCheerioWrapperFromIds(docId, allIds);
                    },

                    text: function() {
                        if (elementIds.length === 0) return '';
                        return __cheerio_text(docId, elementIds.join(','));
                    },

                    html: function() {
                        if (elementIds.length === 0) return '';
                        return __cheerio_inner_html(docId, elementIds[0]);
                    },

                    attr: function(name) {
                        if (elementIds.length === 0) return undefined;
                        var val = __cheerio_attr(docId, elementIds[0], name);
                        return val === '__UNDEFINED__' ? undefined : val;
                    },

                    first: function() {
                        return createCheerioWrapperFromIds(docId, elementIds.length > 0 ? [elementIds[0]] : []);
                    },

                    last: function() {
                        return createCheerioWrapperFromIds(docId, elementIds.length > 0 ? [elementIds[elementIds.length - 1]] : []);
                    },

                    next: function() {
                        var nextIds = [];
                        for (var i = 0; i < elementIds.length; i++) {
                            var nextId = __cheerio_next(docId, elementIds[i]);
                            if (nextId && nextId !== '__NONE__') {
                                nextIds.push(nextId);
                            }
                        }
                        return createCheerioWrapperFromIds(docId, nextIds);
                    },

                    prev: function() {
                        var prevIds = [];
                        for (var i = 0; i < elementIds.length; i++) {
                            var prevId = __cheerio_prev(docId, elementIds[i]);
                            if (prevId && prevId !== '__NONE__') {
                                prevIds.push(prevId);
                            }
                        }
                        return createCheerioWrapperFromIds(docId, prevIds);
                    },

                    eq: function(index) {
                        if (index >= 0 && index < elementIds.length) {
                            return createCheerioWrapperFromIds(docId, [elementIds[index]]);
                        }
                        return createCheerioWrapperFromIds(docId, []);
                    },

                    get: function(index) {
                        if (typeof index === 'number') {
                            if (index >= 0 && index < elementIds.length) {
                                return createCheerioWrapperFromIds(docId, [elementIds[index]]);
                            }
                            return undefined;
                        }
                        return elementIds.map(function(id) {
                            return createCheerioWrapperFromIds(docId, [id]);
                        });
                    },

                    map: function(callback) {
                        var results = [];
                        for (var i = 0; i < elementIds.length; i++) {
                            var elWrapper = createCheerioWrapperFromIds(docId, [elementIds[i]]);
                            var result = callback.call(elWrapper, i, elWrapper);
                            if (result !== undefined && result !== null) {
                                results.push(result);
                            }
                        }
                        // Return object with get() for cheerio compatibility
                        return {
                            length: results.length,
                            get: function(index) {
                                if (typeof index === 'number') {
                                    return results[index];
                                }
                                return results;
                            },
                            toArray: function() {
                                return results;
                            }
                        };
                    },

                    filter: function(selectorOrCallback) {
                        if (typeof selectorOrCallback === 'function') {
                            var filteredIds = [];
                            for (var i = 0; i < elementIds.length; i++) {
                                var elWrapper = createCheerioWrapperFromIds(docId, [elementIds[i]]);
                                var result = selectorOrCallback.call(elWrapper, i, elWrapper);
                                if (result) {
                                    filteredIds.push(elementIds[i]);
                                }
                            }
                            return createCheerioWrapperFromIds(docId, filteredIds);
                        }
                        return wrapper;
                    },

                    children: function(sel) {
                        return this.find(sel || '*');
                    },

                    parent: function() {
                        return createCheerioWrapperFromIds(docId, []);
                    },

                    toArray: function() {
                        return elementIds.map(function(id) {
                            return createCheerioWrapperFromIds(docId, [id]);
                        });
                    }
                };

                return wrapper;
            }

            function createCheerioWrapperFromIds(docId, ids) {
                var wrapper = {
                    _docId: docId,
                    _elementIds: ids,
                    length: ids.length,

                    each: function(callback) {
                        for (var i = 0; i < ids.length; i++) {
                            var elWrapper = createCheerioWrapperFromIds(docId, [ids[i]]);
                            callback.call(elWrapper, i, elWrapper);
                        }
                        return wrapper;
                    },

                    find: function(sel) {
                        var allIds = [];
                        for (var i = 0; i < ids.length; i++) {
                            var childIdsJson = __cheerio_find(docId, ids[i], sel);
                            var childIds = JSON.parse(childIdsJson);
                            allIds = allIds.concat(childIds);
                        }
                        return createCheerioWrapperFromIds(docId, allIds);
                    },

                    text: function() {
                        if (ids.length === 0) return '';
                        return __cheerio_text(docId, ids.join(','));
                    },

                    html: function() {
                        if (ids.length === 0) return '';
                        return __cheerio_inner_html(docId, ids[0]);
                    },

                    attr: function(name) {
                        if (ids.length === 0) return undefined;
                        var val = __cheerio_attr(docId, ids[0], name);
                        return val === '__UNDEFINED__' ? undefined : val;
                    },

                    first: function() {
                        return createCheerioWrapperFromIds(docId, ids.length > 0 ? [ids[0]] : []);
                    },

                    last: function() {
                        return createCheerioWrapperFromIds(docId, ids.length > 0 ? [ids[ids.length - 1]] : []);
                    },

                    next: function() {
                        var nextIds = [];
                        for (var i = 0; i < ids.length; i++) {
                            var nextId = __cheerio_next(docId, ids[i]);
                            if (nextId && nextId !== '__NONE__') {
                                nextIds.push(nextId);
                            }
                        }
                        return createCheerioWrapperFromIds(docId, nextIds);
                    },

                    prev: function() {
                        var prevIds = [];
                        for (var i = 0; i < ids.length; i++) {
                            var prevId = __cheerio_prev(docId, ids[i]);
                            if (prevId && prevId !== '__NONE__') {
                                prevIds.push(prevId);
                            }
                        }
                        return createCheerioWrapperFromIds(docId, prevIds);
                    },

                    eq: function(index) {
                        if (index >= 0 && index < ids.length) {
                            return createCheerioWrapperFromIds(docId, [ids[index]]);
                        }
                        return createCheerioWrapperFromIds(docId, []);
                    },

                    get: function(index) {
                        if (typeof index === 'number') {
                            if (index >= 0 && index < ids.length) {
                                return createCheerioWrapperFromIds(docId, [ids[index]]);
                            }
                            return undefined;
                        }
                        return ids.map(function(id) {
                            return createCheerioWrapperFromIds(docId, [id]);
                        });
                    },

                    map: function(callback) {
                        var results = [];
                        for (var i = 0; i < ids.length; i++) {
                            var elWrapper = createCheerioWrapperFromIds(docId, [ids[i]]);
                            var result = callback.call(elWrapper, i, elWrapper);
                            if (result !== undefined && result !== null) {
                                results.push(result);
                            }
                        }
                        // Return object with get() for cheerio compatibility
                        return {
                            length: results.length,
                            get: function(index) {
                                if (typeof index === 'number') {
                                    return results[index];
                                }
                                return results;
                            },
                            toArray: function() {
                                return results;
                            }
                        };
                    },

                    filter: function(selectorOrCallback) {
                        if (typeof selectorOrCallback === 'function') {
                            var filteredIds = [];
                            for (var i = 0; i < ids.length; i++) {
                                var elWrapper = createCheerioWrapperFromIds(docId, [ids[i]]);
                                var result = selectorOrCallback.call(elWrapper, i, elWrapper);
                                if (result) {
                                    filteredIds.push(ids[i]);
                                }
                            }
                            return createCheerioWrapperFromIds(docId, filteredIds);
                        }
                        return wrapper;
                    },

                    children: function(sel) {
                        return this.find(sel || '*');
                    },

                    parent: function() {
                        return createCheerioWrapperFromIds(docId, []);
                    },

                    toArray: function() {
                        return ids.map(function(id) {
                            return createCheerioWrapperFromIds(docId, [id]);
                        });
                    }
                };

                return wrapper;
            }

            // Require function for CommonJS modules
            var require = function(moduleName) {
                if (moduleName === 'cheerio' || moduleName === 'cheerio-without-node-native' || moduleName === 'react-native-cheerio') {
                    return cheerio;
                }
                if (moduleName === 'crypto-js') {
                    if (globalThis.CryptoJS) return globalThis.CryptoJS;
                    throw new Error("Module 'crypto-js' is not loaded");
                }
                throw new Error("Module '" + moduleName + "' is not available");
            };

            // Array.prototype.flat polyfill
            if (!Array.prototype.flat) {
                Array.prototype.flat = function(depth) {
                    depth = depth === undefined ? 1 : Math.floor(depth);
                    if (depth < 1) return Array.prototype.slice.call(this);
                    return (function flatten(arr, d) {
                        return d > 0
                            ? arr.reduce(function(acc, val) {
                                return acc.concat(Array.isArray(val) ? flatten(val, d - 1) : val);
                            }, [])
                            : arr.slice();
                    })(this, depth);
                };
            }

            // Array.prototype.flatMap polyfill
            if (!Array.prototype.flatMap) {
                Array.prototype.flatMap = function(callback, thisArg) {
                    return this.map(callback, thisArg).flat();
                };
            }

            // Object.entries polyfill
            if (!Object.entries) {
                Object.entries = function(obj) {
                    var result = [];
                    for (var key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            result.push([key, obj[key]]);
                        }
                    }
                    return result;
                };
            }

            // Object.fromEntries polyfill
            if (!Object.fromEntries) {
                Object.fromEntries = function(entries) {
                    var result = {};
                    for (var i = 0; i < entries.length; i++) {
                        result[entries[i][0]] = entries[i][1];
                    }
                    return result;
                };
            }

            // String.prototype.replaceAll polyfill
            if (!String.prototype.replaceAll) {
                String.prototype.replaceAll = function(search, replace) {
                    if (search instanceof RegExp) {
                        if (!search.global) {
                            throw new TypeError('replaceAll must be called with a global RegExp');
                        }
                        return this.replace(search, replace);
                    }
                    return this.split(search).join(replace);
                };
            }
        """.trimIndent()
    }

    private fun parseJsonResults(json: String): List<LocalScraperResult> {
        return try {
            val listType = object : com.google.gson.reflect.TypeToken<List<Map<String, Any?>>>() {}.type
            val results: List<Map<String, Any?>>? = gson.fromJson(json, listType)
            results?.mapNotNull { item ->
                // Handle URL - could be string or object with url property
                val urlValue = item["url"]
                val url = when (urlValue) {
                    is String -> urlValue.takeIf { it.isNotBlank() && !it.contains("[object") }
                    is Map<*, *> -> (urlValue["url"] as? String)?.takeIf { it.isNotBlank() }
                    else -> null
                } ?: return@mapNotNull null
                
                // Parse headers if present
                val headersValue = item["headers"]
                val headers: Map<String, String>? = when (headersValue) {
                    is Map<*, *> -> headersValue.entries
                        .filter { it.key is String && it.value is String }
                        .associate { (it.key as String) to (it.value as String) }
                        .takeIf { it.isNotEmpty() }
                    else -> null
                }
                
                LocalScraperResult(
                    title = item["title"]?.toString()?.takeIf { !it.contains("[object") } 
                        ?: item["name"]?.toString()?.takeIf { !it.contains("[object") } 
                        ?: "Unknown",
                    name = item["name"]?.toString()?.takeIf { !it.contains("[object") },
                    url = url,
                    quality = item["quality"]?.toString()?.takeIf { !it.contains("[object") },
                    size = item["size"]?.toString()?.takeIf { !it.contains("[object") },
                    language = item["language"]?.toString()?.takeIf { !it.contains("[object") },
                    provider = item["provider"]?.toString()?.takeIf { !it.contains("[object") },
                    type = item["type"]?.toString()?.takeIf { !it.contains("[object") },
                    seeders = (item["seeders"] as? Number)?.toInt(),
                    peers = (item["peers"] as? Number)?.toInt(),
                    infoHash = item["infoHash"]?.toString()?.takeIf { !it.contains("[object") },
                    headers = headers
                )
            }?.filter { it.url.isNotBlank() } ?: emptyList()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse results: ${e.message}")
            emptyList()
        }
    }
}
