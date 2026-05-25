package com.nuvio.app.features.debrid

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

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
internal data class TorboxCloudItemDto(
    val id: JsonElement? = null,
    val hash: String? = null,
    val name: String? = null,
    val status: String? = null,
    val state: String? = null,
    @SerialName("download_state") val downloadState: String? = null,
    val progress: Double? = null,
    @SerialName("download_progress") val downloadProgress: Double? = null,
    val size: Long? = null,
    @SerialName("total_size") val totalSize: Long? = null,
    val files: List<TorboxCloudFileDto>? = null,
)

@Serializable
internal data class TorboxCloudFileDto(
    val id: JsonElement? = null,
    val name: String? = null,
    @SerialName("short_name") val shortName: String? = null,
    @SerialName("absolute_path") val absolutePath: String? = null,
    @SerialName("mimetype") val mimeType: String? = null,
    @SerialName("mime_type") val mimeTypeAlt: String? = null,
    val size: Long? = null,
)

@Serializable
internal data class TorboxCheckCachedRequestDto(
    val hashes: List<String>,
)

@Serializable
internal data class TorboxDeviceAuthorizationDto(
    @SerialName("device_code") val deviceCode: String? = null,
    val code: String? = null,
    @SerialName("verification_url") val verificationUrl: String? = null,
    @SerialName("friendly_verification_url") val friendlyVerificationUrl: String? = null,
    val interval: Int? = null,
    @SerialName("expires_at") val expiresAt: String? = null,
)

@Serializable
internal data class TorboxDeviceTokenRequestDto(
    @SerialName("device_code") val deviceCode: String,
)

@Serializable
internal data class TorboxDeviceTokenDto(
    @SerialName("access_token") val accessToken: String? = null,
    @SerialName("token_type") val tokenType: String? = null,
)

@Serializable
internal data class TorboxCachedItemDto(
    val name: String? = null,
    val size: Long? = null,
    val hash: String? = null,
)

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

@Serializable
internal data class PremiumizeDeviceAuthorizationDto(
    @SerialName("device_code") val deviceCode: String? = null,
    @SerialName("user_code") val userCode: String? = null,
    @SerialName("verification_uri") val verificationUri: String? = null,
    @SerialName("verification_uri_complete") val verificationUriComplete: String? = null,
    @SerialName("expires_in") val expiresIn: Int? = null,
    val interval: Int? = null,
    val error: String? = null,
    @SerialName("error_description") val errorDescription: String? = null,
)

@Serializable
internal data class PremiumizeDeviceTokenDto(
    @SerialName("access_token") val accessToken: String? = null,
    @SerialName("token_type") val tokenType: String? = null,
    @SerialName("expires_in") val expiresIn: Int? = null,
    val scope: String? = null,
    val error: String? = null,
    @SerialName("error_description") val errorDescription: String? = null,
)

@Serializable
internal data class PremiumizeApiEnvelopeDto(
    val status: String? = null,
    val message: String? = null,
    val code: String? = null,
)

@Serializable
internal data class PremiumizeAccountInfoDto(
    val status: String? = null,
    val message: String? = null,
    val code: String? = null,
    @SerialName("customer_id") val customerId: String? = null,
    @SerialName("premium_until") val premiumUntil: Long? = null,
    @SerialName("limit_used") val limitUsed: Double? = null,
    @SerialName("booster_points") val boosterPoints: Int? = null,
)

@Serializable
internal data class PremiumizeDirectDownloadDto(
    val status: String? = null,
    val message: String? = null,
    val code: String? = null,
    val content: List<PremiumizeDirectDownloadFileDto>? = null,
)

@Serializable
internal data class PremiumizeDirectDownloadFileDto(
    val path: String? = null,
    val size: Long? = null,
    val link: String? = null,
)

@Serializable
internal data class PremiumizeCacheCheckDto(
    val status: String? = null,
    val message: String? = null,
    val code: String? = null,
    val response: List<Boolean>? = null,
    val filename: List<String?>? = null,
    val filesize: List<JsonElement?>? = null,
)

@Serializable
internal data class PremiumizeItemListAllDto(
    val status: String? = null,
    val message: String? = null,
    val code: String? = null,
    val files: List<PremiumizeCloudFileDto>? = null,
)

@Serializable
internal data class PremiumizeCloudFileDto(
    val id: String? = null,
    val name: String? = null,
    val path: String? = null,
    val type: String? = null,
    val size: Long? = null,
    @SerialName("created_at") val createdAt: Long? = null,
    @SerialName("mime_type") val mimeType: String? = null,
    val link: String? = null,
)

@Serializable
internal data class PremiumizeItemDetailsDto(
    val status: String? = null,
    val message: String? = null,
    val code: String? = null,
    val id: String? = null,
    val name: String? = null,
    val size: Long? = null,
    @SerialName("created_at") val createdAt: Long? = null,
    @SerialName("folder_id") val folderId: String? = null,
    @SerialName("mime_type") val mimeType: String? = null,
    val link: String? = null,
)
