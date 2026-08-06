package com.nuvio.app.features.player

internal fun canAutomaticallyFetchAddonSubtitles(
    mode: AddonSubtitleStartupMode,
    playerInitialized: Boolean,
): Boolean = mode != AddonSubtitleStartupMode.FAST_STARTUP || playerInitialized
