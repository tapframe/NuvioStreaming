package com.nuvio.tv.domain.repository

import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.domain.model.CatalogRow
import kotlinx.coroutines.flow.Flow

interface CatalogRepository {
    fun getCatalog(
        addonBaseUrl: String,
        addonId: String,
        addonName: String,
        catalogId: String,
        catalogName: String,
        type: String,
        skip: Int = 0,
        extraArgs: Map<String, String> = emptyMap()
    ): Flow<NetworkResult<CatalogRow>>
}
