package com.nuvio.app.features.player

data class ExternalPlayerApp(
    val id: String,
    val name: String,
)

data class ExternalPlayerPlaybackRequest(
    val sourceUrl: String,
    val title: String,
    val streamTitle: String? = null,
    val sourceHeaders: Map<String, String> = emptyMap(),
)

enum class ExternalPlayerOpenResult {
    Opened,
    NotConfigured,
    NoPlayerAvailable,
    Failed,
}

internal expect object ExternalPlayerPlatform {
    fun defaultPlayerId(): String?
    fun availablePlayers(): List<ExternalPlayerApp>
    fun open(
        request: ExternalPlayerPlaybackRequest,
        playerId: String?,
    ): ExternalPlayerOpenResult
}
