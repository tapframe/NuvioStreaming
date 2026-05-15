package com.nuvio.app.features.addons

import android.content.Context
import android.content.SharedPreferences
import com.nuvio.app.core.network.IPv4FirstDns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ResponseBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.Proxy
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlin.text.Charsets
import java.util.concurrent.TimeUnit

actual object AddonStorage {
    private const val preferencesName = "nuvio_addons"
    private const val addonUrlsKey = "installed_manifest_urls"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    actual fun loadInstalledAddonUrls(profileId: Int): List<String> =
        preferences
            ?.getString("${addonUrlsKey}_$profileId", null)
            .orEmpty()
            .lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()

    actual fun saveInstalledAddonUrls(profileId: Int, urls: List<String>) {
        preferences
            ?.edit()
            ?.putString("${addonUrlsKey}_$profileId", urls.joinToString(separator = "\n"))
            ?.apply()
    }
}

private val addonHttpClient = OkHttpClient.Builder()
    .dns(IPv4FirstDns())
    .connectTimeout(60, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .writeTimeout(60, TimeUnit.SECONDS)
    .followRedirects(true)
    .followSslRedirects(true)
    .proxy(Proxy.NO_PROXY)
    .build()

private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
private const val maxRawResponseBodyBytes = 1024 * 1024
private const val truncationSuffix = "\n...[truncated]"

private fun requestAllowsBody(method: String): Boolean =
    when (method.uppercase()) {
        "POST", "PUT", "PATCH", "DELETE" -> true
        else -> false
    }

private fun Map<String, String>.withoutAcceptEncoding(): Map<String, String> =
    entries
        .filterNot { (key, _) -> key.equals("Accept-Encoding", ignoreCase = true) }
        .associate { (key, value) -> key to value }

private fun Map<String, String>.getHeaderIgnoreCase(name: String): String? =
    entries.firstOrNull { (key, _) -> key.equals(name, ignoreCase = true) }?.value

private data class LimitedReadResult(
    val bytes: ByteArray,
    val truncated: Boolean,
)

private fun readAtMostBytes(stream: InputStream, maxBytes: Int): LimitedReadResult {
    val out = ByteArrayOutputStream(minOf(maxBytes, 16 * 1024))
    val buffer = ByteArray(8 * 1024)
    var remaining = maxBytes
    var truncated = false

    while (remaining > 0) {
        val read = stream.read(buffer, 0, minOf(buffer.size, remaining))
        if (read <= 0) break
        out.write(buffer, 0, read)
        remaining -= read
    }

    if (remaining == 0) {
        truncated = stream.read() != -1
    }

    return LimitedReadResult(out.toByteArray(), truncated)
}

private fun readResponseBodyLimited(body: ResponseBody?): String {
    if (body == null) return ""
    val charset = body.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
    val readResult = body.byteStream().use { stream ->
        readAtMostBytes(stream, maxRawResponseBodyBytes)
    }

    val decoded = try {
        String(readResult.bytes, charset)
    } catch (_: Exception) {
        String(readResult.bytes, Charsets.UTF_8)
    }

    return if (readResult.truncated) {
        decoded + truncationSuffix
    } else {
        decoded
    }
}

private fun readResponseBody(body: ResponseBody?): String {
    if (body == null) return ""
    val bytes = body.bytes()
    return runCatching {
        val charset = body.contentType()?.charset(Charsets.UTF_8) ?: Charsets.UTF_8
        String(bytes, charset)
    }.getOrElse {
        String(bytes, Charsets.UTF_8)
    }
}

private suspend fun executeTextRequest(
    method: String,
    url: String,
    headers: Map<String, String> = emptyMap(),
    body: String = "",
): String = withContext(Dispatchers.IO) {
    val normalizedMethod = method.uppercase()
    val sanitizedHeaders = headers.withoutAcceptEncoding()
    val builder = Request.Builder().url(url)
    sanitizedHeaders.forEach { (key, value) ->
        builder.header(key, value)
    }

    val request = if (requestAllowsBody(normalizedMethod)) {
        val contentType = sanitizedHeaders.getHeaderIgnoreCase("Content-Type")
            ?: if (normalizedMethod == "POST") "application/x-www-form-urlencoded" else "application/json"
        // Preserve exact media type and avoid implicit charset rewriting used in signed APIs like MovieBox.
        val requestBody = body.toByteArray(Charsets.UTF_8).toRequestBody(contentType.toMediaType())
        builder.method(normalizedMethod, requestBody)
    } else {
        builder.method(normalizedMethod, null)
    }.build()

    addonHttpClient.newCall(request).execute().use { response ->
        val payload = readResponseBody(response.body)
        if (!response.isSuccessful) {
            error("Request failed with HTTP ${response.code}")
        }
        if (payload.isBlank()) {
            throw IllegalStateException("Empty response body")
        }
        payload
    }
}

actual suspend fun httpGetText(url: String): String =
    executeTextRequest(
        method = "GET",
        url = url,
        headers = mapOf("Accept" to "application/json"),
    )

actual suspend fun httpPostJson(url: String, body: String): String =
    executeTextRequest(
        method = "POST",
        url = url,
        headers = mapOf(
            "Accept" to "application/json",
            "Content-Type" to "application/json",
        ),
        body = body,
    )

actual suspend fun httpGetTextWithHeaders(
    url: String,
    headers: Map<String, String>,
): String =
    executeTextRequest(
        method = "GET",
        url = url,
        headers = mapOf("Accept" to "application/json") + headers,
    )

actual suspend fun httpPostJsonWithHeaders(
    url: String,
    body: String,
    headers: Map<String, String>,
): String =
    executeTextRequest(
        method = "POST",
        url = url,
        headers = mapOf(
            "Accept" to "application/json",
            "Content-Type" to "application/json",
        ) + headers,
        body = body,
    )

actual suspend fun httpRequestRaw(
    method: String,
    url: String,
    headers: Map<String, String>,
    body: String,
    followRedirects: Boolean,
): RawHttpResponse =
    withContext(Dispatchers.IO) {
        val normalizedMethod = method.uppercase()
        val sanitizedHeaders = headers.withoutAcceptEncoding()
        val builder = Request.Builder().url(url)
        sanitizedHeaders.forEach { (key, value) ->
            builder.header(key, value)
        }

        val request = if (requestAllowsBody(normalizedMethod)) {
            val contentType = sanitizedHeaders.getHeaderIgnoreCase("Content-Type")
                ?: if (normalizedMethod == "POST") "application/x-www-form-urlencoded" else "application/json"
            val requestBody = body.toByteArray(Charsets.UTF_8).toRequestBody(contentType.toMediaType())
            builder.method(normalizedMethod, requestBody)
        } else {
            builder.method(normalizedMethod, null)
        }.build()

        val client = if (followRedirects) {
            addonHttpClient
        } else {
            addonHttpClient.newBuilder()
                .followRedirects(false)
                .followSslRedirects(false)
                .build()
        }

        client.newCall(request).execute().use { response ->
            RawHttpResponse(
                status = response.code,
                statusText = response.message,
                url = response.request.url.toString(),
                body = readResponseBodyLimited(response.body),
                headers = response.headers.toMultimap().mapValues { (_, values) ->
                    values.joinToString(",")
                }.mapKeys { (name, _) ->
                    name.lowercase()
                },
            )
        }
    }
