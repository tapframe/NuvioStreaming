package com.nuvio.app.features.library.sync

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class LibrarySyncPagingTest {

    @Test
    fun `snapshot paging collects more than two full pages`() = runBlocking {
        val source = (1..1_201).toList()
        val offsets = mutableListOf<Int>()

        val result = collectOffsetPages(pageSize = librarySnapshotPageSize) { limit, offset ->
            offsets += offset
            source.drop(offset).take(limit)
        }

        assertEquals(source, result)
        assertEquals(listOf(0, 500, 1_000), offsets)
    }

    @Test
    fun `snapshot paging terminates after an exact page multiple`() = runBlocking {
        val source = (1..1_000).toList()
        val offsets = mutableListOf<Int>()

        val result = collectOffsetPages(pageSize = librarySnapshotPageSize) { limit, offset ->
            offsets += offset
            source.drop(offset).take(limit)
        }

        assertEquals(source, result)
        assertEquals(listOf(0, 500, 1_000), offsets)
    }

    @Test
    fun `delta paging consumes every page and advances the cursor`() = runBlocking {
        val events = (1L..1_201L).toList()
        val requestedCursors = mutableListOf<Long>()

        val cursor = consumeCursorPages(
            initialCursor = 0L,
            pageSize = libraryDeltaPageSize,
            fetchPage = { currentCursor, limit ->
                requestedCursors += currentCursor
                events.filter { it > currentCursor }.take(limit)
            },
            applyPage = { page, _ -> page.last() },
        )

        assertEquals(1_201L, cursor)
        assertEquals(listOf(0L, 500L, 1_000L), requestedCursors)
    }

    @Test
    fun `delta paging terminates after an exact page multiple`() = runBlocking {
        val events = (1L..1_000L).toList()
        val requestedCursors = mutableListOf<Long>()

        val cursor = consumeCursorPages(
            initialCursor = 0L,
            pageSize = libraryDeltaPageSize,
            fetchPage = { currentCursor, limit ->
                requestedCursors += currentCursor
                events.filter { it > currentCursor }.take(limit)
            },
            applyPage = { page, _ -> page.last() },
        )

        assertEquals(1_000L, cursor)
        assertEquals(listOf(0L, 500L, 1_000L), requestedCursors)
    }

    @Test
    fun `mutation batching preserves long upsert and delete sets`() = runBlocking {
        val upserts = (1..1_201).toList()
        val deletes = (1..1_001).toList()
        val upsertBatches = mutableListOf<List<Int>>()
        val deleteBatches = mutableListOf<List<Int>>()

        forEachMutationBatch(upserts, batchSize = libraryMutationBatchSize) { batch ->
            upsertBatches += batch
        }
        forEachMutationBatch(deletes, batchSize = libraryMutationBatchSize) { batch ->
            deleteBatches += batch
        }

        assertEquals(listOf(500, 500, 201), upsertBatches.map { it.size })
        assertEquals(listOf(500, 500, 1), deleteBatches.map { it.size })
        assertEquals(upserts, upsertBatches.flatten())
        assertEquals(deletes, deleteBatches.flatten())
    }
}
