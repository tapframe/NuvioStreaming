package com.nuvio.app.features.telegram

import com.nuvio.app.features.streams.StreamItem

internal expect object TelegramSourceResolver {
    fun isEnabled(): Boolean
    suspend fun resolve(
        title: String,
        year: Int?,
        season: Int? = null,
        episode: Int? = null,
        imdbId: String = "",
        isMovie: Boolean = true
    ): List<StreamItem>
}
