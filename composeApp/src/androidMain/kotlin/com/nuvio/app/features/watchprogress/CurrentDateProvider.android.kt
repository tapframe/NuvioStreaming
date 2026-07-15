package com.nuvio.app.features.watchprogress

import java.time.LocalDate
import java.time.ZoneId

actual object CurrentDateProvider {
    actual fun todayIsoDate(): String = LocalDate.now().toString()

    actual fun localStartOfDayEpochMs(isoDate: String): Long? =
        runCatching {
            LocalDate.parse(isoDate)
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli()
        }.getOrNull()
}
