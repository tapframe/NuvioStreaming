package com.nuvio.app.features.watchprogress

import java.time.LocalDate

actual object CurrentDateProvider {
    actual fun todayIsoDate(): String = LocalDate.now().toString()
}
