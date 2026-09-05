package com.nuvio.app.core.ui

import io.github.alexzhirkevich.compottie.LottieComposition
import io.github.alexzhirkevich.compottie.LottieCompositionSpec
import nuvio.composeapp.generated.resources.Res

internal class ResourceLottieCompositionSpec(
    private val path: String,
    private val readBytes: suspend (String) -> ByteArray = Res::readBytes,
) : LottieCompositionSpec {
    override val key: String = "resource:$path"

    override suspend fun load(): LottieComposition =
        LottieComposition.parse(readBytes(path).decodeToString())
}
