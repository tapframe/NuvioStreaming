package com.nuvio.app.features.settings

import com.nuvio.app.core.ui.AppTheme
import com.nuvio.app.core.ui.NativeTabBridge
import com.nuvio.app.core.ui.ThemeColors
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object ThemeSettingsRepository {
    private val _selectedTheme = MutableStateFlow(AppTheme.WHITE)
    val selectedTheme: StateFlow<AppTheme> = _selectedTheme.asStateFlow()

    private val _amoledEnabled = MutableStateFlow(false)
    val amoledEnabled: StateFlow<Boolean> = _amoledEnabled.asStateFlow()

    private val _tabBarBehavior = MutableStateFlow(NuvioTabBarBehavior.Default)
    val tabBarBehavior: StateFlow<NuvioTabBarBehavior> = _tabBarBehavior.asStateFlow()

    /** Derived from [tabBarBehavior]; kept so existing call sites keep reading a single boolean. */
    private val _liquidGlassNativeTabBarEnabled = MutableStateFlow(NuvioTabBarBehavior.Default.isEnabled)
    val liquidGlassNativeTabBarEnabled: StateFlow<Boolean> = _liquidGlassNativeTabBarEnabled.asStateFlow()

    private val _dynamicArtworkBackgroundEnabled = MutableStateFlow(false)
    val dynamicArtworkBackgroundEnabled: StateFlow<Boolean> = _dynamicArtworkBackgroundEnabled.asStateFlow()

    private val _selectedAppLanguage = MutableStateFlow(AppLanguage.DEVICE)
    val selectedAppLanguage: StateFlow<AppLanguage> = _selectedAppLanguage.asStateFlow()

    private val _navBarStyle = MutableStateFlow(NavBarStyle.ADAPTIVE)
    val navBarStyle: StateFlow<NavBarStyle> = _navBarStyle.asStateFlow()

    private var hasLoaded = false

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        _selectedTheme.value = AppTheme.WHITE
        _amoledEnabled.value = false
        _tabBarBehavior.value = NuvioTabBarBehavior.Default
        _liquidGlassNativeTabBarEnabled.value = NuvioTabBarBehavior.Default.isEnabled
        _dynamicArtworkBackgroundEnabled.value = false
        NativeTabBridge.publishAccentColor(AppTheme.WHITE.nativeTabAccentHex())
        NativeTabBridge.publishTabBarBehavior(NuvioTabBarBehavior.Default)
        _selectedAppLanguage.value = AppLanguage.DEVICE
        _navBarStyle.value = NavBarStyle.ADAPTIVE
    }

    private fun loadFromDisk() {
        hasLoaded = true
        val stored = ThemeSettingsStorage.loadSelectedTheme()
        val theme = if (stored != null) {
            try {
                AppTheme.valueOf(stored)
            } catch (_: IllegalArgumentException) {
                AppTheme.WHITE
            }
        } else {
            AppTheme.WHITE
        }
        _selectedTheme.value = theme
        NativeTabBridge.publishAccentColor(theme.nativeTabAccentHex())
        _amoledEnabled.value = ThemeSettingsStorage.loadAmoledEnabled() ?: false
        // The four-way behavior replaced the old on/off toggle; fall back to it for existing profiles.
        val behavior = NuvioTabBarBehavior.fromKey(ThemeSettingsStorage.loadTabBarBehavior())
            ?: NuvioTabBarBehavior.fromLegacyEnabled(
                ThemeSettingsStorage.loadLiquidGlassNativeTabBarEnabled(),
            )
        applyTabBarBehavior(behavior)
        _dynamicArtworkBackgroundEnabled.value =
            ThemeSettingsStorage.loadDynamicArtworkBackgroundEnabled() ?: false
        val appLanguage = AppLanguage.fromCode(ThemeSettingsStorage.loadSelectedAppLanguage())
        ThemeSettingsStorage.applySelectedAppLanguage(appLanguage.code)
        _selectedAppLanguage.value = appLanguage
        _navBarStyle.value = NavBarStyle.fromKey(ThemeSettingsStorage.loadNavBarStyle())
    }

    fun setTheme(theme: AppTheme) {
        ensureLoaded()
        if (_selectedTheme.value == theme) return
        _selectedTheme.value = theme
        ThemeSettingsStorage.saveSelectedTheme(theme.name)
        NativeTabBridge.publishAccentColor(theme.nativeTabAccentHex())
    }

    fun setAmoled(enabled: Boolean) {
        ensureLoaded()
        if (_amoledEnabled.value == enabled) return
        _amoledEnabled.value = enabled
        ThemeSettingsStorage.saveAmoledEnabled(enabled)
    }

    fun setTabBarBehavior(behavior: NuvioTabBarBehavior) {
        ensureLoaded()
        if (_tabBarBehavior.value == behavior) return
        applyTabBarBehavior(behavior)
        ThemeSettingsStorage.saveTabBarBehavior(behavior.key)
        // Keep the legacy key in step so a downgrade, or an older device syncing this profile,
        // still sees the right on/off state.
        ThemeSettingsStorage.saveLiquidGlassNativeTabBarEnabled(behavior.isEnabled)
    }

    private fun applyTabBarBehavior(behavior: NuvioTabBarBehavior) {
        _tabBarBehavior.value = behavior
        _liquidGlassNativeTabBarEnabled.value = behavior.isEnabled
        NativeTabBridge.publishTabBarBehavior(behavior)
    }

    fun setDynamicArtworkBackground(enabled: Boolean) {
        ensureLoaded()
        if (_dynamicArtworkBackgroundEnabled.value == enabled) return
        _dynamicArtworkBackgroundEnabled.value = enabled
        ThemeSettingsStorage.saveDynamicArtworkBackgroundEnabled(enabled)
    }

    fun setAppLanguage(language: AppLanguage) {
        ensureLoaded()
        if (_selectedAppLanguage.value == language) return
        ThemeSettingsStorage.saveSelectedAppLanguage(language.code)
        ThemeSettingsStorage.applySelectedAppLanguage(language.code)
        _selectedAppLanguage.value = language
    }

    fun setNavBarStyle(style: NavBarStyle) {
        ensureLoaded()
        if (_navBarStyle.value == style) return
        _navBarStyle.value = style
        ThemeSettingsStorage.saveNavBarStyle(style.key)
    }
}

private fun AppTheme.nativeTabAccentHex(): String =
    ThemeColors.getColorPalette(this).nativeAccentHex
