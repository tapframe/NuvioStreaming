package com.nuvio.app.core.logging

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal actual fun currentInAppLogTimestamp(): String =
    SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
