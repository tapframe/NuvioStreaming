package com.nuvio.app.features.streams

object StreamBadgePresentation {
    fun apply(groups: List<AddonStreamGroup>, rules: StreamBadgeRules): List<AddonStreamGroup> {
        val filters = StreamBadgeMatcher.compile(rules)
        if (filters.isEmpty()) return groups
        return groups.map { group ->
            group.copy(
                streams = group.streams.map { stream ->
                    val matchedBadges = StreamBadgeMatcher.matchedBadges(stream, filters)
                    if (matchedBadges.isEmpty()) {
                        stream
                    } else {
                        stream.copy(badges = mergeBadges(stream.badges, matchedBadges))
                    }
                },
            )
        }
    }

    private fun mergeBadges(existing: List<StreamBadge>, matched: List<StreamBadge>): List<StreamBadge> {
        if (existing.isEmpty()) return matched
        val seenKeys = existing.mapTo(mutableSetOf()) { it.dedupeKey() }
        return existing + matched.filter { badge -> seenKeys.add(badge.dedupeKey()) }
    }

    private fun StreamBadge.dedupeKey(): String =
        (imageURL.takeIf { it.isNotBlank() } ?: name).lowercase()
}
