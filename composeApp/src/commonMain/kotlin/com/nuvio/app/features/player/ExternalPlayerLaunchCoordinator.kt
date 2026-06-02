package com.nuvio.app.features.player

import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.streams_loading_subtitles
import org.jetbrains.compose.resources.getString

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
        onOverlayMessage(getString(Res.string.streams_loading_subtitles))

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
