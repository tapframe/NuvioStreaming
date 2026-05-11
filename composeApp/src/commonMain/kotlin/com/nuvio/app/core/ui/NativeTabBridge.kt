package com.nuvio.app.core.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

internal enum class NativeNavigationTab {
    Home,
    Search,
    Library,
    Settings,
    ;

    companion object {
        fun fromName(name: String): NativeNavigationTab =
            entries.firstOrNull { it.name.equals(name, ignoreCase = true) } ?: Home
    }
}

internal object NativeTabBridge {
    private val _requestedTab = MutableStateFlow(NativeNavigationTab.Home)
    val requestedTab: StateFlow<NativeNavigationTab> = _requestedTab.asStateFlow()

    fun requestTab(tabName: String) {
        _requestedTab.value = NativeNavigationTab.fromName(tabName)
    }

    fun publishSelectedTab(tab: NativeNavigationTab) {
        publishNativeSelectedTab(tab.name)
    }

    fun publishTabBarVisible(visible: Boolean) {
        publishNativeTabBarVisible(visible && isLiquidGlassNativeTabBarSupported())
    }

    fun publishLiquidGlassEnabled(enabled: Boolean) {
        publishLiquidGlassNativeTabBarEnabled(enabled && isLiquidGlassNativeTabBarSupported())
    }

    fun publishAccentColor(hexColor: String) {
        publishNativeTabAccentColor(hexColor)
    }

    fun publishProfileTabIcon(
        name: String?,
        avatarColorHex: String?,
        avatarImageUrl: String?,
        avatarBackgroundColorHex: String?,
    ) {
        publishNativeProfileTabIcon(
            name = name,
            avatarColorHex = avatarColorHex,
            avatarImageUrl = avatarImageUrl,
            avatarBackgroundColorHex = avatarBackgroundColorHex,
        )
    }
}

fun nativeTabSelect(tabName: String) {
    NativeTabBridge.requestTab(tabName)
}

internal expect fun isLiquidGlassNativeTabBarSupported(): Boolean

internal expect fun publishLiquidGlassNativeTabBarEnabled(enabled: Boolean)

internal expect fun publishNativeTabBarVisible(visible: Boolean)

internal expect fun publishNativeSelectedTab(tabName: String)

internal expect fun publishNativeTabAccentColor(hexColor: String)

internal expect fun publishNativeProfileTabIcon(
    name: String?,
    avatarColorHex: String?,
    avatarImageUrl: String?,
    avatarBackgroundColorHex: String?,
)
