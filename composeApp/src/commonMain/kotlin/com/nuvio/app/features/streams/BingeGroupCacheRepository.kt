package com.nuvio.app.features.streams

object BingeGroupCacheRepository {

    fun save(contentId: String, bingeGroup: String) {
        BingeGroupCacheStorage.save(hashedKey(contentId), bingeGroup)
    }

    fun get(contentId: String): String? {
        return BingeGroupCacheStorage.load(hashedKey(contentId))
    }

    fun remove(contentId: String) {
        BingeGroupCacheStorage.remove(hashedKey(contentId))
    }

    private fun hashedKey(contentId: String): String {
        val hash = contentId.fold(0L) { acc, c -> acc * 31 + c.code }.toULong()
        return "binge_group_$hash"
    }
}
