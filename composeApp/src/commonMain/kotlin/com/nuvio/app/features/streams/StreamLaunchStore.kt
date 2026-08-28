package com.nuvio.app.features.streams

import androidx.compose.runtime.mutableStateMapOf

data class StreamLaunch(
    val profileId: Int,
    val type: String,
    val videoId: String,
    val parentMetaId: String? = null,
    val parentMetaType: String? = null,
    val title: String,
    val logo: String? = null,
    val poster: String? = null,
    val background: String? = null,
    val seasonNumber: Int? = null,
    val episodeNumber: Int? = null,
    val episodeTitle: String? = null,
    val episodeThumbnail: String? = null,
    val pauseDescription: String? = null,
    val resumePositionMs: Long? = null,
    val resumeProgressFraction: Float? = null,
    val manualSelection: Boolean = false,
    val startFromBeginning: Boolean = false,
    val streamsSnapshot: StreamsUiState? = null,
)

object StreamLaunchStore {
    private var nextLaunchId = 1L
    private val launches = mutableStateMapOf<Long, StreamLaunch>()

    fun put(launch: StreamLaunch): Long {
        val launchId = nextLaunchId++
        launches[launchId] = launch
        return launchId
    }

    fun get(launchId: Long): StreamLaunch? = launches[launchId]

    fun updateEpisode(
        launchId: Long?,
        videoId: String,
        seasonNumber: Int?,
        episodeNumber: Int?,
        episodeTitle: String?,
        episodeThumbnail: String?,
        pauseDescription: String?,
        streamsSnapshot: StreamsUiState? = null,
    ) {
        if (launchId == null) return
        val current = launches[launchId] ?: return
        launches[launchId] = current.copy(
            videoId = videoId,
            seasonNumber = seasonNumber,
            episodeNumber = episodeNumber,
            episodeTitle = episodeTitle,
            episodeThumbnail = episodeThumbnail,
            pauseDescription = pauseDescription,
            resumePositionMs = null,
            resumeProgressFraction = null,
            manualSelection = true,
            startFromBeginning = false,
            streamsSnapshot = streamsSnapshot,
        )
    }

    fun remove(launchId: Long) {
        launches.remove(launchId)
    }

    fun clear() {
        nextLaunchId = 1L
        launches.clear()
    }
}
