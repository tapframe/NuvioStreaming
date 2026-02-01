package com.nuvio.tv.data.repository

import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.core.network.safeApiCall
import com.nuvio.tv.data.mapper.toDomain
import com.nuvio.tv.data.remote.api.AddonApi
import com.nuvio.tv.domain.model.CatalogRow
import com.nuvio.tv.domain.model.ContentType
import com.nuvio.tv.domain.repository.CatalogRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.net.URLEncoder
import javax.inject.Inject

class CatalogRepositoryImpl @Inject constructor(
    private val api: AddonApi
) : CatalogRepository {

    override fun getCatalog(
        addonBaseUrl: String,
        addonId: String,
        addonName: String,
        catalogId: String,
        catalogName: String,
        type: String,
        skip: Int,
        extraArgs: Map<String, String>
    ): Flow<NetworkResult<CatalogRow>> = flow {
        emit(NetworkResult.Loading)

        val url = buildCatalogUrl(addonBaseUrl, type, catalogId, skip, extraArgs)

        when (val result = safeApiCall { api.getCatalog(url) }) {
            is NetworkResult.Success -> {
                val items = result.data.metas.map { it.toDomain() }
                val catalogRow = CatalogRow(
                    addonId = addonId,
                    addonName = addonName,
                    addonBaseUrl = addonBaseUrl,
                    catalogId = catalogId,
                    catalogName = catalogName,
                    type = ContentType.fromString(type),
                    items = items,
                    isLoading = false,
                    hasMore = items.size >= 100,
                    currentPage = skip / 100
                )
                emit(NetworkResult.Success(catalogRow))
            }
            is NetworkResult.Error -> emit(result)
            NetworkResult.Loading -> { /* Already emitted */ }
        }
    }

    private fun buildCatalogUrl(
        baseUrl: String,
        type: String,
        catalogId: String,
        skip: Int,
        extraArgs: Map<String, String>
    ): String {
        val cleanBaseUrl = baseUrl.trimEnd('/')

        if (extraArgs.isEmpty()) {
            return if (skip > 0) {
                "$cleanBaseUrl/catalog/$type/$catalogId/skip=$skip.json"
            } else {
                "$cleanBaseUrl/catalog/$type/$catalogId.json"
            }
        }

        val allArgs = LinkedHashMap<String, String>()
        allArgs.putAll(extraArgs)

        // For Stremio catalogs, pagination is controlled by `skip` inside extraArgs.
        if (!allArgs.containsKey("skip") && (skip > 0 || allArgs.containsKey("search"))) {
            allArgs["skip"] = skip.toString()
        }

        val encodedArgs = allArgs.entries.joinToString("&") { (key, value) ->
            "${encodeArg(key)}=${encodeArg(value)}"
        }

        return "$cleanBaseUrl/catalog/$type/$catalogId/$encodedArgs.json"
    }

    private fun encodeArg(value: String): String {
        return URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}
