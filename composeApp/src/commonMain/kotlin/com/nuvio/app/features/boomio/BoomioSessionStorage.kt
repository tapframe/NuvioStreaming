package com.nuvio.app.features.boomio

/**
 * Persists the bsc companion session token across launches.
 *
 * Mirrors [com.nuvio.app.core.auth.AuthStorage]: the Android actual uses
 * SharedPreferences and must be initialized from `MainActivity.onCreate`; the
 * iOS actual uses NSUserDefaults. Only the opaque `bs_ses_*` token is stored —
 * everything else about the session ([BoomioSessionRepository.BoomioSession])
 * is derived at startup from the token plus the stable device identity.
 */
internal expect object BoomioSessionStorage {
    fun loadSessionToken(): String?
    fun saveSessionToken(token: String)
    fun clearSessionToken()

    /** The TV this phone is paired with (mirrors bsc's 30d `companion:pair:*`). */
    fun loadPairedDeviceId(): String?
    fun savePairedDeviceId(deviceId: String)
    fun clearPairedDeviceId()
}
