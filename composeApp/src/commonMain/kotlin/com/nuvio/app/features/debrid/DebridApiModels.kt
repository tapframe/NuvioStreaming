package com.nuvio.app.features.debrid

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
internal data class TorboxEnvelopeDto<T>(
    val success: Boolean? = null,
    val data: T? = null,
    val error: String? = null,
    val detail: String? = null,
)

@Serializable
internal data class TorboxCreateTorrentDataDto(
    @SerialName("torrent_id") val torrentId: Int? = null,
    val id: Int? = null,
    val hash: String? = null,
    @SerialName("auth_id") val authId: String? = null,
) {
    fun resolvedTorrentId(): Int? = torrentId ?: id
}

@Serializable
internal data class TorboxTorrentDataDto(
    val id: Int? = null,
    val hash: String? = null,
    val name: String? = null,
    val files: List<TorboxTorrentFileDto>? = null,
)

@Serializable
internal data class TorboxTorrentFileDto(
    val id: Int? = null,
    val name: String? = null,
    @SerialName("short_name") val shortName: String? = null,
    @SerialName("absolute_path") val absolutePath: String? = null,
    @SerialName("mimetype") val mimeType: String? = null,
    val size: Long? = null,
) {
    fun displayName(): String =
        listOfNotNull(name, shortName, absolutePath)
            .firstOrNull { it.isNotBlank() }
            .orEmpty()
}

@Serializable
internal data class RealDebridAddTorrentDto(
    val id: String? = null,
    val uri: String? = null,
)

@Serializable
internal data class RealDebridTorrentInfoDto(
    val id: String? = null,
    val filename: String? = null,
    @SerialName("original_filename") val originalFilename: String? = null,
    val hash: String? = null,
    val bytes: Long? = null,
    @SerialName("original_bytes") val originalBytes: Long? = null,
    val host: String? = null,
    val split: Int? = null,
    val progress: Int? = null,
    val status: String? = null,
    val files: List<RealDebridTorrentFileDto>? = null,
    val links: List<String>? = null,
)

@Serializable
internal data class RealDebridTorrentFileDto(
    val id: Int? = null,
    val path: String? = null,
    val bytes: Long? = null,
    val selected: Int? = null,
) {
    fun displayName(): String =
        path.orEmpty().substringAfterLast('/').ifBlank { path.orEmpty() }
}

@Serializable
internal data class RealDebridUnrestrictLinkDto(
    val id: String? = null,
    val filename: String? = null,
    val mimeType: String? = null,
    val filesize: Long? = null,
    val link: String? = null,
    val host: String? = null,
    val chunks: Int? = null,
    val crc: Int? = null,
    val download: String? = null,
    val streamable: Int? = null,
    val type: String? = null,
)

