package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

internal fun LazyListScope.networkSettingsContent(
    isTablet: Boolean,
) {
    item {
        val repository = globalNetworkSettingsRepository ?: return@item
        val currentProvider by repository.dnsProvider.collectAsState()

        androidx.compose.foundation.layout.Column(
            modifier = Modifier.padding(horizontal = if (isTablet) 24.dp else 0.dp)
        ) {
            SettingsSection(
                title = "DNS OVER HTTPS (ANDROID ONLY)", 
                isTablet = isTablet
            ) {
                SettingsGroup(isTablet = isTablet) {
                    DnsProvider.entries.forEachIndexed { index, provider ->
                        SettingsRadioRow(
                            title = provider.displayName,
                            description = if (provider == DnsProvider.SYSTEM) "Use the system's default DNS resolver." else "Encrypt DNS queries via ${provider.name.lowercase()}.",
                            selected = currentProvider == provider,
                            onClick = { repository.setDnsProvider(provider) },
                            isTablet = isTablet
                        )
                        if (index < DnsProvider.entries.lastIndex) {
                            SettingsGroupDivider(isTablet = isTablet)
                        }
                    }
                }
            }
        }
    }
}
