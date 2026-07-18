package com.nuvio.app.features.player

import androidx.compose.runtime.Composable

@Composable
internal actual fun rememberLocalAudioPicker(onPicked: (String) -> Unit): () -> Unit = {}
