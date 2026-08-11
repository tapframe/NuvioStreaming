package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.watchedItemKey

internal data class TraktWatchedProjectionCandidate(
    val item: WatchedItem,
    val contentIds: List<String>,
)

internal data class TraktWatchedProjection(
    val items: List<WatchedItem>,
    val extraWatchedKeys: Set<String>,
)

internal fun traktWatchedContentIds(
    imdb: String?,
    tmdb: Int?,
    tvdb: Int?,
    trakt: Int?,
    slug: String?,
): List<String> = buildList {
    imdb?.trim()?.takeIf(String::isNotBlank)?.let(::add)
    tmdb?.let { add("tmdb:$it") }
    trakt?.let { add("trakt:$it") }
    slug?.trim()?.takeIf(String::isNotBlank)?.let(::add)
    tvdb?.let { add("tvdb:$it") }
}.distinct()

internal fun ambiguousTraktWatchedShowIds(
    contentIdsByShow: Collection<Collection<String>>,
): Set<String> = contentIdsByShow
    .asSequence()
    .flatMap { ids -> ids.toSet().asSequence() }
    .groupingBy { it }
    .eachCount()
    .filterValues { count -> count > 1 }
    .keys

internal fun buildTraktWatchedProjection(
    candidates: Collection<TraktWatchedProjectionCandidate>,
): TraktWatchedProjection {
    val items = candidates
        .groupBy { candidate ->
            candidate.item.run { watchedItemKey(type, id, season, episode) }
        }
        .mapNotNull { (_, matches) -> matches.maxByOrNull { it.item.markedAtEpochMs }?.item }
        .sortedByDescending(WatchedItem::markedAtEpochMs)
    val extraWatchedKeys = buildSet {
        candidates.forEach { candidate ->
            val item = candidate.item
            val storedKey = watchedItemKey(item.type, item.id, item.season, item.episode)
            candidate.contentIds.forEach { contentId ->
                val key = watchedItemKey(item.type, contentId, item.season, item.episode)
                if (key != storedKey) add(key)
            }
        }
    }
    return TraktWatchedProjection(
        items = items,
        extraWatchedKeys = extraWatchedKeys,
    )
}
