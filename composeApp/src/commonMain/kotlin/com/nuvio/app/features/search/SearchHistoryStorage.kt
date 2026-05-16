package com.nuvio.app.features.search

internal expect object SearchHistoryStorage {
    fun loadPayload(): String?
    fun savePayload(payload: String)
    fun loadLimitOverride(): Int?
    fun saveLimitOverride(limit: Int?)
}
