package com.nuvio.app.features.watched

import com.nuvio.app.features.tracking.TrackingProviderId
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized

internal class WatchedItemsStore {
    private val lock = SynchronizedObject()
    private val nuvioItems = mutableMapOf<String, WatchedItem>()
    private val providerItems = mutableMapOf<TrackingProviderId, MutableMap<String, WatchedItem>>()
    private val dirtyNuvioKeys = mutableSetOf<String>()
    private val dirtyProviderKeys = mutableMapOf<TrackingProviderId, MutableSet<String>>()

    fun <T> read(
        block: (
            nuvioItems: Map<String, WatchedItem>,
            providerItems: Map<TrackingProviderId, Map<String, WatchedItem>>,
            dirtyNuvioKeys: Set<String>,
            dirtyProviderKeys: Map<TrackingProviderId, Set<String>>,
        ) -> T,
    ): T = synchronized(lock) {
        block(nuvioItems, providerItems, dirtyNuvioKeys, dirtyProviderKeys)
    }

    fun <T> update(
        block: (
            nuvioItems: MutableMap<String, WatchedItem>,
            providerItems: MutableMap<TrackingProviderId, MutableMap<String, WatchedItem>>,
            dirtyNuvioKeys: MutableSet<String>,
            dirtyProviderKeys: MutableMap<TrackingProviderId, MutableSet<String>>,
        ) -> T,
    ): T = synchronized(lock) {
        block(nuvioItems, providerItems, dirtyNuvioKeys, dirtyProviderKeys)
    }
}
