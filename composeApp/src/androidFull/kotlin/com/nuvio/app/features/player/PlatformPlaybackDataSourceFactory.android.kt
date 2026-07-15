package com.nuvio.app.features.player

import android.content.Context
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
import com.nuvio.app.core.logging.InAppLogger
import com.nuvio.app.features.trailer.YoutubeChunkedDataSourceFactory

internal object PlatformPlaybackDataSourceFactory {
    fun create(
        context: Context,
        defaultRequestHeaders: Map<String, String>,
        defaultResponseHeaders: Map<String, String>,
        useYoutubeChunkedPlayback: Boolean,
        externalSubtitles: List<com.nuvio.app.features.streams.StreamSubtitle> = emptyList(),
    ): DataSource.Factory {
        InAppLogger.info(
            "Player/Network",
            "create dataSource httpFactory=${if (useYoutubeChunkedPlayback) "youtube-chunked" else "default-http"} " +
                "requestHeaders=${InAppLogger.headerKeys(defaultRequestHeaders)} " +
                "responseOverrides=${InAppLogger.headerKeys(defaultResponseHeaders)} " +
                "externalSubtitles=${externalSubtitles.size}",
        )

        val networkFactory: DataSource.Factory = if (useYoutubeChunkedPlayback) {
            YoutubeChunkedDataSourceFactory(defaultRequestHeaders = defaultRequestHeaders)
        } else {
            PlayerPlaybackNetworking.createHttpDataSourceFactory(defaultRequestHeaders)
        }
        val subtitleHeaderFactory = SubtitleRequestHeaderDataSourceFactory(
            upstreamFactory = networkFactory,
            externalSubtitles = externalSubtitles,
        )
        val baseFactory: DataSource.Factory = DefaultDataSource.Factory(context, subtitleHeaderFactory)
        val finalFactory = if (defaultResponseHeaders.isEmpty()) {
            baseFactory
        } else {
            ResponseHeaderOverridingDataSourceFactory(
                upstreamFactory = baseFactory,
                defaultResponseHeaders = defaultResponseHeaders,
            )
        }
        return PlaybackLoggingDataSourceFactory(
            upstreamFactory = finalFactory,
            sourceLabel = if (useYoutubeChunkedPlayback) "youtube-chunked" else "default-http",
        )
    }
}
