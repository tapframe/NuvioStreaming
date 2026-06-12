package com.nuvio.app.features.player.skip

import java.time.LocalDate

internal actual fun currentDateComponents(): DateComponents {
    val today = LocalDate.now()
    return DateComponents(
        year = today.year,
        month = today.monthValue,
        day = today.dayOfMonth,
    )
}
