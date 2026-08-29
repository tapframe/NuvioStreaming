package com.nuvio.app.features.cast

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.InputStream
import java.net.URLDecoder
import java.util.concurrent.TimeUnit

/**
 * Local HTTP proxy for DLNA.
 * Serves: http://<phone_lan_ip>:<port>/video/<id>  ->  GET sourceUrl + sourceHeaders (with Range passthrough)
 * Also serves subtitles if needed at /subs/...
 * Supports on-the-fly transcode via FfmpegTranscoder when enabled (see TranscodingProxyServer).
 */
open class LocalHttpProxyServer(
    port: Int,
    protected val sourceUrl: String,
    protected val sourceHeaders: Map<String, String>,
    protected val mimeType: String = "video/mp4",
) : NanoHTTPD(port) {

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .followRedirects(true)
        .followSslRedirects(true)
        .build()

    private var isTranscoding: Boolean = false

    companion object {
        private const val TAG = "LocalHttpProxy"
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri ?: "/"
        Log.d(TAG, "serve uri=$uri method=${session.method} headers=${session.headers} parms=${session.parms}")

        // Health check
        if (uri == "/" || uri == "/status") {
            return newFixedLengthResponse(Response.Status.OK, "text/plain", "Nuvio DLNA Proxy OK\nsource=$sourceUrl\ntranscoding=$isTranscoding")
        }

        // Support HEAD for TV probing
        val isHead = session.method == Method.HEAD

        // Handle subtitle proxy if needed
        if (uri.startsWith("/subs/")) {
            return serveSubtitle(session)
        }

        // Video endpoint: /video/* or /cast/* or /* -> proxy to source
        return serveVideo(session, isHead)
    }

    protected open fun serveVideo(session: IHTTPSession, isHead: Boolean): Response {
        val rangeHeader = session.headers["range"] ?: session.headers["Range"]
        val requestBuilder = Request.Builder().url(sourceUrl).get()
        // Forward sourceHeaders (Auth, User-Agent, Referer, etc.) but skip Range (use TV's range)
        sourceHeaders.forEach { (k, v) ->
            if (!k.equals("Range", ignoreCase = true) && v.isNotBlank()) {
                requestBuilder.header(k, v)
            }
        }
        if (rangeHeader != null) {
            requestBuilder.header("Range", rangeHeader)
        }
        // Forward other relevant headers from TV request (User-Agent)
        session.headers["user-agent"]?.let { requestBuilder.header("User-Agent", it) }

        val request = requestBuilder.build()
        return try {
            val resp = client.newCall(request).execute()
            val body = resp.body
            if (!resp.isSuccessful || body == null) {
                Log.w(TAG, "Upstream failed: ${resp.code} ${resp.message}")
                return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Upstream error ${resp.code}")
            }

            val contentType = resp.header("Content-Type") ?: mimeType
            val contentLength = resp.header("Content-Length")?.toLongOrNull()
            val contentRange = resp.header("Content-Range")
            val acceptRanges = resp.header("Accept-Ranges") ?: "bytes"

            val status = when (resp.code) {
                206 -> Response.Status.PARTIAL_CONTENT
                200 -> Response.Status.OK
                else -> Response.Status.lookup(resp.code) ?: Response.Status.OK
            }

            val input: InputStream = body.byteStream()
            val response: Response = if (contentLength != null && contentLength >= 0 && !isHead) {
                newFixedLengthResponse(status, contentType, input, contentLength)
            } else {
                // chunked
                newChunkedResponse(status, contentType, input)
            }
            // Propagate headers TV expects for seeking
            response.addHeader("Accept-Ranges", acceptRanges)
            if (contentRange != null) response.addHeader("Content-Range", contentRange)
            resp.header("Content-Length")?.let { response.addHeader("Content-Length", it) }
            // DLNA specific
            response.addHeader("transferMode.dlna.org", "Streaming")
            response.addHeader("contentFeatures.dlna.org", "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01500000000000000000000000000000")
            // CORS for TV which may check
            response.addHeader("Access-Control-Allow-Origin", "*")
            response
        } catch (e: Exception) {
            Log.e(TAG, "Proxy serve error", e)
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Proxy error: ${e.message}")
        }
    }

    private fun serveSubtitle(session: IHTTPSession): Response {
        val encoded = session.parms["url"] ?: session.queryParameterString?.substringAfter("url=")?.substringBefore("&") ?: return newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url")
        val url = try { URLDecoder.decode(encoded, "UTF-8") } catch (_: Exception) { encoded }
        return try {
            val req = Request.Builder().url(url).build()
            val resp = client.newCall(req).execute()
            val body = resp.body ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "No body")
            val ct = resp.header("Content-Type") ?: "text/vtt"
            newFixedLengthResponse(Response.Status.OK, ct, body.byteStream(), body.contentLength().takeIf { it >= 0 } ?: body.contentLength())
        } catch (e: Exception) {
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain", "Subtitle proxy error ${e.message}")
        }
    }

    fun getListeningPortSafe(): Int = listeningPort

    fun buildProxyUrl(localIp: String, path: String = "/video/cast.mp4"): String {
        val port = listeningPort
        return "http://$localIp:$port$path"
    }

    fun isRunningSafe(): Boolean = isAlive()
}
