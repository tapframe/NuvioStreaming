package com.nuvio.app.features.catalog

import com.nuvio.app.features.addons.AddonCatalog
import com.nuvio.app.features.addons.buildAddonResourceUrl
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.home.HomeCatalogParser
import com.nuvio.app.features.home.MetaPreview
import com.nuvio.app.features.home.stableKey
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

const val CATALOG_PAGE_SIZE = 100
private const val DUPLICATE_CATALOG_PAGE_ADVANCE_LIMIT = 3

data class CatalogPage(
    val items: List<MetaPreview>,
    val rawItemCount: Int,
    val nextSkip: Int?,
)

data class CatalogPaginationState(
    val nextSkip: Int?,
    val consecutiveDuplicatePages: Int = 0,
)

private val inflightMutex = Mutex()
private val inflightRequestScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
private val inflightRequests = mutableMapOf<String, CompletableDeferred<String>>()

private suspend fun deduplicatedHttpGetText(url: String): String {
    val deferred = inflightMutex.withLock {
        inflightRequests[url] ?: CompletableDeferred<String>().also { created ->
            inflightRequests[url] = created
            inflightRequestScope.launch {
                try {
                    created.complete(httpGetText(url))
                } catch (error: Throwable) {
                    created.completeExceptionally(error)
                } finally {
                    inflightMutex.withLock {
                        if (inflightRequests[url] === created) {
                            inflightRequests.remove(url)
                        }
                    }
                }
            }
        }
    }

    return deferred.await()
}

suspend fun fetchCatalogPage(
    manifestUrl: String,
    type: String,
    catalogId: String,
    genre: String? = null,
    search: String? = null,
    skip: Int? = null,
    maxItems: Int? = null,
): CatalogPage {
    val url = buildCatalogUrl(
        manifestUrl = manifestUrl,
        type = type,
        catalogId = catalogId,
        genre = genre,
        search = search,
        skip = skip,
    )
    val payload = deduplicatedHttpGetText(url)
    val parsed = HomeCatalogParser.parseCatalogResponse(
        payload = payload,
        maxItems = maxItems,
    )
    val nextSkip = if (parsed.rawItemCount > 0) {
        (skip ?: 0) + parsed.rawItemCount
    } else {
        null
    }
    return CatalogPage(
        items = parsed.items,
        rawItemCount = parsed.rawItemCount,
        nextSkip = nextSkip,
    )
}

fun AddonCatalog.supportsPagination(): Boolean =
    extra.any { property -> property.name.equals("skip", ignoreCase = true) }

fun nextCatalogPaginationState(
    supportsPagination: Boolean,
    requestedSkip: Int,
    page: CatalogPage,
    loadedNewItems: Boolean,
    consecutiveDuplicatePages: Int,
): CatalogPaginationState {
    if (!supportsPagination || page.rawItemCount <= 0 || page.nextSkip == null) {
        return CatalogPaginationState(nextSkip = null)
    }
    if (loadedNewItems) {
        return CatalogPaginationState(nextSkip = page.nextSkip)
    }

    val duplicatePages = consecutiveDuplicatePages + 1
    val advancedSkip = if (page.nextSkip > requestedSkip) {
        page.nextSkip
    } else {
        requestedSkip + page.rawItemCount.coerceAtLeast(1)
    }
    return if (duplicatePages < DUPLICATE_CATALOG_PAGE_ADVANCE_LIMIT && advancedSkip > requestedSkip) {
        CatalogPaginationState(
            nextSkip = advancedSkip,
            consecutiveDuplicatePages = duplicatePages,
        )
    } else {
        CatalogPaginationState(
            nextSkip = null,
            consecutiveDuplicatePages = duplicatePages,
        )
    }
}

fun mergeCatalogItems(
    existing: List<MetaPreview>,
    incoming: List<MetaPreview>,
): List<MetaPreview> {
    if (incoming.isEmpty()) return existing
    val seen = existing.mapTo(mutableSetOf()) { item -> item.stableKey() }
    return buildList(existing.size + incoming.size) {
        addAll(existing)
        incoming.forEach { item ->
            val key = item.stableKey()
            if (seen.add(key)) {
                add(item)
            }
        }
    }
}

fun dedupeCatalogItems(items: List<MetaPreview>): List<MetaPreview> {
    if (items.size < 2) return items
    val seen = mutableSetOf<String>()
    return buildList(items.size) {
        items.forEach { item ->
            if (seen.add(item.stableKey())) {
                add(item)
            }
        }
    }
}

internal fun buildCatalogUrl(
    manifestUrl: String,
    type: String,
    catalogId: String,
    genre: String?,
    search: String?,
    skip: Int?,
): String {
    val extraParts = buildList {
        if (!search.isNullOrBlank()) add("search=${search.encodeCatalogExtra()}")
        if (!genre.isNullOrBlank()) add("genre=${genre.encodeCatalogExtra()}")
        if (skip != null && skip > 0) add("skip=$skip")
    }

    return buildAddonResourceUrl(
        manifestUrl = manifestUrl,
        resource = "catalog",
        type = type,
        id = catalogId,
        extraPathSegment = extraParts.joinToString(separator = "&").ifBlank { null },
    )
}

private fun String.encodeCatalogExtra(): String =
    buildString {
        encodeToByteArray().forEach { byte ->
            val value = byte.toInt() and 0xFF
            val char = value.toChar()
            if (
                char in 'a'..'z' ||
                char in 'A'..'Z' ||
                char in '0'..'9' ||
                char == '-' ||
                char == '_' ||
                char == '.' ||
                char == '~'
            ) {
                append(char)
            } else {
                append('%')
                append(HEX[value shr 4])
                append(HEX[value and 0x0F])
            }
        }
    }

private val HEX = "0123456789ABCDEF"
