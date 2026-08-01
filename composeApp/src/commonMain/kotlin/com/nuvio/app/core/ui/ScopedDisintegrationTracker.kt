package com.nuvio.app.core.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

internal data class DisintegrationTrackedItem<K, T>(
    val key: K,
    val item: T,
    val exiting: Boolean,
)

internal class ScopedDisintegrationTracker<S, K, T>(
    private val itemKey: (T) -> K,
) {
    private val exiting = LinkedHashMap<K, Pair<T, Int>>()
    private var previous = LinkedHashMap<K, Pair<T, Int>>()
    private var activeScope: S? = null
    private var hasActiveScope = false
    private var invalidations by mutableStateOf(0)

    fun onDisintegrated(key: K) {
        if (exiting.remove(key) != null) invalidations++
    }

    fun reset() {
        exiting.clear()
        previous = LinkedHashMap()
        activeScope = null
        hasActiveScope = false
    }

    fun sync(scope: S, items: List<T>): List<DisintegrationTrackedItem<K, T>> {
        @Suppress("UNUSED_EXPRESSION")
        invalidations

        if (!hasActiveScope || activeScope != scope) {
            exiting.clear()
            previous = LinkedHashMap()
            activeScope = scope
            hasActiveScope = true
        }

        val current = LinkedHashMap<K, Pair<T, Int>>()
        items.forEachIndexed { index, item -> current[itemKey(item)] = item to index }

        for ((key, info) in previous) {
            if (key !in current && key !in exiting) {
                exiting[key] = info
            }
        }
        for (key in current.keys) {
            exiting.remove(key)
        }
        previous = current

        val entries = ArrayList<DisintegrationTrackedItem<K, T>>(items.size + exiting.size)
        items.forEach { item ->
            val key = itemKey(item)
            entries += DisintegrationTrackedItem(key, item, exiting = false)
        }
        exiting.entries
            .sortedBy { it.value.second }
            .forEach { (key, info) ->
                val insertAt = info.second.coerceIn(0, entries.size)
                entries.add(insertAt, DisintegrationTrackedItem(key, info.first, exiting = true))
            }

        return entries
    }
}
