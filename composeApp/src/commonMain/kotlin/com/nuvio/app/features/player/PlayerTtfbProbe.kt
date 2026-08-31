package com.nuvio.app.features.player

/**
 * Debug probe holding the time-to-first-byte measured by the platform player's
 * HTTP data-source wrapper. The Android media3 wrapper ([LoggingDataSource] in
 * androidMain) records the first successful `open()` latency here; the
 * stream-info overlay reads it.
 *
 * Kept in commonMain so the overlay and the runtime can read it without an
 * expect/actual for a debug value. Desktop (vendored compose-media-player) and
 * iOS platform hooks are follow-ups: until they write here, the probe reports
 * [UNSET] and the overlay hides the field.
 *
 * NOTE: static, uncompiled port of the legacy `LoggingDataSource` companion.
 */
object PlayerTtfbProbe {
    const val UNSET = -1L

    private var firstOpenMs: Long = UNSET

    /** Records the first successful open only; later opens are range probes. */
    fun recordFirstOpen(elapsedMs: Long) {
        if (firstOpenMs == UNSET) {
            firstOpenMs = elapsedMs.coerceAtLeast(0L)
        }
    }

    fun firstOpenMillis(): Long = firstOpenMs

    fun clear() {
        firstOpenMs = UNSET
    }
}
