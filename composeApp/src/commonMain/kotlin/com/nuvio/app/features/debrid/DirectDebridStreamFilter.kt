package com.nuvio.app.features.debrid

import com.nuvio.app.features.streams.StreamItem

object DirectDebridStreamFilter {
    const val FALLBACK_SOURCE_NAME = "Direct Debrid"

    fun filterInstant(streams: List<StreamItem>): List<StreamItem> =
        streams
            .filter(::isInstantCandidate)
            .map { stream ->
                val providerId = stream.clientResolve?.service
                val sourceName = DebridProviders.instantName(providerId)
                stream.copy(
                    name = stream.name ?: sourceName,
                    addonName = sourceName,
                    addonId = DebridProviders.addonId(providerId),
                    sourceName = stream.sourceName ?: FALLBACK_SOURCE_NAME,
                )
            }
            .distinctBy { stream ->
                listOf(
                    stream.clientResolve?.infoHash?.lowercase(),
                    stream.clientResolve?.fileIdx?.toString(),
                    stream.clientResolve?.filename,
                    stream.name,
                    stream.title,
                ).joinToString("|")
            }

    fun isInstantCandidate(stream: StreamItem): Boolean {
        val resolve = stream.clientResolve ?: return false
        return resolve.type.equals("debrid", ignoreCase = true) &&
            DebridProviders.isSupported(resolve.service) &&
            resolve.isCached == true
    }

    fun isDirectDebridSourceName(addonName: String): Boolean =
        DebridProviders.all().any { addonName == DebridProviders.instantName(it.id) }
}

