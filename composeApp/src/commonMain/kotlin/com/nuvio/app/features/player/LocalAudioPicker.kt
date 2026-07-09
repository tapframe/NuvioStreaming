package com.nuvio.app.features.player

import androidx.compose.runtime.Composable

@Composable
internal expect fun rememberLocalAudioPicker(onPicked: (String) -> Unit): () -> Unit
