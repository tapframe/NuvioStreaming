package com.nuvio.app.features.player

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val LOCAL_AUDIO_LOG_FILE = "local_audio_debug.log"

internal actual fun logLocalAudio(context: Any?, message: String) {
    val ctx = context as? Context ?: return
    runCatching {
        val file = File(ctx.filesDir, LOCAL_AUDIO_LOG_FILE)
        val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(Date())
        file.appendText("$stamp $message\n")
    }
}
