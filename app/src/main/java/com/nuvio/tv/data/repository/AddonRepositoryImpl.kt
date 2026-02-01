package com.nuvio.tv.data.repository

import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.core.network.safeApiCall
import com.nuvio.tv.data.local.AddonPreferences
import com.nuvio.tv.data.mapper.toDomain
import com.nuvio.tv.data.remote.api.AddonApi
import com.nuvio.tv.domain.model.Addon
import com.nuvio.tv.domain.repository.AddonRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class AddonRepositoryImpl @Inject constructor(
    private val api: AddonApi,
    private val preferences: AddonPreferences
) : AddonRepository {

    override fun getInstalledAddons(): Flow<List<Addon>> =
        preferences.installedAddonUrls.map { urls ->
            val addons = mutableListOf<Addon>()

            for (url in urls) {
                when (val result = fetchAddon(url)) {
                    is NetworkResult.Success -> addons.add(result.data)
                    else -> { /* Skip failed addons */ }
                }
            }

            addons
        }

    override suspend fun fetchAddon(baseUrl: String): NetworkResult<Addon> {
        val cleanBaseUrl = baseUrl.trimEnd('/')
        val manifestUrl = "$cleanBaseUrl/manifest.json"

        return when (val result = safeApiCall { api.getManifest(manifestUrl) }) {
            is NetworkResult.Success -> {
                NetworkResult.Success(result.data.toDomain(cleanBaseUrl))
            }
            is NetworkResult.Error -> result
            NetworkResult.Loading -> NetworkResult.Loading
        }
    }

    override suspend fun addAddon(url: String) {
        preferences.addAddon(url)
    }

    override suspend fun removeAddon(url: String) {
        preferences.removeAddon(url)
    }
}
