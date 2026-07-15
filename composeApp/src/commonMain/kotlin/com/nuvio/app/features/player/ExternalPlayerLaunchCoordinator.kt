package com.nuvio.app.features.player

import com.nuvio.app.features.player.skip.SkipInterval
import com.nuvio.app.features.player.skip.SkipIntroRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.put
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.player_external_downloading_subtitles
import nuvio.composeapp.generated.resources.player_external_loading_subtitles
import org.jetbrains.compose.resources.getString

private const val SkipSegmentResolveTimeoutMs = 4_000L

// Skip resolution runs on an app-lifetime scope rather than the caller's (often
// composition-bound) scope, so navigating to the external player cannot cancel an
// in-flight network lookup partway through.
private val skipResolveScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

/**
 * Orchestrates the full external player launch flow:
 * fetches subtitles if forwarding is enabled, downloads them to local cache,
 * resolves intro/outro skip segments if enabled, then returns an enriched
 * request for the caller to dispatch.
 */
suspend fun prepareExternalPlayerLaunch(
    request: ExternalPlayerPlaybackRequest,
    type: String,
    videoId: String,
    forwardSubtitles: Boolean,
    sendSkipSegments: Boolean,
    preferredLanguage: String,
    secondaryLanguage: String?,
    onOverlayMessage: (String?) -> Unit,
): ExternalPlayerPlaybackRequest = coroutineScope {
    var result = request

    val subtitlesDeferred = if (forwardSubtitles && !preferredLanguage.equals(SubtitleLanguageOption.NONE, ignoreCase = true)) {
        async {
            onOverlayMessage(getString(Res.string.player_external_loading_subtitles))

            val subtitles = SubtitleForwarder.fetchForExternalPlayer(
                type = type,
                videoId = videoId,
                preferredLanguage = preferredLanguage,
                secondaryLanguage = secondaryLanguage,
            )

            if (subtitles != null) {
                onOverlayMessage(getString(Res.string.player_external_downloading_subtitles))
                val cachedSubtitles = SubtitleCacheProvider.cacheForExternalPlayer(subtitles)
                // Fallback: use original URLs if caching fails
                cachedSubtitles ?: subtitles
            } else {
                null
            }
        }
    } else {
        null
    }

    val skipSegmentsDeferred = if (sendSkipSegments) {
        async { resolveSkipSegmentsJson(videoId, request.season, request.episode) }
    } else {
        null
    }

    subtitlesDeferred?.await()?.let { subtitles ->
        result = result.copy(subtitles = subtitles)
    }
    skipSegmentsDeferred?.await()?.let { skipSegmentsJson ->
        result = result.copy(skipSegmentsJson = skipSegmentsJson)
    }

    return@coroutineScope result
}

/**
 * Resolves intro/outro skip segments for the given content and serializes them to the
 * JSON contract understood by supporting external players: a JSON array of objects with
 * `type` (String), `start` (seconds) and `end` (seconds). Returns null if nothing resolved.
 *
 * Bounded by a timeout so a slow provider never delays the player launch. Resolution is
 * intentionally independent of the in-app skip-intro toggle (requireSkipIntroEnabled = false):
 * this is its own opt-in setting.
 */
private suspend fun resolveSkipSegmentsJson(videoId: String, season: Int?, episode: Int?): String? {
    val ep = episode ?: return null
    val intervals = skipResolveScope.async {
        withTimeoutOrNull(SkipSegmentResolveTimeoutMs) {
            when {
                videoId.startsWith("mal:") -> {
                    val malId = videoId.removePrefix("mal:").substringBefore(':')
                    SkipIntroRepository.getSkipIntervalsForMal(malId, ep, requireSkipIntroEnabled = false)
                }
                videoId.startsWith("kitsu:") -> {
                    val kitsuId = videoId.removePrefix("kitsu:").substringBefore(':')
                    SkipIntroRepository.getSkipIntervalsForKitsu(kitsuId, ep, requireSkipIntroEnabled = false)
                }
                else -> {
                    val imdbId = videoId.substringBefore(':').takeIf { it.startsWith("tt") } ?: return@withTimeoutOrNull null
                    val s = season ?: return@withTimeoutOrNull null
                    SkipIntroRepository.getSkipIntervals(imdbId, s, ep, requireSkipIntroEnabled = false)
                }
            }
        }
    }.await()

    if (intervals.isNullOrEmpty()) return null
    return intervals.toSkipSegmentsJson()
}

private fun List<SkipInterval>.toSkipSegmentsJson(): String =
    buildJsonArray {
        forEach { interval ->
            addJsonObject {
                put("type", interval.type)
                put("start", interval.startTime)
                put("end", interval.endTime)
            }
        }
    }.toString()
