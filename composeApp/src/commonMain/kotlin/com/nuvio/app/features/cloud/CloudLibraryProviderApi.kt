package com.nuvio.app.features.cloud

import com.nuvio.app.features.debrid.DebridProvider
import com.nuvio.app.features.debrid.DebridProviders

internal interface CloudLibraryProviderApi {
    val provider: DebridProvider

    suspend fun listItems(apiKey: String): Result<List<CloudLibraryItem>>

    suspend fun resolvePlayback(
        apiKey: String,
        item: CloudLibraryItem,
        file: CloudLibraryFile,
    ): CloudLibraryPlaybackResult
}

internal object CloudLibraryProviderApis {
    private val registered = listOf(
        TorboxCloudLibraryProviderApi(),
        PremiumizeCloudLibraryProviderApi(),
    )

    fun all(): List<CloudLibraryProviderApi> = registered

    fun apiFor(providerId: String?): CloudLibraryProviderApi? {
        val normalized = DebridProviders.byId(providerId)?.id ?: return null
        return registered.firstOrNull { it.provider.id == normalized }
    }
}
