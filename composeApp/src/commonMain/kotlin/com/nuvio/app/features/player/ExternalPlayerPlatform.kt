package com.nuvio.app.features.player

data class ExternalPlayerApp(
    val id: String,
    val name: String,
)

data class SubtitleInput(
    val url: String,
    val name: String,
    val lang: String,
)

data class ExternalPlayerPlaybackRequest(
    val sourceUrl: String,
    val title: String,
    val streamTitle: String? = null,
    val sourceHeaders: Map<String, String> = emptyMap(),
    val resumePositionMs: Long = 0L,
    val subtitles: List<SubtitleInput>? = null,
)

enum class ExternalPlayerOpenResult {
    Opened,
    NotConfigured,
    NoPlayerAvailable,
    Failed,
}

sealed interface ExternalPlayerIntentResult {
    data class Success(val intent: Any) : ExternalPlayerIntentResult
    data object NotConfigured : ExternalPlayerIntentResult
    data object Failed : ExternalPlayerIntentResult
}

internal expect object ExternalPlayerPlatform {
    fun defaultPlayerId(): String?
    fun availablePlayers(): List<ExternalPlayerApp>
    fun open(
        request: ExternalPlayerPlaybackRequest,
        playerId: String?,
    ): ExternalPlayerOpenResult
    fun buildIntent(
        request: ExternalPlayerPlaybackRequest,
        playerId: String?,
    ): ExternalPlayerIntentResult
}
