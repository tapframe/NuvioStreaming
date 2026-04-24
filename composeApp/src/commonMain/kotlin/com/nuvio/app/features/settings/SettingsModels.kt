package com.nuvio.app.features.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.ui.graphics.vector.ImageVector

internal enum class SettingsCategory(
    val label: String,
    val icon: ImageVector,
) {
    Account("Account", Icons.Rounded.AccountCircle),
    General("General", Icons.Rounded.Settings),
    About("About", Icons.Rounded.Info),
}

internal enum class SettingsPage(
    val title: String,
    val category: SettingsCategory,
    val parentPage: SettingsPage?,
) {
    Root(
        title = "Settings",
        category = SettingsCategory.General,
        parentPage = null,
    ),
    Account(
        title = "Account",
        category = SettingsCategory.Account,
        parentPage = Root,
    ),
    Network(
        title = "Network",
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    SupportersContributors(
        title = "Supporters & Contributors",
        category = SettingsCategory.About,
        parentPage = Root,
    ),
    Playback(
        title = "Playback",
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    Appearance(
        title = "Appearance",
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    Notifications(
        title = "Notifications",
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    ContinueWatching(
        title = "Continue Watching",
        category = SettingsCategory.General,
        parentPage = Appearance,
    ),
    PosterCustomization(
        title = "Poster Customization",
        category = SettingsCategory.General,
        parentPage = Appearance,
    ),
    ContentDiscovery(
        title = "Content & Discovery",
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    Addons(
        title = "Addons",
        category = SettingsCategory.General,
        parentPage = ContentDiscovery,
    ),
    Plugins(
        title = "Plugins",
        category = SettingsCategory.General,
        parentPage = ContentDiscovery,
    ),
    Homescreen(
        title = "Homescreen",
        category = SettingsCategory.General,
        parentPage = ContentDiscovery,
    ),
    MetaScreen(
        title = "Meta Screen",
        category = SettingsCategory.General,
        parentPage = ContentDiscovery,
    ),
    Integrations(
        title = "Integrations",
        category = SettingsCategory.General,
        parentPage = Root,
    ),
    TmdbEnrichment(
        title = "TMDB Enrichment",
        category = SettingsCategory.General,
        parentPage = Integrations,
    ),
    MdbListRatings(
        title = "MDBList Ratings",
        category = SettingsCategory.General,
        parentPage = Integrations,
    ),
    TraktAuthentication(
        title = "Trakt",
        category = SettingsCategory.Account,
        parentPage = Root,
    ),
}

internal val SettingsPage.opensInlineOnTablet: Boolean
    get() = parentPage != null

internal fun SettingsPage.previousPage(): SettingsPage? = parentPage
