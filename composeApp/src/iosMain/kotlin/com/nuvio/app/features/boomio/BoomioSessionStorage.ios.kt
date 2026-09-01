package com.nuvio.app.features.boomio

import platform.Foundation.NSUserDefaults

actual object BoomioSessionStorage {
    private const val KEY_SESSION_TOKEN = "boomio_session_token"
    private const val KEY_PAIRED_DEVICE_ID = "boomio_paired_device_id"

    actual fun loadSessionToken(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(KEY_SESSION_TOKEN)

    actual fun saveSessionToken(token: String) {
        NSUserDefaults.standardUserDefaults.setObject(token, forKey = KEY_SESSION_TOKEN)
    }

    actual fun clearSessionToken() {
        NSUserDefaults.standardUserDefaults.removeObjectForKey(KEY_SESSION_TOKEN)
    }

    actual fun loadPairedDeviceId(): String? =
        NSUserDefaults.standardUserDefaults.stringForKey(KEY_PAIRED_DEVICE_ID)

    actual fun savePairedDeviceId(deviceId: String) {
        NSUserDefaults.standardUserDefaults.setObject(deviceId, forKey = KEY_PAIRED_DEVICE_ID)
    }

    actual fun clearPairedDeviceId() {
        NSUserDefaults.standardUserDefaults.removeObjectForKey(KEY_PAIRED_DEVICE_ID)
    }
}
