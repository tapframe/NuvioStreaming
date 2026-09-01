package com.nuvio.app.features.boomio

/**
 * Runtime configuration for the boomio media-plane integration seam.
 *
 * Both URLs default to blank, which keeps the seam **inert**: [BoomioStreamResolver]
 * and [BsmRatingGate] no-op when their respective base URL is blank, leaving the
 * existing addon/debrid resolvers as the primary stream sources.
 *
 * These are deliberately mutable vars rather than build-time constants so the
 * host application can inject them at startup from its own config source
 * (BuildConfig / gradle properties / env), matching the legacy
 * `BuildConfig.BOOMIO_BASE_URL` / `BuildConfig.BSM_BASE_URL` wiring. Nothing here
 * is read from a secret store or inlined — assign the values at app start.
 *
 * NOTE: this is a static, uncompiled port; the seam has not been exercised against
 * the boomio plane yet.
 */
object BoomioConfig {
    /** Base URL of the boomio media plane (bsf), e.g. `https://bsf.example.com`. */
    var boomioBaseUrl: String = ""

    /** Base URL of the BSM rating service, e.g. `https://bsm.example.com`. */
    var bsmBaseUrl: String = ""

    /**
     * Base URL of the bsc companion hub, e.g. `wss://bsc.example.com`. The phone
     * companion bridge connects to `{companionBaseUrl}/ws/phone?session_token=…&device_id=…`
     * and the TV to `{companionBaseUrl}/ws`. Sourced from `BOOMIO_COMPANION_URL` in
     * `local.properties` (via the generated [BoomioCompanionConfig]); override at
     * startup if needed. Inert when blank — mirrors the blank-inert pattern of the
     * other seams above.
     */
    var companionBaseUrl: String = BoomioCompanionConfig.BASE_URL

    /** True when the companion seam is configured ([companionBaseUrl] is set). */
    fun companionEnabled(): Boolean = companionBaseUrl.isNotBlank()
}

/** REST (`https://`) variant of [BoomioConfig.companionBaseUrl] for the bsc companion API. */
val BoomioConfig.companionRestBaseUrl: String
    get() = companionBaseUrl.trimEnd('/')
        .replaceFirst("wss://", "https://")
        .replaceFirst("ws://", "http://")

/** Phone companion websocket endpoint (`{base}/ws/phone`). */
val BoomioConfig.companionPhoneWsUrl: String
    get() = companionBaseUrl.trimEnd('/') + "/ws/phone"
