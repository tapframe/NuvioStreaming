package com.nuvio.app.features.watched

import com.nuvio.app.features.tracking.TrackingProviderId
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class WatchedItemsStoreTest {
    @Test
    fun `concurrent updates publish coherent item snapshots`() = runBlocking {
        val store = WatchedItemsStore()

        coroutineScope {
            repeat(4) { writer ->
                launch(Dispatchers.Default) {
                    repeat(500) { index ->
                        val key = "$writer:$index"
                        val item = WatchedItem(
                            id = key,
                            type = "movie",
                            name = key,
                            markedAtEpochMs = index.toLong(),
                        )
                        store.update { nuvioItems, providerItems, dirtyNuvioKeys ->
                            nuvioItems[key] = item
                            providerItems
                                .getOrPut(TrackingProviderId.TRAKT, ::mutableMapOf)[key] = item
                            dirtyNuvioKeys += key
                        }
                    }
                }
            }
            repeat(4) {
                launch(Dispatchers.Default) {
                    repeat(500) {
                        store.read { nuvioItems, providerItems, dirtyNuvioKeys ->
                            val nuvioKeys = nuvioItems.keys.toSet()
                            assertEquals(nuvioKeys, providerItems[TrackingProviderId.TRAKT].orEmpty().keys)
                            assertEquals(nuvioKeys, dirtyNuvioKeys)
                        }
                    }
                }
            }
        }

        store.read { nuvioItems, providerItems, dirtyNuvioKeys ->
            assertEquals(2_000, nuvioItems.size)
            assertEquals(nuvioItems.keys, providerItems[TrackingProviderId.TRAKT].orEmpty().keys)
            assertEquals(nuvioItems.keys, dirtyNuvioKeys)
        }
    }
}
