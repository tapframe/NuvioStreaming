package com.nuvio.app.features.library.sync

internal const val librarySnapshotPageSize = 500
internal const val libraryDeltaPageSize = 500
internal const val libraryMutationBatchSize = 500

internal suspend fun <T> collectOffsetPages(
    pageSize: Int,
    fetchPage: suspend (limit: Int, offset: Int) -> List<T>,
): List<T> {
    require(pageSize > 0)

    val items = mutableListOf<T>()
    var offset = 0
    while (true) {
        val page = fetchPage(pageSize, offset)
        items += page
        if (page.size < pageSize) return items
        offset += pageSize
    }
}

internal suspend fun <T> consumeCursorPages(
    initialCursor: Long,
    pageSize: Int,
    fetchPage: suspend (cursor: Long, limit: Int) -> List<T>,
    applyPage: suspend (page: List<T>, cursor: Long) -> Long?,
): Long {
    require(pageSize > 0)

    var cursor = initialCursor
    while (true) {
        val page = fetchPage(cursor, pageSize)
        if (page.isEmpty()) return cursor

        val nextCursor = applyPage(page, cursor) ?: return cursor
        check(nextCursor > cursor)
        cursor = nextCursor
        if (page.size < pageSize) return cursor
    }
}

internal suspend fun <T> forEachMutationBatch(
    values: Collection<T>,
    batchSize: Int,
    sendBatch: suspend (List<T>) -> Unit,
) {
    require(batchSize > 0)
    values.chunked(batchSize).forEach { batch ->
        sendBatch(batch)
    }
}
