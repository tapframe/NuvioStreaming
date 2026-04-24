package com.nuvio.app.features.settings

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

enum class DnsProvider(val displayName: String) {
    SYSTEM("System Default (IPv4 Preferred)"),
    CLOUDFLARE("Cloudflare (DoH)"),
    GOOGLE("Google (DoH)"),
    QUAD9("Quad9 (DoH)"),
    ADGUARD("AdGuard (DoH)"),
    NEXTDNS("NextDNS (DoH)"),
    MULLVAD("Mullvad (DoH)"),
    OPEN_DNS("OpenDNS (DoH)")
}

interface NetworkSettingsStorage {
    fun getDnsProvider(): String?
    fun setDnsProvider(provider: String)
}

class NetworkSettingsRepository(
    private val storage: NetworkSettingsStorage
) {
    private val _dnsProvider = MutableStateFlow(
        runCatching {
            val name = storage.getDnsProvider() ?: DnsProvider.SYSTEM.name
            DnsProvider.valueOf(name)
        }.getOrDefault(DnsProvider.SYSTEM)
    )
    val dnsProvider: StateFlow<DnsProvider> = _dnsProvider.asStateFlow()

    fun setDnsProvider(provider: DnsProvider) {
        storage.setDnsProvider(provider.name)
        _dnsProvider.value = provider
    }
}

var globalNetworkSettingsRepository: NetworkSettingsRepository? = null
