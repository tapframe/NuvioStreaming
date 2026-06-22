package com.nuvio.app.features.plugins

import co.touchlab.kermit.Logger
import com.dokar.quickjs.binding.define
import com.dokar.quickjs.binding.function
import com.dokar.quickjs.quickJs
import com.fleeksoft.ksoup.Ksoup
import com.fleeksoft.ksoup.nodes.Document
import com.fleeksoft.ksoup.nodes.Element
import com.fleeksoft.ksoup.select.Elements
import com.nuvio.app.features.addons.httpRequestRaw
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.coroutines.runBlocking
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.generic_unknown
import org.jetbrains.compose.resources.getString
import kotlin.random.Random

private const val PLUGIN_TIMEOUT_MS = 60_000L
// Match the native HTTP layer's body cap (1 MiB) so we never truncate a
// response the native side already delivered in full. Truncating here was a
// major source of "source error" failures: any response between 256 KiB and
// 1 MiB (large HTML episode lists, embedded JSON, m3u8 manifests) was silently
// cut mid-document, which broke JSON.parse() and dropped episodes.
private const val MAX_FETCH_BODY_CHARS = 1024 * 1024
private const val MAX_FETCH_HEADER_VALUE_CHARS = 16 * 1024
private const val FETCH_TRUNCATION_SUFFIX = "\n...[truncated]"
// Per-request soft timeout so a single hung host cannot consume the whole
// plugin budget. Kept comfortably below PLUGIN_TIMEOUT_MS.
private const val PER_FETCH_TIMEOUT_MS = 30_000L

internal object PluginRuntime {
    private val log = Logger.withTag("PluginRuntime")
    private val json = Json {
        ignoreUnknownKeys = true
    }

    private val containsRegex = Regex(""":contains\([\"']([^\"']+)[\"']\)""")

    suspend fun executePlugin(
        code: String,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
        scraperId: String,
        scraperSettings: Map<String, Any> = emptyMap(),
    ): List<PluginRuntimeResult> = withContext(Dispatchers.Default) {
        withTimeout(PLUGIN_TIMEOUT_MS) {
            executePluginInternal(
                code = code,
                tmdbId = tmdbId,
                mediaType = mediaType,
                season = season,
                episode = episode,
                scraperId = scraperId,
                scraperSettings = scraperSettings,
            )
        }
    }

    private suspend fun executePluginInternal(
        code: String,
        tmdbId: String,
        mediaType: String,
        season: Int?,
        episode: Int?,
        scraperId: String,
        scraperSettings: Map<String, Any>,
    ): List<PluginRuntimeResult> {
        val documentCache = mutableMapOf<String, Document>()
        val elementCache = mutableMapOf<String, Element>()
        var idCounter = 0
        var resultJson = "[]"
        var pluginError: String? = null

        try {
            quickJs(Dispatchers.Default) {
                define("console") {
                    function("log") { args ->
                        log.d { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                        null
                    }
                    function("error") { args ->
                        log.e { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                        null
                    }
                    function("warn") { args ->
                        log.w { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                        null
                    }
                    function("info") { args ->
                        log.i { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                        null
                    }
                    function("debug") { args ->
                        log.d { "Plugin:$scraperId ${args.joinToString(" ") { it?.toString() ?: "null" }}" }
                        null
                    }
                }

                function("__native_fetch") { args ->
                    val url = args.getOrNull(0)?.toString() ?: ""
                    val method = args.getOrNull(1)?.toString() ?: "GET"
                    val headersJson = args.getOrNull(2)?.toString() ?: "{}"
                    val body = args.getOrNull(3)?.toString() ?: ""
                    val followRedirects = args.getOrNull(4) as? Boolean ?: true
                    try {
                        performNativeFetch(url, method, headersJson, body, followRedirects)
                    } catch (t: Throwable) {
                        log.e(t) { "Fetch bridge error for $method $url" }
                        JsonObject(
                            mapOf(
                                "ok" to JsonPrimitive(false),
                                "status" to JsonPrimitive(0),
                                "statusText" to JsonPrimitive(t.message ?: "Fetch failed"),
                                "url" to JsonPrimitive(url),
                                "body" to JsonPrimitive(""),
                                "headers" to JsonObject(emptyMap()),
                            ),
                        ).toString()
                    }
                }

                function("__crypto_digest_hex") { args ->
                    val algorithm = args.getOrNull(0)?.toString() ?: "SHA256"
                    val data = args.getOrNull(1)?.toString() ?: ""
                    runCatching {
                        pluginDigestHex(algorithm, data)
                    }.getOrDefault("")
                }

                function("__crypto_hmac_hex") { args ->
                    val algorithm = args.getOrNull(0)?.toString() ?: "SHA256"
                    val key = args.getOrNull(1)?.toString() ?: ""
                    val data = args.getOrNull(2)?.toString() ?: ""
                    runCatching {
                        pluginHmacHex(algorithm, key, data)
                    }.getOrDefault("")
                }

                function("__crypto_base64_encode") { args ->
                    val data = args.getOrNull(0)?.toString() ?: ""
                    runCatching {
                        pluginBase64Encode(data)
                    }.getOrDefault("")
                }

                function("__crypto_base64_decode") { args ->
                    val data = args.getOrNull(0)?.toString() ?: ""
                    runCatching {
                        pluginBase64Decode(data)
                    }.getOrDefault("")
                }

                function("__crypto_utf8_to_hex") { args ->
                    val data = args.getOrNull(0)?.toString() ?: ""
                    runCatching {
                        pluginUtf8ToHex(data)
                    }.getOrDefault("")
                }

                function("__crypto_hex_to_utf8") { args ->
                    val data = args.getOrNull(0)?.toString() ?: ""
                    runCatching {
                        pluginHexToUtf8(data)
                    }.getOrDefault("")
                }

                function("__parse_url") { args ->
                    parseUrl(args.getOrNull(0)?.toString() ?: "")
                }

                function("__cheerio_load") { args ->
                    val html = args.getOrNull(0)?.toString() ?: ""
                    val docId = "doc_${idCounter++}_${Random.nextInt(0, Int.MAX_VALUE)}"
                    documentCache[docId] = Ksoup.parse(html)
                    docId
                }

                function("__cheerio_select") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    var selector = args.getOrNull(1)?.toString() ?: ""
                    val doc = documentCache[docId] ?: return@function "[]"
                    try {
                        selector = selector.replace(containsRegex, ":contains($1)")
                        val elements = if (selector.isEmpty()) Elements() else doc.select(selector)
                        val ids = elements.mapIndexed { index, el ->
                            val id = "$docId:$index:${el.hashCode()}"
                            elementCache[id] = el
                            id
                        }
                        "[" + ids.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" } + "]"
                    } catch (_: Exception) {
                        "[]"
                    }
                }

                function("__cheerio_find") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    var selector = args.getOrNull(2)?.toString() ?: ""
                    val element = elementCache[elementId] ?: return@function "[]"
                    try {
                        selector = selector.replace(containsRegex, ":contains($1)")
                        val elements = element.select(selector)
                        val ids = elements.mapIndexed { index, el ->
                            val id = "$docId:find:$index:${el.hashCode()}"
                            elementCache[id] = el
                            id
                        }
                        "[" + ids.joinToString(",") { "\"${it.replace("\"", "\\\"")}\"" } + "]"
                    } catch (_: Exception) {
                        "[]"
                    }
                }

                function("__cheerio_text") { args ->
                    val elementIds = args.getOrNull(1)?.toString() ?: ""
                    elementIds.split(",")
                        .filter { it.isNotEmpty() }
                        .mapNotNull { elementCache[it]?.text() }
                        .joinToString(" ")
                }

                function("__cheerio_html") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    if (elementId.isEmpty()) {
                        documentCache[docId]?.html() ?: ""
                    } else {
                        elementCache[elementId]?.html() ?: ""
                    }
                }

                function("__cheerio_inner_html") { args ->
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    elementCache[elementId]?.html() ?: ""
                }

                function("__cheerio_attr") { args ->
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    val attrName = args.getOrNull(2)?.toString() ?: ""
                    val value = elementCache[elementId]?.attr(attrName)
                    if (value.isNullOrEmpty()) "__UNDEFINED__" else value
                }

                function("__cheerio_next") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    val element = elementCache[elementId] ?: return@function "__NONE__"
                    val next = element.nextElementSibling() ?: return@function "__NONE__"
                    val nextId = "$docId:next:${next.hashCode()}"
                    elementCache[nextId] = next
                    nextId
                }

                function("__cheerio_prev") { args ->
                    val docId = args.getOrNull(0)?.toString() ?: ""
                    val elementId = args.getOrNull(1)?.toString() ?: ""
                    val element = elementCache[elementId] ?: return@function "__NONE__"
                    val prev = element.previousElementSibling() ?: return@function "__NONE__"
                    val prevId = "$docId:prev:${prev.hashCode()}"
                    elementCache[prevId] = prev
                    prevId
                }

                function("__capture_result") { args ->
                    resultJson = args.getOrNull(0)?.toString() ?: "[]"
                    null
                }

                function("__capture_error") { args ->
                    val message = args.getOrNull(0)?.toString()?.takeIf { it.isNotBlank() && it != "null" && it != "undefined" }
                    if (!message.isNullOrBlank()) {
                        pluginError = message
                    }
                    null
                }

                val settingsJson = toJsonElement(scraperSettings).toString()
                val polyfillCode = buildPolyfillCode(scraperId, settingsJson)
                evaluate<Any?>(polyfillCode)

                val wrappedCode = """
                    var module = { exports: {} };
                    var exports = module.exports;
                    (function() {
                        $code
                    })();
                """.trimIndent()
                evaluate<Any?>(wrappedCode)

                val seasonArg = season?.toString() ?: "undefined"
                val episodeArg = episode?.toString() ?: "undefined"
                val callCode = """
                    (async function() {
                        try {
                            var getStreams = module.exports.getStreams || globalThis.getStreams;
                            if (!getStreams) {
                                console.error("getStreams function not found on module.exports or globalThis");
                                __capture_error("Plugin does not export a getStreams() function");
                                __capture_result(JSON.stringify([]));
                                return;
                            }
                            var result = await getStreams("$tmdbId", "$mediaType", $seasonArg, $episodeArg);
                            __capture_result(JSON.stringify(result || []));
                        } catch (e) {
                            var msg = e && e.message ? e.message : (e ? String(e) : "Unknown error");
                            console.error("getStreams error:", msg, e && e.stack ? e.stack : "");
                            __capture_error(msg);
                            __capture_result(JSON.stringify([]));
                        }
                    })();
                """.trimIndent()
                evaluate<Any?>(callCode)
            }

            val capturedError = pluginError
            if (capturedError != null) {
                // Surface the real JS failure to the caller so the UI can show a
                // meaningful "source error" instead of a generic empty result.
                throw PluginExecutionException(capturedError)
            }
            return parseJsonResults(resultJson)
        } finally {
            documentCache.clear()
            elementCache.clear()
        }
    }

    private fun performNativeFetch(
        url: String,
        method: String,
        headersJson: String,
        body: String,
        followRedirects: Boolean,
    ): String {
        return try {
            val headers = parseHeaders(headersJson).toMutableMap()
            if (!headers.containsKey("User-Agent")) {
                headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }

            val response = runBlocking {
                withTimeout(PER_FETCH_TIMEOUT_MS) {
                    httpRequestRaw(
                        method = method,
                        url = url,
                        headers = headers,
                        body = body,
                        followRedirects = followRedirects,
                    )
                }
            }

            val responseHeaders = response.headers.mapValues { (_, value) ->
                truncateString(value, MAX_FETCH_HEADER_VALUE_CHARS)
            }
            val result = JsonObject(
                mapOf(
                    "ok" to JsonPrimitive(response.status in 200..299),
                    "status" to JsonPrimitive(response.status),
                    "statusText" to JsonPrimitive(response.statusText),
                    "url" to JsonPrimitive(response.url),
                    "redirected" to JsonPrimitive(response.url.isNotBlank() && response.url != url),
                    "body" to JsonPrimitive(truncateString(response.body, MAX_FETCH_BODY_CHARS)),
                    "headers" to JsonObject(responseHeaders.mapValues { JsonPrimitive(it.value) }),
                ),
            )
            result.toString()
        } catch (error: Throwable) {
            log.e(error) { "Fetch error for $method $url" }
            JsonObject(
                mapOf(
                    "ok" to JsonPrimitive(false),
                    "status" to JsonPrimitive(0),
                    "statusText" to JsonPrimitive(error.message ?: "Fetch failed"),
                    "url" to JsonPrimitive(url),
                    "body" to JsonPrimitive(""),
                    "headers" to JsonObject(emptyMap()),
                ),
            )
                .toString()
        }
    }

    private fun parseHeaders(headersJson: String): Map<String, String> {
        return runCatching {
            val obj = json.parseToJsonElement(headersJson) as? JsonObject ?: JsonObject(emptyMap())
            obj.entries
                .mapNotNull { (key, value) ->
                    val headerValue = when (value) {
                        // Common case: { "Header": "value" }
                        is JsonPrimitive -> value.contentOrNull
                        // Some plugins pass { "Header": ["a", "b"] }
                        is JsonArray -> value
                            .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
                            .takeIf { it.isNotEmpty() }
                            ?.joinToString(", ")
                        else -> null
                    }
                    val trimmedKey = key.trim()
                    if (trimmedKey.isBlank() || headerValue.isNullOrBlank()) {
                        null
                    } else {
                        trimmedKey to headerValue
                    }
                }
                .toMap()
        }.getOrDefault(emptyMap())
    }

    private fun parseUrl(urlString: String): String {
        return try {
            val parsed = io.ktor.http.Url(urlString)
            JsonObject(
                mapOf(
                    "protocol" to JsonPrimitive("${parsed.protocol.name}:"),
                    "host" to JsonPrimitive(
                        if (parsed.port != parsed.protocol.defaultPort) {
                            "${parsed.host}:${parsed.port}"
                        } else {
                            parsed.host
                        },
                    ),
                    "hostname" to JsonPrimitive(parsed.host),
                    "port" to JsonPrimitive(
                        if (parsed.port != parsed.protocol.defaultPort) parsed.port.toString() else "",
                    ),
                    "pathname" to JsonPrimitive(parsed.encodedPath.ifBlank { "/" }),
                    "search" to JsonPrimitive(parsed.encodedQuery?.let { "?$it" } ?: ""),
                    "hash" to JsonPrimitive(parsed.encodedFragment?.let { "#$it" } ?: ""),
                ),
            ).toString()
        } catch (_: Exception) {
            JsonObject(
                mapOf(
                    "protocol" to JsonPrimitive(""),
                    "host" to JsonPrimitive(""),
                    "hostname" to JsonPrimitive(""),
                    "port" to JsonPrimitive(""),
                    "pathname" to JsonPrimitive("/"),
                    "search" to JsonPrimitive(""),
                    "hash" to JsonPrimitive(""),
                ),
            ).toString()
        }
    }

    private fun truncateString(value: String, maxChars: Int): String {
        if (value.length <= maxChars) return value
        val end = maxChars - FETCH_TRUNCATION_SUFFIX.length
        if (end <= 0) return FETCH_TRUNCATION_SUFFIX.take(maxChars)
        return value.substring(0, end) + FETCH_TRUNCATION_SUFFIX
    }

    private fun parseJsonResults(rawJson: String): List<PluginRuntimeResult> {
        return runCatching {
            val array = json.parseToJsonElement(rawJson) as? JsonArray ?: return emptyList()
            array.mapNotNull { element ->
                val item = element as? JsonObject ?: return@mapNotNull null
                val url = when (val urlValue = item["url"]) {
                    is JsonPrimitive -> urlValue.contentOrNull?.takeIf { it.isNotBlank() }
                    is JsonObject -> urlValue["url"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
                    else -> null
                } ?: return@mapNotNull null

                val headers = (item["headers"] as? JsonObject)
                    ?.mapNotNull { (key, value) ->
                        value.jsonPrimitive.contentOrNull?.let { key to it }
                    }
                    ?.toMap()
                    ?.takeIf { it.isNotEmpty() }

                PluginRuntimeResult(
                    title = item.stringOrNull("title") ?: item.stringOrNull("name") ?: runBlocking { getString(Res.string.generic_unknown) },
                    name = item.stringOrNull("name"),
                    url = url,
                    quality = item.stringOrNull("quality"),
                    size = item.stringOrNull("size"),
                    language = item.stringOrNull("language"),
                    provider = item.stringOrNull("provider"),
                    type = item.stringOrNull("type"),
                    seeders = item["seeders"]?.jsonPrimitive?.intOrNull,
                    peers = item["peers"]?.jsonPrimitive?.intOrNull,
                    infoHash = item.stringOrNull("infoHash"),
                    headers = headers,
                )
            }.filter { it.url.isNotBlank() }
        }.getOrElse { error ->
            log.e(error) { "Failed to parse plugin result json" }
            emptyList()
        }
    }

    private fun JsonObject.stringOrNull(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() && !it.contains("[object") }

    private fun toJsonElement(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is JsonElement -> value
        is String -> JsonPrimitive(value)
        is Boolean -> JsonPrimitive(value)
        is Int -> JsonPrimitive(value)
        is Long -> JsonPrimitive(value)
        is Float -> JsonPrimitive(value)
        is Double -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value.toDouble())
        is Map<*, *> -> JsonObject(
            value.entries
                .filter { it.key is String }
                .associate { (it.key as String) to toJsonElement(it.value) },
        )
        is Iterable<*> -> JsonArray(value.map(::toJsonElement))
        else -> JsonPrimitive(value.toString())
    }

    private fun buildPolyfillCode(scraperId: String, settingsJson: String): String {
        return """
            globalThis.SCRAPER_ID = "$scraperId";
            globalThis.SCRAPER_SETTINGS = $settingsJson;
            if (typeof globalThis.global === 'undefined') globalThis.global = globalThis;
            if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
            if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;

            // ---- Timer / scheduling polyfills ----------------------------------
            // QuickJS does not expose setTimeout/setInterval. Many scrapers call
            // these (often as a "sleep"/debounce or to schedule retries). Without
            // them the plugin throws "setTimeout is not defined" -> source error.
            // We run the callback synchronously after resolving the (ignored) delay
            // via a microtask so ordering stays reasonable inside the event loop.
            if (typeof globalThis.setTimeout === 'undefined') {
                globalThis.setTimeout = function(callback, delay) {
                    var args = Array.prototype.slice.call(arguments, 2);
                    if (typeof callback === 'function') {
                        Promise.resolve().then(function() {
                            try { callback.apply(null, args); } catch (e) { console.error('setTimeout callback error:', e && e.message ? e.message : e); }
                        });
                    }
                    return 0;
                };
            }
            if (typeof globalThis.clearTimeout === 'undefined') {
                globalThis.clearTimeout = function() {};
            }
            if (typeof globalThis.setInterval === 'undefined') {
                // No real interval timer; run once to avoid breaking call sites.
                globalThis.setInterval = function(callback) {
                    if (typeof callback === 'function') {
                        Promise.resolve().then(function() {
                            try { callback(); } catch (e) {}
                        });
                    }
                    return 0;
                };
            }
            if (typeof globalThis.clearInterval === 'undefined') {
                globalThis.clearInterval = function() {};
            }
            if (typeof globalThis.queueMicrotask === 'undefined') {
                globalThis.queueMicrotask = function(callback) {
                    Promise.resolve().then(callback);
                };
            }
            // A real async delay scrapers can await: "await sleep(ms)".
            if (typeof globalThis.sleep === 'undefined') {
                globalThis.sleep = function(ms) {
                    return new Promise(function(resolve) { setTimeout(resolve, ms || 0); });
                };
            }

            // ---- Promise combinator polyfills ----------------------------------
            // Promise.allSettled / Promise.any are heavily used by multi-server
            // scrapers to probe several mirrors in parallel. A missing combinator
            // means the whole getStreams() rejects and the source shows an error.
            if (typeof Promise.allSettled !== 'function') {
                Promise.allSettled = function(promises) {
                    return Promise.all(Array.prototype.map.call(promises, function(p) {
                        return Promise.resolve(p).then(
                            function(value) { return { status: 'fulfilled', value: value }; },
                            function(reason) { return { status: 'rejected', reason: reason }; }
                        );
                    }));
                };
            }
            if (typeof Promise.any !== 'function') {
                Promise.any = function(promises) {
                    return new Promise(function(resolve, reject) {
                        var list = Array.prototype.slice.call(promises);
                        var remaining = list.length;
                        var errors = [];
                        if (remaining === 0) { reject(new Error('All promises were rejected')); return; }
                        list.forEach(function(p, i) {
                            Promise.resolve(p).then(resolve, function(err) {
                                errors[i] = err;
                                remaining--;
                                if (remaining === 0) reject(new Error('All promises were rejected'));
                            });
                        });
                    });
                };
            }

            var fetch = async function(url, options) {
                options = options || {};
                var method = (options.method || 'GET').toUpperCase();
                var headers = options.headers || {};
                var body = options.body || '';
                var followRedirects = options.redirect !== 'manual';
                var result = __native_fetch(url, method, JSON.stringify(headers), body, followRedirects);
                var parsed = JSON.parse(result);
                var __rawHeaders = parsed.headers || {};
                var __headers = {
                    get: function(name) {
                        if (name == null) return null;
                        var key = String(name).toLowerCase();
                        var v = __rawHeaders[key];
                        return (v === undefined || v === null) ? null : v;
                    },
                    has: function(name) {
                        if (name == null) return false;
                        return Object.prototype.hasOwnProperty.call(__rawHeaders, String(name).toLowerCase());
                    },
                    forEach: function(callback, thisArg) {
                        for (var k in __rawHeaders) {
                            if (Object.prototype.hasOwnProperty.call(__rawHeaders, k)) {
                                callback.call(thisArg, __rawHeaders[k], k, __headers);
                            }
                        }
                    },
                    keys: function() { return Object.keys(__rawHeaders); },
                    entries: function() {
                        return Object.keys(__rawHeaders).map(function(k) { return [k, __rawHeaders[k]]; });
                    },
                    raw: function() { return __rawHeaders; }
                };
                return {
                    ok: parsed.ok,
                    status: parsed.status,
                    statusText: parsed.statusText,
                    url: parsed.url,
                    redirected: parsed.redirected === true,
                    headers: __headers,
                    text: function() { return Promise.resolve(parsed.body); },
                    json: function() {
                        try {
                            if (parsed.body === null || parsed.body === undefined || parsed.body === '') {
                                return Promise.resolve(null);
                            }
                            return Promise.resolve(JSON.parse(parsed.body));
                        } catch (e) {
                            return Promise.reject(new Error('Failed to parse JSON response: ' + (e && e.message ? e.message : e)));
                        }
                    },
                    clone: function() { return this; }
                };
            };

            if (typeof AbortSignal === 'undefined') {
                var AbortSignal = function() { this.aborted = false; this.reason = undefined; this._listeners = []; };
                AbortSignal.prototype.addEventListener = function(type, listener) {
                    if (type !== 'abort' || typeof listener !== 'function') return;
                    this._listeners.push(listener);
                };
                AbortSignal.prototype.removeEventListener = function(type, listener) {
                    if (type !== 'abort') return;
                    this._listeners = this._listeners.filter(function(l) { return l !== listener; });
                };
                AbortSignal.prototype.dispatchEvent = function(event) {
                    if (!event || event.type !== 'abort') return true;
                    for (var i = 0; i < this._listeners.length; i++) {
                        try { this._listeners[i].call(this, event); } catch (e) {}
                    }
                    return true;
                };
                globalThis.AbortSignal = AbortSignal;
            }

            if (typeof AbortController === 'undefined') {
                var AbortController = function() { this.signal = new AbortSignal(); };
                AbortController.prototype.abort = function(reason) {
                    if (this.signal.aborted) return;
                    this.signal.aborted = true;
                    this.signal.reason = reason;
                    this.signal.dispatchEvent({ type: 'abort' });
                };
                globalThis.AbortController = AbortController;
            }

            if (typeof atob === 'undefined') {
                globalThis.atob = function(input) {
                    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
                    var str = String(input).replace(/=+$/, '');
                    if (str.length % 4 === 1) throw new Error('InvalidCharacterError');
                    var output = '';
                    var bc = 0, bs, buffer, idx = 0;
                    while ((buffer = str.charAt(idx++))) {
                        buffer = chars.indexOf(buffer);
                        if (buffer === -1) continue;
                        bs = bc % 4 ? bs * 64 + buffer : buffer;
                        if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
                    }
                    return output;
                };
            }

            if (typeof btoa === 'undefined') {
                globalThis.btoa = function(input) {
                    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
                    var str = String(input);
                    var output = '';
                    for (var block, charCode, idx = 0, map = chars;
                         str.charAt(idx | 0) || (map = '=', idx % 1);
                         output += map.charAt(63 & (block >> (8 - (idx % 1) * 8)))) {
                        charCode = str.charCodeAt(idx += 3 / 4);
                        if (charCode > 0xFF) throw new Error('InvalidCharacterError');
                        block = (block << 8) | charCode;
                    }
                    return output;
                };
            }

            var URL = function(urlString, base) {
                var fullUrl = urlString;
                if (base && !/^https?:\/\//i.test(urlString)) {
                    var b = typeof base === 'string' ? base : base.href;
                    if (urlString.charAt(0) === '/') {
                        var m = b.match(/^(https?:\/\/[^\/]+)/);
                        fullUrl = m ? m[1] + urlString : urlString;
                    } else {
                        fullUrl = b.replace(/\/[^\/]*$/, '/') + urlString;
                    }
                }
                var parsed = __parse_url(fullUrl);
                var data = JSON.parse(parsed);
                this.href = fullUrl;
                this.protocol = data.protocol;
                this.host = data.host;
                this.hostname = data.hostname;
                this.port = data.port;
                this.pathname = data.pathname;
                this.search = data.search;
                this.hash = data.hash;
                this.origin = data.protocol + '//' + data.host;
                this.searchParams = new URLSearchParams(data.search || '');
            };
            URL.prototype.toString = function() { return this.href; };

            var URLSearchParams = function(init) {
                this._params = {};
                var self = this;
                if (init && typeof init === 'object' && !Array.isArray(init)) {
                    Object.keys(init).forEach(function(key) { self._params[key] = String(init[key]); });
                } else if (typeof init === 'string') {
                    init.replace(/^\?/, '').split('&').forEach(function(pair) {
                        var parts = pair.split('=');
                        if (parts[0]) self._params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
                    });
                }
            };
            URLSearchParams.prototype.toString = function() {
                var self = this;
                return Object.keys(this._params).map(function(key) {
                    return encodeURIComponent(key) + '=' + encodeURIComponent(self._params[key]);
                }).join('&');
            };
            URLSearchParams.prototype.get = function(key) { return this._params.hasOwnProperty(key) ? this._params[key] : null; };
            URLSearchParams.prototype.set = function(key, value) { this._params[key] = String(value); };
            URLSearchParams.prototype.append = function(key, value) { this._params[key] = String(value); };
            URLSearchParams.prototype.has = function(key) { return this._params.hasOwnProperty(key); };
            URLSearchParams.prototype.delete = function(key) { delete this._params[key]; };
            URLSearchParams.prototype.keys = function() { return Object.keys(this._params); };
            URLSearchParams.prototype.values = function() {
                var self = this;
                return Object.keys(this._params).map(function(k) { return self._params[k]; });
            };
            URLSearchParams.prototype.entries = function() {
                var self = this;
                return Object.keys(this._params).map(function(k) { return [k, self._params[k]]; });
            };
            URLSearchParams.prototype.forEach = function(callback) {
                var self = this;
                Object.keys(this._params).forEach(function(key) { callback(self._params[key], key, self); });
            };
            URLSearchParams.prototype.getAll = function(key) {
                return this._params.hasOwnProperty(key) ? [this._params[key]] : [];
            };
            URLSearchParams.prototype.sort = function() {
                var sorted = {};
                var self = this;
                Object.keys(this._params).sort().forEach(function(k) { sorted[k] = self._params[k]; });
                this._params = sorted;
            };

            function __hexToWords(hex) {
                var words = [];
                for (var i = 0; i < hex.length; i += 8) {
                    var chunk = hex.substring(i, i + 8);
                    while (chunk.length < 8) chunk += '0';
                    words.push(parseInt(chunk, 16) | 0);
                }
                return words;
            }

            function __wordsToHex(words, sigBytes) {
                var hex = '';
                for (var i = 0; i < sigBytes; i++) {
                    var word = words[i >>> 2] || 0;
                    var byte = (word >>> (24 - (i % 4) * 8)) & 0xff;
                    var part = byte.toString(16);
                    if (part.length < 2) part = '0' + part;
                    hex += part;
                }
                return hex;
            }

            function __wordArrayToHex(value) {
                if (!value) return '';
                if (typeof value.__hex === 'string') return value.__hex.toLowerCase();
                if (Array.isArray(value.words) && typeof value.sigBytes === 'number') {
                    return __wordsToHex(value.words, value.sigBytes);
                }
                return __crypto_utf8_to_hex(String(value));
            }

            function __buildWordArray(hex, utf8Override) {
                var normalizedHex = (hex || '').toLowerCase();
                if (normalizedHex.length % 2 !== 0) normalizedHex = '0' + normalizedHex;
                var wordArray = {
                    __hex: normalizedHex,
                    __utf8: utf8Override !== undefined ? utf8Override : __crypto_hex_to_utf8(normalizedHex),
                    sigBytes: normalizedHex.length / 2,
                    words: __hexToWords(normalizedHex),
                    toString: function(encoder) {
                        if (!encoder || encoder === CryptoJS.enc.Hex) return this.__hex;
                        if (encoder === CryptoJS.enc.Utf8) return this.__utf8;
                        if (encoder === CryptoJS.enc.Base64) return __crypto_base64_encode(this.__utf8);
                        return this.__hex;
                    },
                    clamp: function() {
                        return this;
                    },
                    concat: function(other) {
                        var otherHex = __wordArrayToHex(other);
                        this.__hex += otherHex;
                        this.__utf8 = __crypto_hex_to_utf8(this.__hex);
                        this.sigBytes = this.__hex.length / 2;
                        this.words = __hexToWords(this.__hex);
                        return this;
                    }
                };
                return wordArray;
            }

            function __wordArrayFromHex(hex) {
                return __buildWordArray(hex, undefined);
            }

            function __wordArrayFromUtf8(text) {
                var utf8 = text == null ? '' : String(text);
                return __buildWordArray(__crypto_utf8_to_hex(utf8), utf8);
            }

            function __wordArrayFromBase64(base64) {
                return __wordArrayFromUtf8(__crypto_base64_decode(base64 || ''));
            }

            function __normalizeWordArrayInput(value) {
                if (value && typeof value === 'object' && typeof value.__utf8 === 'string') {
                    return value.__utf8;
                }
                if (value && typeof value === 'object' && typeof value.__hex === 'string') {
                    return __crypto_hex_to_utf8(value.__hex);
                }
                if (value && typeof value === 'object' && Array.isArray(value.words) && typeof value.sigBytes === 'number') {
                    return __crypto_hex_to_utf8(__wordsToHex(value.words, value.sigBytes));
                }
                if (value == null) return '';
                return String(value);
            }

            function __cryptoHashWordArray(algorithm, message) {
                var utf8 = __normalizeWordArrayInput(message);
                var hex = __crypto_digest_hex(algorithm, utf8);
                return __wordArrayFromHex(hex);
            }

            function __cryptoHmacWordArray(algorithm, message, key) {
                var utf8Message = __normalizeWordArrayInput(message);
                var utf8Key = __normalizeWordArrayInput(key);
                var hex = __crypto_hmac_hex(algorithm, utf8Key, utf8Message);
                return __wordArrayFromHex(hex);
            }

            var CryptoJS = {
                enc: {
                    Hex: {
                        stringify: function(wordArray) {
                            return __wordArrayToHex(wordArray);
                        },
                        parse: function(hexStr) {
                            return __wordArrayFromHex(hexStr || '');
                        }
                    },
                    Utf8: {
                        stringify: function(wordArray) {
                            if (wordArray && typeof wordArray.__utf8 === 'string') return wordArray.__utf8;
                            if (wordArray && typeof wordArray.__hex === 'string') return __crypto_hex_to_utf8(wordArray.__hex);
                            return __normalizeWordArrayInput(wordArray);
                        },
                        parse: function(text) {
                            return __wordArrayFromUtf8(text);
                        }
                    },
                    Base64: {
                        stringify: function(wordArray) {
                            if (wordArray && typeof wordArray.__utf8 === 'string') {
                                return __crypto_base64_encode(wordArray.__utf8);
                            }
                            return __crypto_base64_encode(__normalizeWordArrayInput(wordArray));
                        },
                        parse: function(base64) {
                            return __wordArrayFromBase64(base64);
                        }
                    }
                },
                MD5: function(message) { return __cryptoHashWordArray('MD5', message); },
                SHA1: function(message) { return __cryptoHashWordArray('SHA1', message); },
                SHA256: function(message) { return __cryptoHashWordArray('SHA256', message); },
                SHA512: function(message) { return __cryptoHashWordArray('SHA512', message); },
                HmacMD5: function(message, key) { return __cryptoHmacWordArray('MD5', message, key); },
                HmacSHA1: function(message, key) { return __cryptoHmacWordArray('SHA1', message, key); },
                HmacSHA256: function(message, key) { return __cryptoHmacWordArray('SHA256', message, key); },
                HmacSHA512: function(message, key) { return __cryptoHmacWordArray('SHA512', message, key); }
            };
            globalThis.CryptoJS = CryptoJS;

            var cheerio = {
                load: function(html) {
                    var docId = __cheerio_load(html);
                    var $ = function(selector, context) {
                        if (selector && selector._elementIds) return selector;
                        if (context && context._elementIds && context._elementIds.length > 0) {
                            var allIds = [];
                            for (var i = 0; i < context._elementIds.length; i++) {
                                var childIdsJson = __cheerio_find(docId, context._elementIds[i], selector);
                                var childIds = JSON.parse(childIdsJson);
                                allIds = allIds.concat(childIds);
                            }
                            return createCheerioWrapperFromIds(docId, allIds);
                        }
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
                return createCheerioWrapperFromIds(docId, elementIds);
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
                    first: function() { return createCheerioWrapperFromIds(docId, ids.length > 0 ? [ids[0]] : []); },
                    last: function() { return createCheerioWrapperFromIds(docId, ids.length > 0 ? [ids[ids.length - 1]] : []); },
                    next: function() {
                        var nextIds = [];
                        for (var i = 0; i < ids.length; i++) {
                            var nextId = __cheerio_next(docId, ids[i]);
                            if (nextId && nextId !== '__NONE__') nextIds.push(nextId);
                        }
                        return createCheerioWrapperFromIds(docId, nextIds);
                    },
                    prev: function() {
                        var prevIds = [];
                        for (var i = 0; i < ids.length; i++) {
                            var prevId = __cheerio_prev(docId, ids[i]);
                            if (prevId && prevId !== '__NONE__') prevIds.push(prevId);
                        }
                        return createCheerioWrapperFromIds(docId, prevIds);
                    },
                    eq: function(index) {
                        if (index >= 0 && index < ids.length) return createCheerioWrapperFromIds(docId, [ids[index]]);
                        return createCheerioWrapperFromIds(docId, []);
                    },
                    get: function(index) {
                        if (typeof index === 'number') {
                            if (index >= 0 && index < ids.length) return createCheerioWrapperFromIds(docId, [ids[index]]);
                            return undefined;
                        }
                        return ids.map(function(id) { return createCheerioWrapperFromIds(docId, [id]); });
                    },
                    map: function(callback) {
                        var results = [];
                        for (var i = 0; i < ids.length; i++) {
                            var elWrapper = createCheerioWrapperFromIds(docId, [ids[i]]);
                            var result = callback.call(elWrapper, i, elWrapper);
                            if (result !== undefined && result !== null) results.push(result);
                        }
                        return {
                            length: results.length,
                            get: function(index) { return typeof index === 'number' ? results[index] : results; },
                            toArray: function() { return results; }
                        };
                    },
                    filter: function(selectorOrCallback) {
                        if (typeof selectorOrCallback === 'function') {
                            var filteredIds = [];
                            for (var i = 0; i < ids.length; i++) {
                                var elWrapper = createCheerioWrapperFromIds(docId, [ids[i]]);
                                var result = selectorOrCallback.call(elWrapper, i, elWrapper);
                                if (result) filteredIds.push(ids[i]);
                            }
                            return createCheerioWrapperFromIds(docId, filteredIds);
                        }
                        return wrapper;
                    },
                    children: function(sel) { return this.find(sel || '*'); },
                    parent: function() { return createCheerioWrapperFromIds(docId, []); },
                    toArray: function() { return ids.map(function(id) { return createCheerioWrapperFromIds(docId, [id]); }); }
                };
                return wrapper;
            }

            var require = function(moduleName) {
                if (moduleName === 'cheerio' || moduleName === 'cheerio-without-node-native' || moduleName === 'react-native-cheerio') {
                    return cheerio;
                }
                if (moduleName === 'crypto-js') {
                    return CryptoJS;
                }
                throw new Error("Module '" + moduleName + "' is not available");
            };

            if (!Array.prototype.flat) {
                Array.prototype.flat = function(depth) {
                    depth = depth === undefined ? 1 : Math.floor(depth);
                    if (depth < 1) return Array.prototype.slice.call(this);
                    return (function flatten(arr, d) {
                        return d > 0
                            ? arr.reduce(function(acc, val) { return acc.concat(Array.isArray(val) ? flatten(val, d - 1) : val); }, [])
                            : arr.slice();
                    })(this, depth);
                };
            }

            if (!Array.prototype.flatMap) {
                Array.prototype.flatMap = function(callback, thisArg) { return this.map(callback, thisArg).flat(); };
            }

            if (!Object.entries) {
                Object.entries = function(obj) {
                    var result = [];
                    for (var key in obj) {
                        if (obj.hasOwnProperty(key)) result.push([key, obj[key]]);
                    }
                    return result;
                };
            }

            if (!Object.fromEntries) {
                Object.fromEntries = function(entries) {
                    var result = {};
                    for (var i = 0; i < entries.length; i++) {
                        result[entries[i][0]] = entries[i][1];
                    }
                    return result;
                };
            }

            if (!String.prototype.replaceAll) {
                String.prototype.replaceAll = function(search, replace) {
                    if (search instanceof RegExp) {
                        if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
                        return this.replace(search, replace);
                    }
                    return this.split(search).join(replace);
                };
            }

            if (!String.prototype.padStart) {
                String.prototype.padStart = function(targetLength, padString) {
                    targetLength = targetLength >> 0;
                    padString = String(typeof padString !== 'undefined' ? padString : ' ');
                    if (this.length >= targetLength || padString.length === 0) return String(this);
                    var pad = '';
                    while (pad.length < targetLength - this.length) pad += padString;
                    return pad.slice(0, targetLength - this.length) + String(this);
                };
            }
            if (!String.prototype.padEnd) {
                String.prototype.padEnd = function(targetLength, padString) {
                    targetLength = targetLength >> 0;
                    padString = String(typeof padString !== 'undefined' ? padString : ' ');
                    if (this.length >= targetLength || padString.length === 0) return String(this);
                    var pad = '';
                    while (pad.length < targetLength - this.length) pad += padString;
                    return String(this) + pad.slice(0, targetLength - this.length);
                };
            }
            if (!String.prototype.trimStart) {
                String.prototype.trimStart = function() { return this.replace(/^\s+/, ''); };
            }
            if (!String.prototype.trimEnd) {
                String.prototype.trimEnd = function() { return this.replace(/\s+$/, ''); };
            }
            if (!String.prototype.matchAll) {
                String.prototype.matchAll = function(regexp) {
                    if (!(regexp instanceof RegExp)) regexp = new RegExp(regexp, 'g');
                    if (!regexp.global) throw new TypeError('matchAll must be called with a global RegExp');
                    var str = String(this);
                    var matches = [];
                    var m;
                    var re = new RegExp(regexp.source, regexp.flags);
                    while ((m = re.exec(str)) !== null) {
                        matches.push(m);
                        if (m.index === re.lastIndex) re.lastIndex++;
                    }
                    return matches;
                };
            }

            if (!Array.prototype.at) {
                Array.prototype.at = function(index) {
                    index = Math.trunc(index) || 0;
                    if (index < 0) index += this.length;
                    if (index < 0 || index >= this.length) return undefined;
                    return this[index];
                };
            }
            if (!Array.prototype.includes) {
                Array.prototype.includes = function(search, fromIndex) {
                    return this.indexOf(search, fromIndex) !== -1;
                };
            }
            if (!Array.prototype.find) {
                Array.prototype.find = function(predicate, thisArg) {
                    for (var i = 0; i < this.length; i++) {
                        if (predicate.call(thisArg, this[i], i, this)) return this[i];
                    }
                    return undefined;
                };
            }
            if (!Array.prototype.findIndex) {
                Array.prototype.findIndex = function(predicate, thisArg) {
                    for (var i = 0; i < this.length; i++) {
                        if (predicate.call(thisArg, this[i], i, this)) return i;
                    }
                    return -1;
                };
            }
            if (typeof Array.from !== 'function') {
                Array.from = function(arrayLike, mapFn, thisArg) {
                    var out = [];
                    var len = arrayLike.length >>> 0;
                    for (var i = 0; i < len; i++) {
                        out.push(mapFn ? mapFn.call(thisArg, arrayLike[i], i) : arrayLike[i]);
                    }
                    return out;
                };
            }

            if (typeof Object.assign !== 'function') {
                Object.assign = function(target) {
                    for (var i = 1; i < arguments.length; i++) {
                        var src = arguments[i];
                        if (src == null) continue;
                        for (var key in src) {
                            if (Object.prototype.hasOwnProperty.call(src, key)) target[key] = src[key];
                        }
                    }
                    return target;
                };
            }
            if (typeof Object.values !== 'function') {
                Object.values = function(obj) {
                    return Object.keys(obj).map(function(k) { return obj[k]; });
                };
            }

            // Minimal TextEncoder/TextDecoder. Some scrapers use these for byte
            // handling around crypto. Produces UTF-8 code-unit arrays (sufficient
            // for the ASCII/Latin payloads these plugins actually process).
            if (typeof globalThis.TextEncoder === 'undefined') {
                globalThis.TextEncoder = function() {};
                globalThis.TextEncoder.prototype.encode = function(str) {
                    str = String(str == null ? '' : str);
                    var utf8 = unescape(encodeURIComponent(str));
                    var arr = new Array(utf8.length);
                    for (var i = 0; i < utf8.length; i++) arr[i] = utf8.charCodeAt(i) & 0xff;
                    return arr;
                };
            }
            if (typeof globalThis.TextDecoder === 'undefined') {
                globalThis.TextDecoder = function() {};
                globalThis.TextDecoder.prototype.decode = function(bytes) {
                    if (!bytes) return '';
                    var binary = '';
                    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] & 0xff);
                    try { return decodeURIComponent(escape(binary)); } catch (e) { return binary; }
                };
            }

            if (typeof globalThis.structuredClone === 'undefined') {
                globalThis.structuredClone = function(value) {
                    if (value === undefined) return undefined;
                    return JSON.parse(JSON.stringify(value));
                };
            }
        """.trimIndent()
    }
}
