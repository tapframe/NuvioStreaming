package com.nuvio.app.features.boomio

import android.content.Context
import android.content.SharedPreferences

actual object BoomioSessionStorage {
    private const val PREFS_NAME = "nuvio_boomio"
    private const val KEY_SESSION_TOKEN = "session_token"
    private const val KEY_PAIRED_DEVICE_ID = "paired_device_id"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    actual fun loadSessionToken(): String? =
        preferences?.getString(KEY_SESSION_TOKEN, null)

    actual fun saveSessionToken(token: String) {
        preferences?.edit()?.putString(KEY_SESSION_TOKEN, token)?.apply()
    }

    actual fun clearSessionToken() {
        preferences?.edit()?.remove(KEY_SESSION_TOKEN)?.apply()
    }

    actual fun loadPairedDeviceId(): String? =
        preferences?.getString(KEY_PAIRED_DEVICE_ID, null)

    actual fun savePairedDeviceId(deviceId: String) {
        preferences?.edit()?.putString(KEY_PAIRED_DEVICE_ID, deviceId)?.apply()
    }

    actual fun clearPairedDeviceId() {
        preferences?.edit()?.remove(KEY_PAIRED_DEVICE_ID)?.apply()
    }
}
