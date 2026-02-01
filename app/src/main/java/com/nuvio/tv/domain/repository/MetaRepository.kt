package com.nuvio.tv.domain.repository

import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.domain.model.Meta
import kotlinx.coroutines.flow.Flow

interface MetaRepository {
    fun getMeta(
        addonBaseUrl: String,
        type: String,
        id: String
    ): Flow<NetworkResult<Meta>>
    
    fun getMetaFromAllAddons(
        type: String,
        id: String
    ): Flow<NetworkResult<Meta>>
}
