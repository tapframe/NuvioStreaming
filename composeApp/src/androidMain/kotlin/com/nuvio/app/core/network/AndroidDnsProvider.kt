package com.nuvio.app.core.network

import com.nuvio.app.features.settings.DnsProvider
import com.nuvio.app.features.settings.globalNetworkSettingsRepository
import okhttp3.Dns
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.dnsoverhttps.DnsOverHttps
import java.net.InetAddress
import java.io.File
import okhttp3.Cache

object AndroidDnsProvider : Dns {
    
    // A dedicated minimal client just for DoH resolutions
    private val bootstrapClient by lazy {
        OkHttpClient.Builder()
            .dns(IPv4FirstDns(Dns.SYSTEM))
            .build()
    }

    private val cloudflareDns by lazy {
        DnsOverHttps.Builder().client(bootstrapClient)
            .url("https://cloudflare-dns.com/dns-query".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("1.1.1.1"),
                InetAddress.getByName("1.0.0.1"),
                InetAddress.getByName("2606:4700:4700::1111"),
                InetAddress.getByName("2606:4700:4700::1001")
            )
            .build()
    }

    private val googleDns by lazy {
        DnsOverHttps.Builder().client(bootstrapClient)
            .url("https://dns.google/dns-query".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("8.8.8.8"),
                InetAddress.getByName("8.8.4.4"),
                InetAddress.getByName("2001:4860:4860::8888"),
                InetAddress.getByName("2001:4860:4860::8844")
            )
            .build()
    }

    private val quad9Dns by lazy {
        DnsOverHttps.Builder().client(bootstrapClient)
            .url("https://dns.quad9.net/dns-query".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("9.9.9.9"),
                InetAddress.getByName("149.112.112.112"),
                InetAddress.getByName("2620:fe::fe"),
                InetAddress.getByName("2620:fe::9")
            )
            .build()
    }

    private val adGuardDns by lazy {
        DnsOverHttps.Builder().client(bootstrapClient)
            .url("https://dns.adguard-dns.com/dns-query".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("94.140.14.14"),
                InetAddress.getByName("94.140.15.15"),
                InetAddress.getByName("2a10:50c0::ad1"),
                InetAddress.getByName("2a10:50c0::ad2")
            )
            .build()
    }

    private val nextDns by lazy {
        DnsOverHttps.Builder().client(bootstrapClient)
            .url("https://dns.nextdns.io".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("45.90.28.0"),
                InetAddress.getByName("45.90.30.0"),
                InetAddress.getByName("2a07:a8c0::"),
                InetAddress.getByName("2a07:a8c1::")
            )
            .build()
    }

    private val mullvadDns by lazy {
        DnsOverHttps.Builder().client(bootstrapClient)
            .url("https://doh.mullvad.net/dns-query".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("194.242.2.4"),
                InetAddress.getByName("2a07:e340::4")
            )
            .build()
    }

    private val openDns by lazy {
        DnsOverHttps.Builder().client(bootstrapClient)
            .url("https://doh.opendns.com/dns-query".toHttpUrl())
            .bootstrapDnsHosts(
                InetAddress.getByName("208.67.222.222"),
                InetAddress.getByName("208.67.220.220"),
                InetAddress.getByName("2620:119:35::35"),
                InetAddress.getByName("2620:119:53::53")
            )
            .build()
    }

    private val systemDns = IPv4FirstDns(Dns.SYSTEM)

    override fun lookup(hostname: String): List<InetAddress> {
        val currentProvider = runCatching { globalNetworkSettingsRepository?.dnsProvider?.value }.getOrNull() ?: DnsProvider.SYSTEM
        
        val activeDns = when (currentProvider) {
            DnsProvider.CLOUDFLARE -> cloudflareDns
            DnsProvider.GOOGLE -> googleDns
            DnsProvider.QUAD9 -> quad9Dns
            DnsProvider.ADGUARD -> adGuardDns
            DnsProvider.NEXTDNS -> nextDns
            DnsProvider.MULLVAD -> mullvadDns
            DnsProvider.OPEN_DNS -> openDns
            DnsProvider.SYSTEM -> systemDns
        }

        return try {
            activeDns.lookup(hostname)
        } catch (e: Exception) {
            // Fallback to system DNS if DoH fails
            systemDns.lookup(hostname)
        }
    }
}
