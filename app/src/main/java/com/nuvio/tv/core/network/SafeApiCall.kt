package com.nuvio.tv.core.network

import retrofit2.Response

suspend fun <T> safeApiCall(apiCall: suspend () -> Response<T>): NetworkResult<T> {
    return try {
        val response = apiCall()
        if (response.isSuccessful) {
            response.body()?.let {
                NetworkResult.Success(it)
            } ?: NetworkResult.Error("Empty response body")
        } else {
            NetworkResult.Error(response.message(), response.code())
        }
    } catch (e: Exception) {
        NetworkResult.Error(e.message ?: "Unknown error occurred")
    }
}
