package com.nuvio.app.features.watchprogress

import platform.Foundation.NSDate
import platform.Foundation.NSDateFormatter
import platform.Foundation.timeIntervalSince1970

actual object CurrentDateProvider {
    actual fun todayIsoDate(): String {
        val formatter = NSDateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.stringFromDate(NSDate())
    }

    actual fun localStartOfDayEpochMs(isoDate: String): Long? {
        val formatter = NSDateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.dateFromString(isoDate)?.timeIntervalSince1970?.times(1_000.0)?.toLong()
    }
}
