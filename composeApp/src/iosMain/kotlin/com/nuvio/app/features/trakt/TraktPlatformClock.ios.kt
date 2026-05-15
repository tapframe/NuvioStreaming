package com.nuvio.app.features.trakt

import platform.Foundation.NSDate
import platform.Foundation.timeIntervalSince1970

internal actual object TraktPlatformClock {
    actual fun nowEpochMs(): Long = (NSDate().timeIntervalSince1970 * 1000.0).toLong()

    actual fun parseIsoDateTimeToEpochMs(value: String): Long? =
        parseTraktIsoDateTimeToEpochMs(value)
}
