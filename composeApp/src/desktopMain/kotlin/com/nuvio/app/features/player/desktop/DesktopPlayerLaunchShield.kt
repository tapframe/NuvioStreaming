package com.nuvio.app.features.player.desktop

import java.awt.Color
import java.awt.KeyboardFocusManager
import java.awt.Rectangle
import java.awt.Window
import javax.swing.JWindow
import javax.swing.RootPaneContainer
import javax.swing.SwingUtilities
import javax.swing.Timer

internal object DesktopPlayerLaunchShield {
    private var shieldWindow: JWindow? = null
    private var hideTimer: Timer? = null

    fun showForActiveWindow() {
        if (DesktopHostOs.current != DesktopHostOs.WINDOWS) return
        SwingUtilities.invokeLater {
            val owner = activeOwnerWindow() ?: return@invokeLater
            val bounds = ownerContentBounds(owner) ?: return@invokeLater
            hideTimer?.stop()
            hideTimer = null

            val shield = shieldWindow?.takeIf { it.owner === owner } ?: JWindow(owner).also { window ->
                window.background = Color.BLACK
                window.contentPane.background = Color.BLACK
                window.focusableWindowState = false
                window.setType(Window.Type.POPUP)
                shieldWindow = window
            }
            shield.bounds = bounds
            if (!shield.isVisible) {
                shield.isVisible = true
            }
            shield.toFront()
            hideAfter(3_000)
        }
    }

    fun hideAfter(delayMs: Int = 48) {
        SwingUtilities.invokeLater {
            hideTimer?.stop()
            hideTimer = Timer(delayMs) {
                hideNow()
            }.apply {
                isRepeats = false
                start()
            }
        }
    }

    fun hide() {
        SwingUtilities.invokeLater {
            hideTimer?.stop()
            hideTimer = null
            hideNow()
        }
    }

    private fun hideNow() {
        val shield = shieldWindow ?: return
        if (shield.isVisible) {
            shield.isVisible = false
        }
    }

    private fun activeOwnerWindow(): Window? {
        val active = KeyboardFocusManager.getCurrentKeyboardFocusManager().activeWindow
        if (active?.isShowing == true) return active
        return Window.getWindows()
            .filter { it.isShowing && it !is JWindow }
            .firstOrNull()
    }

    private fun ownerContentBounds(owner: Window): Rectangle? {
        val content = (owner as? RootPaneContainer)?.contentPane
        return runCatching {
            if (content != null && content.isShowing) {
                val location = content.locationOnScreen
                Rectangle(location.x, location.y, content.width, content.height)
            } else {
                val location = owner.locationOnScreen
                Rectangle(location.x, location.y, owner.width, owner.height)
            }
        }.getOrNull()
    }
}
