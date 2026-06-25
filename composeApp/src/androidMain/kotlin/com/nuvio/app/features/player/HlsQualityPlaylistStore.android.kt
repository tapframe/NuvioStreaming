package com.nuvio.app.features.player

import java.io.File

internal actual fun writeTemporaryHlsPlaylist(playlistText: String): String? = runCatching {
    val file = File.createTempFile("nuvio_hls_quality_", ".m3u8")
    file.writeText(playlistText)
    file.deleteOnExit()
    file.toURI().toString()
}.getOrNull()
