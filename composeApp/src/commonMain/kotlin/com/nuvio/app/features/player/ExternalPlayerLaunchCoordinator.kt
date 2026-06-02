package com.nuvio.app.features.player

/**
 * Orchestrates the full external player launch flow:
 * fetches subtitles if forwarding is enabled, then returns an enriched request
 * for the caller to dispatch.
 */
suspend fun prepareExternalPlayerLaunch(
    request: ExternalPlayerPlaybackRequest,
    type: String,
    videoId: String,
    forwardSubtitles: Boolean,
    preferredLanguage: String,
    secondaryLanguage: String?,
    onOverlayMessage: (String?) -> Unit,
): ExternalPlayerPlaybackRequest {
    if (forwardSubtitles && !preferredLanguage.equals(SubtitleLanguageOption.NONE, ignoreCase = true)) {
        onOverlayMessage("Loading subtitles from addons...")

        val subtitles = SubtitleForwarder.fetchForExternalPlayer(
            type = type,
            videoId = videoId,
            preferredLanguage = preferredLanguage,
            secondaryLanguage = secondaryLanguage,
        )

        if (subtitles != null) {
            return request.copy(subtitles = subtitles)
        }
    }

    return request
}
