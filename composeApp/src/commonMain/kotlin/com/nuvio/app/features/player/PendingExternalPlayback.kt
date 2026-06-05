package com.nuvio.app.features.player

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Snapshot of an external playback launch, persisted so auto-play-next survives the
 * player killing our process. Holds only what's needed to resolve + launch the next episode.
 */
@Serializable
data class PendingExternalPlayback(
    val parentMetaId: String,
    val parentMetaType: String,
    val contentType: String?,
    val title: String,
    val logo: String?,
    val poster: String?,
    val background: String?,
    val seasonNumber: Int?,
    val episodeNumber: Int?,
    val pauseDescription: String?,
)

fun PlayerLaunch.toPendingExternalPlayback(): PendingExternalPlayback =
    PendingExternalPlayback(
        parentMetaId = parentMetaId,
        parentMetaType = parentMetaType,
        contentType = contentType,
        title = title,
        logo = logo,
        poster = poster,
        background = background,
        seasonNumber = seasonNumber,
        episodeNumber = episodeNumber,
        pauseDescription = pauseDescription,
    )

/** Platform key-value persistence for the pending external playback snapshot. */
internal expect object PendingExternalPlaybackStorage {
    fun load(): String?
    fun save(value: String)
    fun clear()
}

object PendingExternalPlaybackRepository {
    private val json = Json { ignoreUnknownKeys = true }

    fun save(launch: PlayerLaunch) {
        runCatching {
            PendingExternalPlaybackStorage.save(json.encodeToString(launch.toPendingExternalPlayback()))
        }
    }

    fun load(): PendingExternalPlayback? {
        val raw = PendingExternalPlaybackStorage.load() ?: return null
        return runCatching { json.decodeFromString<PendingExternalPlayback>(raw) }.getOrNull()
    }

    fun clear() {
        runCatching { PendingExternalPlaybackStorage.clear() }
    }
}
