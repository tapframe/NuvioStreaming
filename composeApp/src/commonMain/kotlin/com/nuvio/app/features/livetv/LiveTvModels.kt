package com.nuvio.app.features.livetv

data class LiveTvChannel(
    val id: String,
    val name: String,
    val streamUrl: String,
    val logoUrl: String? = null,
    val group: String? = null,
)

data class LiveTvUiState(
    val playlistUrl: String = "",
    val channels: List<LiveTvChannel> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
) {
    val hasPlaylist: Boolean
        get() = playlistUrl.isNotBlank()
}
