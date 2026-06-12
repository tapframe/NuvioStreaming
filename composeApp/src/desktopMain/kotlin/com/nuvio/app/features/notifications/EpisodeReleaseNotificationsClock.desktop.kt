package com.nuvio.app.features.notifications

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal actual object EpisodeReleaseNotificationsClock {
    private val formatter = DateTimeFormatter.ISO_LOCAL_DATE

    actual fun isoDateFromEpochMs(epochMs: Long): String =
        Instant.ofEpochMilli(epochMs)
            .atZone(ZoneId.systemDefault())
            .toLocalDate()
            .format(formatter)
}
