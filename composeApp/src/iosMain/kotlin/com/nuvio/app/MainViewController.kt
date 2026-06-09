package com.nuvio.app

import androidx.compose.ui.window.ComposeUIViewController
import platform.UIKit.UIColor

private val nuvioBackgroundColor = UIColor(red = 0.051, green = 0.051, blue = 0.051, alpha = 1.0)

fun MainViewController() = ComposeUIViewController {
    App()
}.apply {
    view.backgroundColor = nuvioBackgroundColor
}
