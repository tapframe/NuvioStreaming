package com.nuvio.app.features.livetv

import androidx.compose.runtime.Composable

internal class LiveTvPlaylistFilePicker internal constructor(
    val canPickFiles: Boolean,
    private val launchPicker: () -> Unit,
) {
    fun launch() = launchPicker()
}

@Composable
internal expect fun rememberLiveTvPlaylistFilePicker(
    onPlaylistLoaded: (fileName: String?, content: String) -> Unit,
    onError: (String) -> Unit,
): LiveTvPlaylistFilePicker
