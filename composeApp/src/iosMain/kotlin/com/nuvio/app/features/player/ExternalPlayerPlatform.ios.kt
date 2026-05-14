package com.nuvio.app.features.player

import platform.Foundation.NSURL
import platform.UIKit.UIApplication

private data class IosExternalPlayerSpec(
    val id: String,
    val name: String,
    val scheme: String,
    val buildUrl: (ExternalPlayerPlaybackRequest) -> String,
)

private val iosExternalPlayerSpecs = listOf(
    IosExternalPlayerSpec(
        id = "infuse",
        name = "Infuse",
        scheme = "infuse",
        buildUrl = { request ->
            buildString {
                append("infuse://x-callback-url/play?url=")
                append(request.sourceUrl.urlQueryEncode())
                append("&filename=")
                append((request.streamTitle ?: request.title).urlQueryEncode())
            }
        },
    ),
    IosExternalPlayerSpec(
        id = "vlc",
        name = "VLC",
        scheme = "vlc-x-callback",
        buildUrl = { request ->
            "vlc-x-callback://x-callback-url/stream?url=${request.sourceUrl.urlQueryEncode()}"
        },
    ),
    IosExternalPlayerSpec(
        id = "outplayer",
        name = "Outplayer",
        scheme = "outplayer",
        buildUrl = { request ->
            buildString {
                append("outplayer://x-callback-url/play?url=")
                append(request.sourceUrl.urlQueryEncode())
                append("&filename=")
                append((request.streamTitle ?: request.title).urlQueryEncode())
            }
        },
    ),
    IosExternalPlayerSpec(
        id = "vidhub",
        name = "VidHub",
        scheme = "open-vidhub",
        buildUrl = { request ->
            "open-vidhub://x-callback-url/open?url=${request.sourceUrl.urlQueryEncode()}"
        },
    ),
)

internal actual object ExternalPlayerPlatform {
    actual fun defaultPlayerId(): String? = null

    actual fun availablePlayers(): List<ExternalPlayerApp> =
        iosExternalPlayerSpecs
            .filter { spec -> UIApplication.sharedApplication.canOpenURL(spec.schemeProbeUrl()) }
            .map { spec -> ExternalPlayerApp(spec.id, spec.name) }

    actual fun open(
        request: ExternalPlayerPlaybackRequest,
        playerId: String?,
    ): ExternalPlayerOpenResult {
        if (playerId.isNullOrBlank()) return ExternalPlayerOpenResult.NotConfigured
        val spec = iosExternalPlayerSpecs.firstOrNull { it.id == playerId }
            ?: return ExternalPlayerOpenResult.NotConfigured
        if (!UIApplication.sharedApplication.canOpenURL(spec.schemeProbeUrl())) {
            return ExternalPlayerOpenResult.NoPlayerAvailable
        }
        val url = NSURL.URLWithString(spec.buildUrl(request))
            ?: return ExternalPlayerOpenResult.Failed
        UIApplication.sharedApplication.openURL(
            url = url,
            options = emptyMap<Any?, Any>(),
            completionHandler = null,
        )
        return ExternalPlayerOpenResult.Opened
    }
}

private fun IosExternalPlayerSpec.schemeProbeUrl(): NSURL =
    NSURL.URLWithString("$scheme://") ?: NSURL.URLWithString("nuvio://")!!

private fun String.urlQueryEncode(): String {
    val hex = "0123456789ABCDEF"
    return buildString {
        encodeToByteArray().forEach { byte ->
            val value = byte.toInt() and 0xFF
            val char = value.toChar()
            val safe = char in 'A'..'Z' ||
                char in 'a'..'z' ||
                char in '0'..'9' ||
                char == '-' ||
                char == '_' ||
                char == '.' ||
                char == '~'
            if (safe) {
                append(char)
            } else {
                append('%')
                append(hex[value ushr 4])
                append(hex[value and 0x0F])
            }
        }
    }
}
