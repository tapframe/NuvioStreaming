package com.nuvio.app.navigation

import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavEntryDecorator

internal class RouteDisposalNavEntryDecorator<T : Any> private constructor(
    private val registry: RouteDisposalRegistry<T>,
) : NavEntryDecorator<T>(
    onPop = registry::dispose,
    decorate = { entry -> entry.Content() },
) {
    constructor(onDispose: (T) -> Unit) : this(RouteDisposalRegistry(onDispose))

    fun register(key: T, entry: NavEntry<T>): NavEntry<T> = entry.also {
        registry.register(contentKey = entry.contentKey, key = key)
    }
}

internal class RouteDisposalRegistry<T : Any>(
    private val onDispose: (T) -> Unit,
) {
    private val keysByContentKey = mutableMapOf<Any, T>()

    fun register(contentKey: Any, key: T) {
        val existingKey = keysByContentKey[contentKey]
        check(existingKey == null || existingKey == key) {
            "Navigation content key $contentKey is already registered to a different route"
        }
        keysByContentKey[contentKey] = key
    }

    fun dispose(contentKey: Any) {
        keysByContentKey.remove(contentKey)?.let(onDispose)
    }
}
