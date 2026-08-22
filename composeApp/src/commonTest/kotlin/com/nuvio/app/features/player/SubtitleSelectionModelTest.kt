package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class SubtitleSelectionModelTest {

    @Test
    fun unhandledStationaryTapFallsBackToSelection() {
        assertTrue(
            isUnhandledTap(
                standardClickWasHandled = false,
                downX = 20f,
                downY = 40f,
                upX = 22f,
                upY = 43f,
                touchSlop = 8f,
            ),
        )
    }

    @Test
    fun handledTapAndRootSpaceDragDoNotUseFallbackSelection() {
        assertFalse(
            isUnhandledTap(
                standardClickWasHandled = true,
                downX = 20f,
                downY = 40f,
                upX = 20f,
                upY = 40f,
                touchSlop = 8f,
            ),
        )
        assertFalse(
            isUnhandledTap(
                standardClickWasHandled = false,
                downX = 20f,
                downY = 40f,
                upX = 20f,
                upY = 60f,
                touchSlop = 8f,
            ),
        )
    }

    @Test
    fun groupsTracksAndAddonsByLanguageWithPreferredLanguagesFirst() {
        val tracks = listOf(
            subtitleTrack(index = 0, language = "fr"),
            subtitleTrack(index = 1, language = "en"),
        )
        val addons = listOf(
            addonSubtitle(id = "es", language = "es"),
            addonSubtitle(id = "en", language = "en"),
        )

        val items = buildSubtitleLanguageItems(
            subtitleTracks = tracks,
            addonSubtitles = addons,
            preferredLanguage = "en",
            secondaryPreferredLanguage = "fr",
            showOnlyPreferredLanguages = false,
            selectedLanguageKey = "en",
        )

        assertEquals(
            listOf(SubtitleOffLanguageKey, "en", "fr", "es"),
            items.map { it.key },
        )
        assertEquals(2, items.first { it.key == "en" }.count)
    }

    @Test
    fun preferredOnlyModeKeepsTheCurrentlySelectedLanguage() {
        val items = buildSubtitleLanguageItems(
            subtitleTracks = listOf(
                subtitleTrack(index = 0, language = "en"),
                subtitleTrack(index = 1, language = "ja"),
            ),
            addonSubtitles = emptyList(),
            preferredLanguage = "en",
            secondaryPreferredLanguage = null,
            showOnlyPreferredLanguages = true,
            selectedLanguageKey = "ja",
        )

        assertEquals(listOf(SubtitleOffLanguageKey, "en", "ja"), items.map { it.key })
    }

    @Test
    fun detectsRegionalVariantsFromEmbeddedTrackLabels() {
        val items = buildSubtitleLanguageItems(
            subtitleTracks = listOf(
                subtitleTrack(index = 0, language = "por", label = "Portuguese (Brazilian)"),
                subtitleTrack(index = 1, language = "spa", label = "Español Latino"),
            ),
            addonSubtitles = emptyList(),
            preferredLanguage = SubtitleLanguageOption.NONE,
            secondaryPreferredLanguage = null,
            showOnlyPreferredLanguages = false,
            selectedLanguageKey = SubtitleOffLanguageKey,
        )

        assertEquals(
            setOf(SubtitleOffLanguageKey, "pt-br", "es-419"),
            items.map { it.key }.toSet(),
        )
    }

    @Test
    fun combinesBuiltInAndAddonOptionsWithoutDuplicateAddons() {
        val track = subtitleTrack(index = 2, language = "en")
        val addon = addonSubtitle(id = "main", language = "en")

        val options = buildSubtitleSelectionOptions(
            languageKey = "en",
            subtitleTracks = listOf(track),
            addonSubtitles = listOf(addon, addon),
        )

        assertEquals(2, options.size)
        assertIs<SubtitleSelectionOption.BuiltIn>(options[0])
        assertIs<SubtitleSelectionOption.Addon>(options[1])
    }

    @Test
    fun emptySubtitleRailShowsFetchActionWhenNoLanguagesAreAvailable() {
        assertEquals(
            SubtitleOptionsRailEmptyContent.FETCH,
            subtitleOptionsRailEmptyContent(
                selectedLanguageKey = SubtitleOffLanguageKey,
                hasAvailableLanguages = false,
                isLoadingAddonSubtitles = false,
            ),
        )
    }

    @Test
    fun emptySubtitleRailShowsLoadingWhileBackgroundFetchRuns() {
        assertEquals(
            SubtitleOptionsRailEmptyContent.LOADING,
            subtitleOptionsRailEmptyContent(
                selectedLanguageKey = SubtitleOffLanguageKey,
                hasAvailableLanguages = false,
                isLoadingAddonSubtitles = true,
            ),
        )
    }

    @Test
    fun subtitleRailShowsNoneWhenOffIsSelectedAndLanguagesExist() {
        assertEquals(
            SubtitleOptionsRailEmptyContent.NONE,
            subtitleOptionsRailEmptyContent(
                selectedLanguageKey = SubtitleOffLanguageKey,
                hasAvailableLanguages = true,
                isLoadingAddonSubtitles = false,
            ),
        )
    }

    private fun subtitleTrack(
        index: Int,
        language: String,
        label: String = "Track $index",
    ) = SubtitleTrack(
        index = index,
        id = "track-$index",
        label = label,
        language = language,
    )

    private fun addonSubtitle(
        id: String,
        language: String,
    ) = AddonSubtitle(
        id = id,
        url = "https://example.com/$id.srt",
        language = language,
        display = id,
        addonName = "Addon",
    )
}
