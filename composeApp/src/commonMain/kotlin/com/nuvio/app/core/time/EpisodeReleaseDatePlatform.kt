package com.nuvio.app.core.time

internal expect object EpisodeReleaseDatePlatform {
    fun nowEpochMs(): Long
    fun localIsoDateAtEpochMs(epochMs: Long): String?
    fun localDateTimeToEpochMs(normalizedIsoDateTime: String): Long?
}
