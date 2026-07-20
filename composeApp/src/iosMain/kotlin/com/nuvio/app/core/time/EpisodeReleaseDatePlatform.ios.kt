package com.nuvio.app.core.time

import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.dateWithTimeIntervalSince1970
import platform.Foundation.timeIntervalSince1970

internal actual object EpisodeReleaseDatePlatform {
    actual fun nowEpochMs(): Long = (NSDate().timeIntervalSince1970 * 1_000.0).toLong()

    actual fun localIsoDateAtEpochMs(epochMs: Long): String? {
        val formatter = NSDateFormatter().apply {
            dateFormat = "yyyy-MM-dd"
        }
        return formatter.stringFromDate(
            NSDate.dateWithTimeIntervalSince1970(epochMs.toDouble() / 1_000.0),
        )
    }

    actual fun localDateTimeToEpochMs(normalizedIsoDateTime: String): Long? {
        val formatter = NSDateFormatter().apply {
            dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS"
        }
        return formatter.dateFromString(normalizedIsoDateTime)
            ?.timeIntervalSince1970
            ?.times(1_000.0)
            ?.toLong()
    }
}
