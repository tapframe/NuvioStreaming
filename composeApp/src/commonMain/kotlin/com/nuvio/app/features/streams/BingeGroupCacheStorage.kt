package com.nuvio.app.features.streams

internal expect object BingeGroupCacheStorage {
    fun load(hashedKey: String): String?
    fun save(hashedKey: String, value: String)
    fun remove(hashedKey: String)
}
