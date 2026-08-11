package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PlayerTrackSelectionTest {

    @Test
    fun addonTrackIdentityIsStableWithoutChangingTheSignedUrl() {
        val subtitle = addonSubtitle(
            id = "opensubs-42",
            language = "en",
        ).copy(url = "https://example.com/sub.srt?token=signed&expires=4102444800")

        val trackId = buildAddonSubtitleTrackId(subtitle)

        assertEquals(trackId, buildAddonSubtitleTrackId(subtitle))
        assertTrue(trackId.startsWith(ADDON_SUBTITLE_TRACK_ID_PREFIX))
        assertTrue(trackId.contains("opensubs-42"))
        assertEquals("https://example.com/sub.srt?token=signed&expires=4102444800", subtitle.url)
    }

    @Test
    fun addonTrackIdentityDistinguishesDuplicateAddonIdsWithDifferentUrls() {
        val first = addonSubtitle(id = "duplicate", language = "en")
        val second = first.copy(url = "https://example.com/other.srt")

        assertFalse(buildAddonSubtitleTrackId(first) == buildAddonSubtitleTrackId(second))
    }

    @Test
    fun media3MergedTrackPrefixesAreNormalizedNarrowly() {
        val trackId = buildAddonSubtitleTrackId(addonSubtitle(id = "addon", language = "en"))

        assertEquals("audio-track", normalizeMedia3MergedTrackId("0:audio-track"))
        assertEquals("audio-track", normalizeMedia3MergedTrackId("12:3:audio-track"))
        assertTrue(isAddonSubtitleTrackId(trackId))
        assertTrue(isAddonSubtitleTrackId("0:$trackId"))
        assertTrue(isAddonSubtitleTrackId("12:3:$trackId"))
        assertTrue(matchesAddonSubtitleTrackId("1:$trackId", trackId))
        assertFalse(isAddonSubtitleTrackId("embedded:$trackId"))
        assertFalse(isAddonSubtitleTrackId("x1:$trackId"))
        assertFalse(matchesAddonSubtitleTrackId("embedded:$trackId", trackId))
    }

    @Test
    fun onlyNuvioOwnedExternalTracksAreClassifiedAsAddonSubtitles() {
        val trackId = buildAddonSubtitleTrackId(addonSubtitle(id = "addon", language = "en"))

        assertTrue(isLibmpvAddonSubtitleTrack(title = trackId, isExternal = true))
        assertFalse(isLibmpvAddonSubtitleTrack(title = trackId, isExternal = false))
        assertFalse(isLibmpvAddonSubtitleTrack(title = "English", isExternal = true))
        assertFalse(isLibmpvAddonSubtitleTrack(title = null, isExternal = true))
    }

    @Test
    fun forcedSelectionUsesPrimaryPreferredLanguageInsteadOfTrackOrder() {
        val tracks = listOf(
            subtitleTrack(index = 0, language = "ja", isForced = true),
            subtitleTrack(index = 1, language = "en", isForced = false),
            subtitleTrack(index = 2, language = "en", isForced = true),
        )

        val selectedIndex = findPreferredSubtitleTrackIndex(
            tracks = tracks,
            targets = listOf("en"),
            mode = SubtitleAutoSelectionMode.FORCED_ONLY,
        )

        assertEquals(2, selectedIndex)
    }

    @Test
    fun matchingAudioUsesForcedOnlyPrimarySubtitleTarget() {
        val plan = assertNotNull(
            resolveSubtitleAutoSelectionPlan(
                selectedAudioLanguage = "en",
                preferredAudioTargets = listOf("en"),
                preferredSubtitleTargets = listOf("en", "fr"),
                useForcedSubtitles = true,
            ),
        )

        assertEquals(listOf("en"), plan.targets)
        assertEquals(SubtitleAutoSelectionMode.FORCED_ONLY, plan.mode)
    }

    @Test
    fun forcedSelectionRejectsTracksOutsidePreferredLanguages() {
        val tracks = listOf(
            subtitleTrack(index = 0, language = "ja", isForced = true),
            subtitleTrack(index = 1, language = "en", isForced = false),
        )

        val selectedIndex = findPreferredSubtitleTrackIndex(
            tracks = tracks,
            targets = listOf("en"),
            mode = SubtitleAutoSelectionMode.FORCED_ONLY,
        )

        assertEquals(-1, selectedIndex)
    }

    @Test
    fun differentAudioUsesNormalPreferredSubtitles() {
        val tracks = listOf(
            subtitleTrack(index = 0, language = "en", isForced = true),
            subtitleTrack(index = 1, language = "en", isForced = false),
        )
        val plan = assertNotNull(
            resolveSubtitleAutoSelectionPlan(
                selectedAudioLanguage = "ja",
                preferredAudioTargets = listOf("ja"),
                preferredSubtitleTargets = listOf("en", "fr"),
                useForcedSubtitles = true,
            ),
        )

        val selectedIndex = findPreferredSubtitleTrackIndex(
            tracks = tracks,
            targets = plan.targets,
            mode = plan.mode,
        )

        assertEquals(SubtitleAutoSelectionMode.NORMAL_ONLY, plan.mode)
        assertEquals(1, selectedIndex)
    }

    @Test
    fun audioMatchingOnlySecondarySubtitleTargetUsesNormalSubtitles() {
        val plan = assertNotNull(
            resolveSubtitleAutoSelectionPlan(
                selectedAudioLanguage = "fr",
                preferredAudioTargets = listOf("fr"),
                preferredSubtitleTargets = listOf("en", "fr"),
                useForcedSubtitles = true,
            ),
        )

        assertEquals(listOf("en", "fr"), plan.targets)
        assertEquals(SubtitleAutoSelectionMode.NORMAL_ONLY, plan.mode)
    }

    @Test
    fun forcedToggleOffExcludesForcedTracks() {
        val tracks = listOf(
            subtitleTrack(index = 0, language = "en", isForced = true),
            subtitleTrack(index = 1, language = "en", isForced = false),
        )
        val plan = assertNotNull(
            resolveSubtitleAutoSelectionPlan(
                selectedAudioLanguage = "en",
                preferredAudioTargets = listOf("en"),
                preferredSubtitleTargets = listOf("en"),
                useForcedSubtitles = false,
            ),
        )

        val selectedIndex = findPreferredSubtitleTrackIndex(
            tracks = tracks,
            targets = plan.targets,
            mode = plan.mode,
        )

        assertEquals(SubtitleAutoSelectionMode.NORMAL_ONLY, plan.mode)
        assertEquals(1, selectedIndex)
    }

    @Test
    fun forcedToggleOffRejectsForcedOnlyTrackList() {
        val selectedIndex = findPreferredSubtitleTrackIndex(
            tracks = listOf(subtitleTrack(index = 0, language = "en", isForced = true)),
            targets = listOf("en"),
            mode = SubtitleAutoSelectionMode.NORMAL_ONLY,
        )

        assertEquals(-1, selectedIndex)
    }

    @Test
    fun forcedModeWithoutSubtitleTargetUsesMatchingSelectedAudioLanguage() {
        val plan = assertNotNull(
            resolveSubtitleAutoSelectionPlan(
                selectedAudioLanguage = "ja",
                preferredAudioTargets = listOf("ja"),
                preferredSubtitleTargets = emptyList(),
                useForcedSubtitles = true,
            ),
        )

        assertEquals(listOf("ja"), plan.targets)
        assertEquals(SubtitleAutoSelectionMode.FORCED_ONLY, plan.mode)
    }

    @Test
    fun forcedModeWaitsUntilSelectedAudioIsKnown() {
        val plan = resolveSubtitleAutoSelectionPlan(
            selectedAudioLanguage = null,
            preferredAudioTargets = listOf("en"),
            preferredSubtitleTargets = listOf("en"),
            useForcedSubtitles = true,
        )

        assertNull(plan)
    }

    @Test
    fun resolvesSelectedAudioLanguageFromTrackLabel() {
        val target = resolveAudioTrackLanguageTarget(
            AudioTrack(
                index = 0,
                id = "audio-0",
                label = "English Original",
                language = null,
                isSelected = true,
            ),
        )

        assertEquals("en", target)
    }

    @Test
    fun forcedSelectionMatchesSubtitleLanguageFromTrackLabel() {
        val selectedIndex = findPreferredSubtitleTrackIndex(
            tracks = listOf(
                subtitleTrack(
                    index = 0,
                    language = null,
                    label = "English Forced",
                    isForced = true,
                ),
            ),
            targets = listOf("en"),
            mode = SubtitleAutoSelectionMode.FORCED_ONLY,
        )

        assertEquals(0, selectedIndex)
    }

    @Test
    fun preferredOnlyFilteringRemovesNonPreferredAddons() {
        val subtitles = listOf(
            addonSubtitle(id = "english", language = "en"),
            addonSubtitle(id = "japanese", language = "ja"),
        )
        val settings = PlayerSettingsUiState(
            preferredSubtitleLanguage = "en",
            subtitleStyle = SubtitleStyleState.DEFAULT.copy(showOnlyPreferredLanguages = true),
        )

        val visibleSubtitles = filterAddonSubtitlesForSettings(
            subtitles = subtitles,
            settings = settings,
        )

        assertEquals(listOf("english"), visibleSubtitles.map { it.id })
    }

    @Test
    fun forcedToggleKeepsPreferredLanguagesForAddonFiltering() {
        val subtitles = listOf(
            addonSubtitle(id = "japanese", language = "ja"),
            addonSubtitle(id = "french", language = "fr"),
            addonSubtitle(id = "english", language = "en"),
        )
        val settings = PlayerSettingsUiState(
            preferredSubtitleLanguage = "en",
            secondaryPreferredSubtitleLanguage = "fr",
            subtitleStyle = SubtitleStyleState.DEFAULT.copy(
                useForcedSubtitles = true,
                showOnlyPreferredLanguages = true,
            ),
        )

        val visibleSubtitles = filterAddonSubtitlesForSettings(
            subtitles = subtitles,
            settings = settings,
        )

        assertEquals(listOf("french", "english"), visibleSubtitles.map { it.id })
    }

    private fun subtitleTrack(
        index: Int,
        language: String?,
        label: String = "Track $index",
        isForced: Boolean,
    ) = SubtitleTrack(
        index = index,
        id = "track-$index",
        label = label,
        language = language,
        isForced = isForced,
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
