package com.nuvio.app.features.settings

import android.content.Context
import android.content.SharedPreferences

class AndroidNetworkSettingsStorage(context: Context) : NetworkSettingsStorage {
    private val prefs: SharedPreferences = context.getSharedPreferences("nuvio_network_settings", Context.MODE_PRIVATE)
    private val DNS_PROVIDER_KEY = "dns_provider"

    override fun getDnsProvider(): String? =
        prefs.getString(DNS_PROVIDER_KEY, null)

    override fun setDnsProvider(provider: String) {
        prefs.edit().putString(DNS_PROVIDER_KEY, provider).apply()
    }
}