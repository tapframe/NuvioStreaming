package com.nuvio.app.features.profiles

import platform.UIKit.UISelectionFeedbackGenerator

internal actual object ProfileHoverHapticFeedback {
    private var generator: UISelectionFeedbackGenerator? = null

    actual fun prepare() {
        generator = UISelectionFeedbackGenerator().also { it.prepare() }
    }

    actual fun perform() {
        val activeGenerator = generator ?: UISelectionFeedbackGenerator().also {
            generator = it
        }
        activeGenerator.selectionChanged()
        activeGenerator.prepare()
    }

    actual fun release() {
        generator = null
    }
}
