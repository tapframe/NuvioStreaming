package com.nuvio.tv.data.repository

import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.core.network.safeApiCall
import com.nuvio.tv.data.local.AddonPreferences
import com.nuvio.tv.data.mapper.toDomain
import com.nuvio.tv.data.remote.api.AddonApi
import com.nuvio.tv.domain.model.Addon
import com.nuvio.tv.domain.repository.AddonRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import javax.inject.Inject

class AddonRepositoryImpl @Inject constructor(
    private val api: AddonApi,
    private val preferences: AddonPreferences
) : AddonRepository {

    override fun getInstalledAddons(): Flow<List<Addon>> =
        preferences.installedAddonUrls.flatMapLatest { urls ->
            flow {
                val addons = urls.mapNotNull { url ->
                    when (val result = fetchAddon(url)) {
                        is NetworkResult.Success -> result.data
                        else -> null // Skip failed addons
                    }
                }
                emit(addons)
            }.flowOn(Dispatchers.IO)
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
