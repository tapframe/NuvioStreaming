package com.nuvio.app.features.player

import kotlinx.cinterop.ExperimentalForeignApi
import platform.Foundation.NSString
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSUTF8StringEncoding
import platform.Foundation.NSUUID
import platform.Foundation.writeToFile

@OptIn(ExperimentalForeignApi::class)
internal actual fun writeTemporaryHlsPlaylist(playlistText: String): String? {
    val directory = NSTemporaryDirectory().trimEnd('/')
    val filename = "nuvio_player_quality_${NSUUID().UUIDString}.m3u8"
    val path = "$directory/$filename"
    val success = (playlistText as NSString).writeToFile(
        path,
        atomically = true,
        encoding = NSUTF8StringEncoding,
        error = null,
    )
    return if (success) "file://$path" else null
}
