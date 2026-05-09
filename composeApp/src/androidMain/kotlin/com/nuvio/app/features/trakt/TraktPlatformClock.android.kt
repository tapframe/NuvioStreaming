package com.nuvio.app.features.trakt

import java.time.Instant

internal actual object TraktPlatformClock {
    actual fun nowEpochMs(): Long = System.currentTimeMillis()

    actual fun parseIsoDateTimeToEpochMs(value: String): Long? =
        runCatching { Instant.parse(value).toEpochMilli() }.getOrNull()
            ?: parseTraktIsoDateTimeToEpochMs(value)
}
