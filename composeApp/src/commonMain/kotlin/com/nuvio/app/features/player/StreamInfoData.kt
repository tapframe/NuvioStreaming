package com.nuvio.app.features.player

/**
 * Snapshot of stream provenance + playback diagnostics surfaced in the
 * stream-info overlay. Populated from the active [PlayerLaunch] plus the
 * platform player's time-to-first-byte probe.
 *
 * NOTE: static, uncompiled port of the legacy `StreamInfoData`.
 */
data class StreamInfoData(
    // Stream source
    val addonName: String? = null,
    val addonLogo: String? = null,
    val streamName: String? = null,
    val streamDescription: String? = null,
    // File info
    val filename: String? = null,
    val fileSize: Long? = null,
    // Video
    val videoCodec: String? = null,
    val videoWidth: Int? = null,
    val videoHeight: Int? = null,
    val videoFrameRate: Float? = null,
    val videoBitrate: Int? = null,
    val fileBitrate: Int? = null,
    // Audio
    val audioCodec: String? = null,
    val audioChannels: String? = null,
    val audioSampleRate: Int? = null,
    val audioLanguage: String? = null,
    // Subtitle
    val subtitleName: String? = null,
    val subtitleCodec: String? = null,
    val subtitleLanguage: String? = null,
    val subtitleSource: String? = null,
    val playerEngine: String? = null,
    // Playback provenance / timing
    val streamUrl: String? = null,
    val timeToFirstByteMs: Long? = null,
)
