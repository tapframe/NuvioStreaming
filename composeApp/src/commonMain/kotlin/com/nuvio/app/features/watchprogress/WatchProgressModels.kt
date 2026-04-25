package com.nuvio.app.features.watchprogress

import com.nuvio.app.features.details.MetaVideo
import com.nuvio.app.features.watching.domain.WatchingContentRef
import kotlinx.serialization.Serializable

internal const val WatchProgressCompletionPercentThreshold = 99.5f

@Serializable
enum class ContinueWatchingSectionStyle {
    Wide,
    Poster,
}

@Serializable
data class WatchProgressEntry(
    val contentType: String,
    val parentMetaId: String,
    val parentMetaType: String,
    val videoId: String,
    val title: String,
    val logo: String? = null,
    val poster: String? = null,
    val background: String? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val episodeTitle: String? = null,
    val episodeThumbnail: String? = null,
    val lastPositionMs: Long,
    val durationMs: Long,
    val lastUpdatedEpochMs: Long,
    val providerName: String? = null,
    val providerAddonId: String? = null,
    val lastStreamTitle: String? = null,
    val lastStreamSubtitle: String? = null,
    val pauseDescription: String? = null,
    val lastSourceUrl: String? = null,
    val isCompleted: Boolean = false,
    val progressPercent: Float? = null,
) {
    val normalizedProgressPercent: Float?
        get() = progressPercent?.coerceIn(0f, 100f)

    val isEffectivelyCompleted: Boolean
        get() = isCompleted ||
            (normalizedProgressPercent?.let { it >= WatchProgressCompletionPercentThreshold } == true) ||
            (durationMs > 0L && isWatchProgressComplete(lastPositionMs, durationMs, false))

    val progressFraction: Float
        get() {
            normalizedProgressPercent?.let { explicitPercent ->
                return (explicitPercent / 100f).coerceIn(0f, 1f)
            }
            return if (durationMs > 0L) {
                (lastPositionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f)
            } else {
                0f
            }
        }

    val isEpisode: Boolean
        get() = seasonNumber != null && episodeNumber != null

    val isResumable: Boolean
        get() = !isEffectivelyCompleted

    fun normalizedCompletion(): WatchProgressEntry {
        val completed = isEffectivelyCompleted
        val normalizedPositionMs = when {
            completed && durationMs > 0L -> durationMs
            else -> lastPositionMs.coerceAtLeast(0L)
        }
        val normalizedPercent = when {
            normalizedProgressPercent != null -> normalizedProgressPercent
            completed && durationMs <= 0L -> 100f
            else -> null
        }

        return if (
            completed == isCompleted &&
            normalizedPositionMs == lastPositionMs &&
            normalizedPercent == progressPercent
        ) {
            this
        } else {
            copy(
                lastPositionMs = normalizedPositionMs,
                isCompleted = completed,
                progressPercent = normalizedPercent,
            )
        }
    }

    fun resolveResumePosition(actualDurationMs: Long): Long {
        if (actualDurationMs <= 0L) return lastPositionMs.coerceAtLeast(0L)
        if (durationMs > 0L && lastPositionMs > 0L) {
            return lastPositionMs.coerceIn(0L, actualDurationMs)
        }
        normalizedProgressPercent?.let { percent ->
            val fraction = (percent / 100f).coerceIn(0f, 1f)
            return (actualDurationMs * fraction).toLong()
        }
        return lastPositionMs.coerceAtLeast(0L)
    }
}

data class WatchProgressUiState(
    val entries: List<WatchProgressEntry> = emptyList(),
) {
    val byVideoId: Map<String, WatchProgressEntry>
        get() = entries.associateBy { it.videoId }

    val continueWatchingEntries: List<WatchProgressEntry>
        get() = entries.continueWatchingEntries(limit = ContinueWatchingLimit)
}

data class WatchProgressPlaybackSession(
    val contentType: String,
    val parentMetaId: String,
    val parentMetaType: String,
    val videoId: String,
    val title: String,
    val logo: String? = null,
    val poster: String? = null,
    val background: String? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val episodeTitle: String? = null,
    val episodeThumbnail: String? = null,
    val providerName: String? = null,
    val providerAddonId: String? = null,
    val lastStreamTitle: String? = null,
    val lastStreamSubtitle: String? = null,
    val pauseDescription: String? = null,
    val lastSourceUrl: String? = null,
)

data class ContinueWatchingItem(
    val parentMetaId: String,
    val parentMetaType: String,
    val videoId: String,
    val title: String,
    val subtitle: String,
    val imageUrl: String?,
    val logo: String? = null,
    val poster: String? = null,
    val background: String? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val episodeTitle: String? = null,
    val episodeThumbnail: String? = null,
    val pauseDescription: String? = null,
    val isNextUp: Boolean = false,
    val nextUpSeedSeasonNumber: Int? = null,
    val nextUpSeedEpisodeNumber: Int? = null,
    val resumePositionMs: Long,
    val resumeProgressFraction: Float? = null,
    val durationMs: Long,
    val progressFraction: Float,
)

data class ContinueWatchingPreferencesUiState(
    val isVisible: Boolean = true,
    val style: ContinueWatchingSectionStyle = ContinueWatchingSectionStyle.Wide,
    val upNextFromFurthestEpisode: Boolean = true,
    val dismissedNextUpKeys: Set<String> = emptySet(),
    val showResumePromptOnLaunch: Boolean = true,
)

internal fun nextUpDismissKey(
    contentId: String,
    seasonNumber: Int?,
    episodeNumber: Int?,
): String = buildString {
    append(contentId.trim())
    append("|")
    append(seasonNumber ?: -1)
    append("|")
    append(episodeNumber ?: -1)
}

internal fun WatchProgressEntry.toContinueWatchingItem(): ContinueWatchingItem {
    val normalizedEntry = normalizedCompletion()
    val explicitResumeProgressFraction = normalizedEntry.normalizedProgressPercent
        ?.takeIf { durationMs <= 0L && it > 0f }
        ?.let { explicitPercent -> (explicitPercent / 100f).coerceIn(0f, 1f) }

    return ContinueWatchingItem(
        parentMetaId = normalizedEntry.parentMetaId,
        parentMetaType = normalizedEntry.parentMetaType,
        videoId = normalizedEntry.videoId,
        title = normalizedEntry.title,
        subtitle = normalizedEntry.episodeTitle.orEmpty(),
        imageUrl = normalizedEntry.episodeThumbnail ?: normalizedEntry.background ?: normalizedEntry.poster,
        logo = normalizedEntry.logo,
        poster = normalizedEntry.poster,
        background = normalizedEntry.background,
        seasonNumber = normalizedEntry.seasonNumber,
        episodeNumber = normalizedEntry.episodeNumber,
        episodeTitle = normalizedEntry.episodeTitle,
        episodeThumbnail = normalizedEntry.episodeThumbnail,
        pauseDescription = normalizedEntry.pauseDescription,
        isNextUp = false,
        nextUpSeedSeasonNumber = null,
        nextUpSeedEpisodeNumber = null,
        resumePositionMs = if (explicitResumeProgressFraction != null) 0L else normalizedEntry.lastPositionMs,
        resumeProgressFraction = explicitResumeProgressFraction,
        durationMs = normalizedEntry.durationMs,
        progressFraction = normalizedEntry.progressFraction,
    )
}

internal fun WatchProgressEntry.toUpNextContinueWatchingItem(
    nextEpisode: MetaVideo,
): ContinueWatchingItem {
    return ContinueWatchingItem(
        parentMetaId = parentMetaId,
        parentMetaType = parentMetaType,
        videoId = nextEpisode.id.takeIf { it.isNotBlank() } ?: buildPlaybackVideoId(
            parentMetaId = parentMetaId,
            seasonNumber = nextEpisode.season,
            episodeNumber = nextEpisode.episode,
            fallbackVideoId = nextEpisode.id,
        ),
        title = title,
        subtitle = nextEpisode.title,
        imageUrl = nextEpisode.thumbnail ?: episodeThumbnail ?: background ?: poster,
        logo = logo,
        poster = poster,
        background = background,
        seasonNumber = nextEpisode.season,
        episodeNumber = nextEpisode.episode,
        episodeTitle = nextEpisode.title,
        episodeThumbnail = nextEpisode.thumbnail,
        pauseDescription = nextEpisode.overview,
        isNextUp = true,
        nextUpSeedSeasonNumber = seasonNumber,
        nextUpSeedEpisodeNumber = episodeNumber,
        resumePositionMs = 0L,
        resumeProgressFraction = null,
        durationMs = 0L,
        progressFraction = 0f,
    )
}

fun buildPlaybackVideoId(
    parentMetaId: String,
    seasonNumber: Int?,
    episodeNumber: Int?,
    fallbackVideoId: String? = null,
): String = com.nuvio.app.features.watching.domain.buildPlaybackVideoId(
    content = WatchingContentRef(type = "", id = parentMetaId),
    seasonNumber = seasonNumber,
    episodeNumber = episodeNumber,
    fallbackVideoId = fallbackVideoId,
)
