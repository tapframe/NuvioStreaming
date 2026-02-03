package com.nuvio.tv.data.repository

import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.core.network.safeApiCall
import com.nuvio.tv.data.mapper.toDomain
import com.nuvio.tv.data.remote.api.AddonApi
import com.nuvio.tv.domain.model.Meta
import com.nuvio.tv.domain.repository.AddonRepository
import com.nuvio.tv.domain.repository.MetaRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MetaRepositoryImpl @Inject constructor(
    private val api: AddonApi,
    private val addonRepository: AddonRepository
) : MetaRepository {

    // In-memory cache: "type:id" -> Meta
    private val metaCache = ConcurrentHashMap<String, Meta>()

    override fun getMeta(
        addonBaseUrl: String,
        type: String,
        id: String
    ): Flow<NetworkResult<Meta>> = flow {
        val cacheKey = "$type:$id"
        metaCache[cacheKey]?.let { cached ->
            emit(NetworkResult.Success(cached))
            return@flow
        }

        emit(NetworkResult.Loading)

        val url = buildMetaUrl(addonBaseUrl, type, id)

        when (val result = safeApiCall { api.getMeta(url) }) {
            is NetworkResult.Success -> {
                val metaDto = result.data.meta
                if (metaDto != null) {
                    val meta = metaDto.toDomain()
                    metaCache[cacheKey] = meta
                    emit(NetworkResult.Success(meta))
                } else {
                    emit(NetworkResult.Error("Meta not found"))
                }
            }
            is NetworkResult.Error -> emit(result)
            NetworkResult.Loading -> { /* Already emitted */ }
        }
    }

    override fun getMetaFromAllAddons(
        type: String,
        id: String
    ): Flow<NetworkResult<Meta>> = flow {
        val cacheKey = "$type:$id"
        metaCache[cacheKey]?.let { cached ->
            emit(NetworkResult.Success(cached))
            return@flow
        }

        emit(NetworkResult.Loading)

        val addons = addonRepository.getInstalledAddons().first()

        // Find addons that support meta resource for this type
        // Resources can be simple strings like "meta" or objects with name/types
        val metaAddons = addons.filter { addon ->
            addon.resources.any { resource ->
                resource.name == "meta" &&
                (resource.types.isEmpty() || resource.types.contains(type))
            }
        }

        if (metaAddons.isEmpty()) {
            // Fallback: try all addons that have the type in their supported types
            val fallbackAddons = addons.filter { addon ->
                addon.types.any { it.toApiString() == type }
            }

            for (addon in fallbackAddons) {
                val url = buildMetaUrl(addon.baseUrl, type, id)
                when (val result = safeApiCall { api.getMeta(url) }) {
                    is NetworkResult.Success -> {
                        val metaDto = result.data.meta
                        if (metaDto != null) {
                            val meta = metaDto.toDomain()
                            metaCache[cacheKey] = meta
                            emit(NetworkResult.Success(meta))
                            return@flow
                        }
                    }
                    else -> { /* Try next addon */ }
                }
            }

            emit(NetworkResult.Error("No addons support meta for type: $type"))
            return@flow
        }

        // Try each addon until we find meta
        for (addon in metaAddons) {
            val url = buildMetaUrl(addon.baseUrl, type, id)
            when (val result = safeApiCall { api.getMeta(url) }) {
                is NetworkResult.Success -> {
                    val metaDto = result.data.meta
                    if (metaDto != null) {
                        val meta = metaDto.toDomain()
                        metaCache[cacheKey] = meta
                        emit(NetworkResult.Success(meta))
                        return@flow
                    }
                }
                else -> { /* Try next addon */ }
            }
        }

        emit(NetworkResult.Error("Meta not found in any addon"))
    }

    private fun buildMetaUrl(baseUrl: String, type: String, id: String): String {
        val cleanBaseUrl = baseUrl.trimEnd('/')
        return "$cleanBaseUrl/meta/$type/$id.json"
    }
}
