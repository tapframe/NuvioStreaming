package com.nuvio.app.features.settings

import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_auto_hide
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_auto_hide_description
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_morphed
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_morphed_description
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_off
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_off_description
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_static
import nuvio.composeapp.generated.resources.settings_tab_bar_behavior_static_description
import org.jetbrains.compose.resources.StringResource

/**
 * How the iOS 26 Liquid Glass tab bar behaves. Replaces the old on/off toggle so there is a single
 * source of truth — [OFF] is what used to be "Liquid Glass disabled".
 *
 * The [key] is what gets published to Swift through NativeTabBridge, so these strings must stay in
 * sync with `NuvioTabBarBehavior` in the iOS app.
 */
enum class NuvioTabBarBehavior(
    val key: String,
    val labelRes: StringResource,
    val descriptionRes: StringResource,
) {
    OFF(
        key = "off",
        labelRes = Res.string.settings_tab_bar_behavior_off,
        descriptionRes = Res.string.settings_tab_bar_behavior_off_description,
    ),
    STATIC(
        key = "static",
        labelRes = Res.string.settings_tab_bar_behavior_static,
        descriptionRes = Res.string.settings_tab_bar_behavior_static_description,
    ),
    AUTO_HIDE(
        key = "auto_hide",
        labelRes = Res.string.settings_tab_bar_behavior_auto_hide,
        descriptionRes = Res.string.settings_tab_bar_behavior_auto_hide_description,
    ),
    MORPHED(
        key = "morphed",
        labelRes = Res.string.settings_tab_bar_behavior_morphed,
        descriptionRes = Res.string.settings_tab_bar_behavior_morphed_description,
    ),
    ;

    val isEnabled: Boolean
        get() = this != OFF

    /** Only AUTO_HIDE and MORPHED react to scrolling; STATIC keeps the bar pinned. */
    val respondsToScroll: Boolean
        get() = this == AUTO_HIDE || this == MORPHED

    companion object {
        val Default: NuvioTabBarBehavior = MORPHED

        fun fromKey(key: String?): NuvioTabBarBehavior? =
            entries.firstOrNull { it.key.equals(key, ignoreCase = true) }

        /**
         * Migration path for profiles saved before this became a four-way choice: the old boolean
         * only told us whether Liquid Glass was on, so an enabled bar adopts the new default.
         */
        fun fromLegacyEnabled(enabled: Boolean?): NuvioTabBarBehavior = when (enabled) {
            null -> Default
            true -> Default
            false -> OFF
        }
    }
}
