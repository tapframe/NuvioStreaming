package com.nuvio.tv.domain.model

enum class ContentType {
    MOVIE,
    SERIES,
    CHANNEL,
    TV,
    UNKNOWN;

    companion object {
        fun fromString(value: String): ContentType = when (value.lowercase()) {
            "movie" -> MOVIE
            "series" -> SERIES
            "channel" -> CHANNEL
            "tv" -> TV
            else -> UNKNOWN
        }
    }

    fun toApiString(): String = when (this) {
        MOVIE -> "movie"
        SERIES -> "series"
        CHANNEL -> "channel"
        TV -> "tv"
        UNKNOWN -> "movie"
    }
}
