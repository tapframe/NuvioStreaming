package com.nuvio.app.features.boomio

/**
 * Maps content-rating strings to a single ordinal scale (higher = more restrictive)
 * so an item's TMDB rating (US MPAA for movies, US TV rating for shows, GB fallback)
 * can be compared against a BSM MPAA ceiling (G / PG / PG-13 / R / NC-17).
 *
 * Unknown or missing ratings are treated as "unknown" and the caller fails open,
 * per the agreed "cheap and soft" tradeoff: this is a client-side soft gate, not a
 * security boundary.
 *
 * NOTE: static, uncompiled port of the legacy `RatingOrdinal`.
 */
object RatingOrdinal {

    fun ordinal(rating: String?): Int? {
        val normalized = rating?.trim()?.uppercase() ?: return null
        return when (normalized) {
            "G", "TV-Y", "TV-G", "E", "EC", "U" -> 0
            "PG", "TV-Y7", "TV-Y7-FV", "TV-PG" -> 1
            "PG-13", "TV-14", "12A", "12" -> 2
            "R", "TV-MA", "15" -> 3
            "NC-17", "X", "18" -> 4
            else -> null
        }
    }

    /**
     * Returns true when an item with [itemRating] may be shown under a profile whose
     * ceiling is [ceiling]. Fails open: a missing/unknown ceiling or item rating is
     * allowed rather than hiding content we cannot classify.
     */
    fun isAllowed(itemRating: String?, ceiling: String?): Boolean {
        val ceilingOrdinal = ordinal(ceiling) ?: return true
        val itemOrdinal = ordinal(itemRating) ?: return true
        return itemOrdinal <= ceilingOrdinal
    }
}
