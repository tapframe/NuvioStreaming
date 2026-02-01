package com.nuvio.tv.domain.model

enum class PosterShape {
    POSTER,
    LANDSCAPE,
    SQUARE;

    companion object {
        fun fromString(value: String?): PosterShape = when (value?.lowercase()) {
            "landscape" -> LANDSCAPE
            "square" -> SQUARE
            else -> POSTER
        }
    }

    fun aspectRatio(): Float = when (this) {
        POSTER -> 0.675f
        LANDSCAPE -> 1.78f
        SQUARE -> 1f
    }
}
