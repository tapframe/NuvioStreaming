package com.nuvio.app.features.cloud

import com.nuvio.app.features.debrid.DebridProvider

enum class CloudLibraryItemType {
    Torrent,
    Usenet,
    WebDownload,
    File,
}

data class CloudLibraryFile(
    val id: String?,
    val name: String,
    val sizeBytes: Long? = null,
    val mimeType: String? = null,
    val playable: Boolean = true,
    val playbackUrl: String? = null,
) {
    val stableKey: String
        get() = id ?: name
}

data class CloudLibraryItem(
    val providerId: String,
    val providerName: String,
    val id: String,
    val type: CloudLibraryItemType,
    val name: String,
    val status: String? = null,
    val sizeBytes: Long? = null,
    val progressFraction: Float? = null,
    val files: List<CloudLibraryFile> = emptyList(),
) {
    val stableKey: String
        get() = "$providerId:${type.name}:$id"

    val playableFiles: List<CloudLibraryFile>
        get() = files.filter { it.playable }
}

data class CloudLibraryPlaybackTarget(
    val item: CloudLibraryItem,
    val file: CloudLibraryFile,
)

sealed interface CloudLibraryPlaybackTargetLookupResult {
    data class Found(val target: CloudLibraryPlaybackTarget) : CloudLibraryPlaybackTargetLookupResult
    data object Disabled : CloudLibraryPlaybackTargetLookupResult
    data class NotConnected(val providerName: String? = null) : CloudLibraryPlaybackTargetLookupResult
    data object NotFound : CloudLibraryPlaybackTargetLookupResult
}

const val CloudLibraryContentType = "cloud"
const val TorboxCloudLibraryPosterUrl = "https://torbox.app/assets/logo-bb7a9579.svg"
const val PremiumizeCloudLibraryPosterUrl = "https://www.premiumize.me/icon_normal.svg"
private const val TorboxCloudLibraryPosterDataUrl =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjM2NyAzMDggNzY2IDg4NCI+PHBvbHlnb24gZmlsbD0iIzAwNDQ0RCIgcG9pbnRzPSI3NDkuOTksNzQ5Ljk5IDc0OS45OSwxMTkxLjk2IDM2Ny4yNSw5NzAuOTcgMzY3LjI1LDUyOS4wMSIvPjxwb2x5Z29uIGZpbGw9IiMzNEJBOTAiIHBvaW50cz0iMTEzMi43NSw1MjkuMDEgMTEzMi43NSw5NzAuOTcgNzQ5Ljk5LDExOTEuOTYgNzQ5Ljk5LDc0OS45OSA4NzIuODcsNjc5LjA1IDk1Ni43MSw2MzAuNjYiLz48cG9seWdvbiBmaWxsPSIjNTJBMTUzIiBwb2ludHM9IjExMzIuNzUsNTI5LjAxIDc0OS45OSw3NDkuOTkgMzY3LjI1LDUyOS4wMSA3NDkuOTksMzA4LjA0Ii8+PHBvbHlnb24gZmlsbD0iI0ZGRkZGRiIgcG9pbnRzPSIxMDQzLjA0LDczOS4zNiA5NTguNjYsMTA1Ny4wOCA5NTIuNCw4NTEuODQgODM5LjcxLDkxNS4zOSA4NzIuODcsNjc5LjA1IDk1Ni43MSw2MzAuNjYgOTMxLjgxLDc5OS4yMSIvPjwvc3ZnPg=="

fun CloudLibraryItem.playbackVideoId(file: CloudLibraryFile): String =
    "$stableKey:${file.stableKey}"

fun CloudLibraryItem.providerPosterUrl(): String? =
    cloudLibraryProviderPosterUrl(providerId)

fun cloudLibraryProviderPosterUrl(providerIdOrContentId: String?): String? =
    when (cloudLibraryProviderId(providerIdOrContentId)) {
        "torbox" -> TorboxCloudLibraryPosterUrl
        "premiumize" -> PremiumizeCloudLibraryPosterUrl
        else -> null
    }

fun cloudLibraryDisplayArtworkUrl(url: String?): String? =
    when (url?.trim()) {
        TorboxCloudLibraryPosterUrl -> TorboxCloudLibraryPosterDataUrl
        else -> url?.trim()
    }

fun cloudLibraryProviderId(providerIdOrContentId: String?): String =
    providerIdOrContentId.orEmpty()
        .trim()
        .removePrefix("$CloudLibraryContentType:")
        .substringBefore(':')
        .lowercase()

data class CloudLibraryProviderState(
    val provider: DebridProvider,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val items: List<CloudLibraryItem> = emptyList(),
) {
    val providerId: String
        get() = provider.id

    val providerName: String
        get() = provider.displayName
}

data class CloudLibraryUiState(
    val isLoaded: Boolean = false,
    val isEnabled: Boolean = true,
    val isRefreshing: Boolean = false,
    val providers: List<CloudLibraryProviderState> = emptyList(),
) {
    val items: List<CloudLibraryItem>
        get() = providers.flatMap { it.items }

    val hasConnectedProvider: Boolean
        get() = providers.isNotEmpty()
}

sealed interface CloudLibraryPlaybackResult {
    data class Success(
        val url: String,
        val filename: String? = null,
        val videoSizeBytes: Long? = null,
    ) : CloudLibraryPlaybackResult

    data object MissingCredentials : CloudLibraryPlaybackResult
    data object NotPlayable : CloudLibraryPlaybackResult
    data class Failed(val message: String? = null) : CloudLibraryPlaybackResult
}
