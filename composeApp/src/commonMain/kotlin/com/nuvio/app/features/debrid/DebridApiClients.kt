package com.nuvio.app.features.debrid

import com.nuvio.app.features.addons.RawHttpResponse
import com.nuvio.app.features.addons.httpRequestRaw
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

internal data class DebridApiResponse<T>(
    val status: Int,
    val body: T?,
    val rawBody: String,
) {
    val isSuccessful: Boolean
        get() = status in 200..299
}

internal object DebridApiJson {
    @OptIn(ExperimentalSerializationApi::class)
    val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }
}

internal object TorboxApiClient {
    private const val BASE_URL = "https://api.torbox.app"

    suspend fun validateApiKey(apiKey: String): Boolean =
        getUser(apiKey.trim()).status in 200..299

    private suspend fun getUser(apiKey: String): RawHttpResponse =
        httpRequestRaw(
            method = "GET",
            url = "$BASE_URL/v1/api/user/me",
            headers = authHeaders(apiKey),
            body = "",
        )

    suspend fun createTorrent(apiKey: String, magnet: String): DebridApiResponse<TorboxEnvelopeDto<TorboxCreateTorrentDataDto>> {
        val boundary = "NuvioDebrid${magnet.hashCode().toUInt()}"
        val body = multipartFormBody(
            boundary = boundary,
            "magnet" to magnet,
            "add_only_if_cached" to "true",
            "allow_zip" to "false",
        )
        return request(
            method = "POST",
            url = "$BASE_URL/v1/api/torrents/createtorrent",
            apiKey = apiKey,
            body = body,
            contentType = "multipart/form-data; boundary=$boundary",
        )
    }

    suspend fun getTorrent(apiKey: String, id: Int): DebridApiResponse<TorboxEnvelopeDto<TorboxTorrentDataDto>> =
        request(
            method = "GET",
            url = "$BASE_URL/v1/api/torrents/mylist?${
                queryString(
                    "id" to id.toString(),
                    "bypass_cache" to "true",
                )
            }",
            apiKey = apiKey,
        )

    suspend fun requestDownloadLink(
        apiKey: String,
        torrentId: Int,
        fileId: Int?,
    ): DebridApiResponse<TorboxEnvelopeDto<String>> =
        request(
            method = "GET",
            url = "$BASE_URL/v1/api/torrents/requestdl?${
                queryString(
                    "token" to apiKey,
                    "torrent_id" to torrentId.toString(),
                    "file_id" to fileId?.toString(),
                    "zip_link" to "false",
                    "redirect" to "false",
                    "append_name" to "false",
                )
            }",
            apiKey = apiKey,
        )

    private suspend inline fun <reified T> request(
        method: String,
        url: String,
        apiKey: String,
        body: String = "",
        contentType: String? = null,
    ): DebridApiResponse<T> {
        val headers = authHeaders(apiKey) + listOfNotNull(
            contentType?.let { "Content-Type" to it },
            "Accept" to "application/json",
        )
        val response = httpRequestRaw(
            method = method,
            url = url,
            headers = headers,
            body = body,
        )
        return DebridApiResponse(
            status = response.status,
            body = response.decodeBody<T>(),
            rawBody = response.body,
        )
    }

    private fun authHeaders(apiKey: String): Map<String, String> =
        mapOf("Authorization" to "Bearer $apiKey")
}

internal object RealDebridApiClient {
    private const val BASE_URL = "https://api.real-debrid.com/rest/1.0"

    suspend fun validateApiKey(apiKey: String): Boolean =
        httpRequestRaw(
            method = "GET",
            url = "$BASE_URL/user",
            headers = authHeaders(apiKey.trim()),
            body = "",
        ).status in 200..299

    suspend fun addMagnet(apiKey: String, magnet: String): DebridApiResponse<RealDebridAddTorrentDto> =
        formRequest(
            method = "POST",
            url = "$BASE_URL/torrents/addMagnet",
            apiKey = apiKey,
            fields = listOf("magnet" to magnet),
        )

    suspend fun getTorrentInfo(apiKey: String, id: String): DebridApiResponse<RealDebridTorrentInfoDto> =
        request(
            method = "GET",
            url = "$BASE_URL/torrents/info/${encodePathSegment(id)}",
            apiKey = apiKey,
        )

    suspend fun selectFiles(apiKey: String, id: String, files: String): DebridApiResponse<Unit> =
        formRequest(
            method = "POST",
            url = "$BASE_URL/torrents/selectFiles/${encodePathSegment(id)}",
            apiKey = apiKey,
            fields = listOf("files" to files),
        )

    suspend fun unrestrictLink(apiKey: String, link: String): DebridApiResponse<RealDebridUnrestrictLinkDto> =
        formRequest(
            method = "POST",
            url = "$BASE_URL/unrestrict/link",
            apiKey = apiKey,
            fields = listOf("link" to link),
        )

    suspend fun deleteTorrent(apiKey: String, id: String): DebridApiResponse<Unit> =
        request(
            method = "DELETE",
            url = "$BASE_URL/torrents/delete/${encodePathSegment(id)}",
            apiKey = apiKey,
        )

    private suspend inline fun <reified T> formRequest(
        method: String,
        url: String,
        apiKey: String,
        fields: List<Pair<String, String>>,
    ): DebridApiResponse<T> {
        val body = fields.joinToString("&") { (key, value) ->
            "${encodeFormValue(key)}=${encodeFormValue(value)}"
        }
        return request(
            method = method,
            url = url,
            apiKey = apiKey,
            body = body,
            contentType = "application/x-www-form-urlencoded",
        )
    }

    private suspend inline fun <reified T> request(
        method: String,
        url: String,
        apiKey: String,
        body: String = "",
        contentType: String? = null,
    ): DebridApiResponse<T> {
        val headers = authHeaders(apiKey) + listOfNotNull(
            contentType?.let { "Content-Type" to it },
            "Accept" to "application/json",
        )
        val response = httpRequestRaw(
            method = method,
            url = url,
            headers = headers,
            body = body,
        )
        return DebridApiResponse(
            status = response.status,
            body = response.decodeBody<T>(),
            rawBody = response.body,
        )
    }

    private fun authHeaders(apiKey: String): Map<String, String> =
        mapOf("Authorization" to "Bearer $apiKey")
}

object DebridCredentialValidator {
    suspend fun validateProvider(providerId: String, apiKey: String): Boolean {
        val normalized = apiKey.trim()
        if (normalized.isBlank()) return false
        return when (DebridProviders.byId(providerId)?.id) {
            DebridProviders.TORBOX_ID -> TorboxApiClient.validateApiKey(normalized)
            DebridProviders.REAL_DEBRID_ID -> RealDebridApiClient.validateApiKey(normalized)
            else -> false
        }
    }
}

private inline fun <reified T> RawHttpResponse.decodeBody(): T? {
    if (body.isBlank() || T::class == Unit::class) return null
    return try {
        DebridApiJson.json.decodeFromString<T>(body)
    } catch (_: SerializationException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }
}

private fun multipartFormBody(boundary: String, vararg fields: Pair<String, String>): String =
    buildString {
        fields.forEach { (name, value) ->
            append("--").append(boundary).append("\r\n")
            append("Content-Disposition: form-data; name=\"").append(name).append("\"\r\n\r\n")
            append(value).append("\r\n")
        }
        append("--").append(boundary).append("--\r\n")
    }
