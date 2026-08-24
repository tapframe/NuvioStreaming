package com.nuvio.app.features.player

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SubtitleSelectionModelTest {

    @Test
    fun sameRawIdFromDifferentProvidersGetsDistinctSessionIdentity() {
        val registry = AddonSubtitleSessionRegistry()
        val providerA = addonSubtitle(id = "shared", providerOrigin = "https://a.example/manifest.json")
        val providerB = addonSubtitle(id = "shared", providerOrigin = "https://b.example/manifest.json")

        val entries = registry.reconcile(listOf(providerA, providerB))

        assertNotEquals(entries[0].identity, entries[1].identity)
        assertEquals("https://a.example/manifest.json", entries[0].identity.providerOrigin)
        assertEquals("https://b.example/manifest.json", entries[1].identity.providerOrigin)
    }

    @Test
    fun lateStableCollisionNeverRewritesAnAssignedIdentity() {
        val registry = AddonSubtitleSessionRegistry()
        val first = addonSubtitle(
            id = "same",
            url = "https://cdn.example/feature.en.srt",
            fileName = "feature.en.srt",
        )
        val firstIdentity = registry.reconcile(listOf(first)).single().identity
        val collision = addonSubtitle(
            id = "same",
            url = "https://cdn.example/commentary.en.srt",
            fileName = "commentary.en.srt",
        )

        val entries = registry.reconcile(listOf(first, collision))

        assertEquals(firstIdentity, entries.single { it.subtitle.url == first.url }.identity)
        val collisionIdentity = entries.single { it.subtitle.url == collision.url }.identity
        assertNotEquals(firstIdentity, collisionIdentity)
        assertEquals(AddonSubtitleDiscriminatorKind.FILE_NAME, collisionIdentity.discriminator?.kind)
        assertEquals("commentary.en.srt", collisionIdentity.discriminator?.value)
    }

    @Test
    fun reorderFilteringAndSignedUrlRefreshPreserveDeepSelectionIdentity() {
        val registry = AddonSubtitleSessionRegistry()
        val initial = (0 until 35).map { index ->
            addonSubtitle(
                id = "subtitle-$index",
                url = "https://cdn.example/$index.srt?token=old",
                fileName = "subtitle-$index.srt",
            )
        }
        val target = initial[27]
        val targetIdentity = registry.reconcile(initial).single { it.subtitle == target }.identity

        registry.reconcile(initial.filterIndexed { index, _ -> index % 2 == 1 })
        registry.reconcile(emptyList(), pinnedSubtitle = target)
        val refreshedTarget = target.copy(url = "https://cdn.example/27.srt?token=new-signed-value")
        val refetched = initial
            .map { if (it.id == target.id) refreshedTarget else it }
            .reversed()
        val refreshedEntries = registry.reconcile(refetched, pinnedSubtitle = target)

        assertEquals(
            targetIdentity,
            refreshedEntries.single { it.subtitle.url == refreshedTarget.url }.identity,
        )
        assertEquals(refreshedTarget.url, refreshedEntries.single { it.identity == targetIdentity }.subtitle.url)
    }

    @Test
    fun uniqueProviderIdentitySurvivesAProviderMetadataCorrection() {
        val registry = AddonSubtitleSessionRegistry()
        val initial = addonSubtitle(
            id = "provider-id",
            language = "unknown",
            url = "https://cdn.example/subtitle.srt?old",
            fileName = null,
        )
        val identity = registry.reconcile(listOf(initial)).single().identity
        val corrected = initial.copy(
            language = "en",
            url = "https://cdn.example/subtitle.srt?new",
            providerFileName = "subtitle.en.srt",
        )

        assertEquals(identity, registry.reconcile(listOf(corrected)).single().identity)
    }

    @Test
    fun ambiguousRefetchPinsExactActiveEntryAndRequiresReselection() {
        val registry = AddonSubtitleSessionRegistry()
        val active = addonSubtitle(id = "duplicate", url = "https://cdn.example/a.srt?old")
        val other = addonSubtitle(id = "duplicate", url = "https://cdn.example/b.srt?old")
        val initial = registry.reconcile(listOf(active, other))
        val activeIdentity = initial.single { it.subtitle == active }.identity

        val ambiguousRefresh = listOf(
            active.copy(url = "https://cdn.example/a.srt?new"),
            other.copy(url = "https://cdn.example/b.srt?new"),
        )
        val refreshed = registry.reconcile(ambiguousRefresh, pinnedSubtitle = active)

        assertEquals(active, refreshed.single { it.identity == activeIdentity }.subtitle)
        assertTrue(refreshed.none { it.identity == activeIdentity && it.subtitle.url.endsWith("?new") })
        assertEquals(3, refreshed.size)
    }

    @Test
    fun lateAmbiguousCollisionGetsOpaqueIdentityWithoutChangingTheActiveEntry() {
        val registry = AddonSubtitleSessionRegistry()
        val active = addonSubtitle(id = "duplicate", url = "https://cdn.example/a.srt")
        val activeIdentity = registry.reconcile(listOf(active)).single().identity
        val collision = active.copy(url = "https://cdn.example/b.srt")

        val entries = registry.reconcile(listOf(active, collision), pinnedSubtitle = active)
        val collisionIdentity = entries.single { it.subtitle == collision }.identity

        assertEquals(activeIdentity, entries.single { it.subtitle == active }.identity)
        assertNotEquals(activeIdentity, collisionIdentity)
        assertTrue(collisionIdentity.fallbackToken != null)
        assertNull(collisionIdentity.discriminator)
    }

    @Test
    fun legacyRestoreResolvesOnlyAUniqueExactEntry() {
        val exact = addonSubtitle(id = "same", url = "https://cdn.example/exact.srt?old")
        val collision = addonSubtitle(id = "same", url = "https://cdn.example/other.srt?old")

        assertEquals(
            exact,
            resolveRestoredAddonSubtitle(
                subtitles = listOf(collision, exact),
                subtitleId = "same",
                subtitleUrl = exact.url,
                addonName = exact.addonName,
            ),
        )
        assertNull(
            resolveRestoredAddonSubtitle(
                subtitles = listOf(collision, exact),
                subtitleId = "same",
                subtitleUrl = "https://cdn.example/expired.srt",
                addonName = exact.addonName,
            ),
        )
    }

    @Test
    fun modalUserIntentWinsOverStalePlaybackObservationUntilAcknowledged() {
        val internalKey = SubtitleSelectionKey.BuiltIn(trackIndex = 2, trackId = "embedded-en")
        val addonIdentity = AddonSubtitleSessionIdentity(
            providerOrigin = "https://provider.example/manifest.json",
            providerSubtitleId = "addon-en",
        )
        val addonKey = SubtitleSelectionKey.Addon(addonIdentity)
        val initial = SubtitleModalSelectionState.fromPlayback("en", internalKey)

        val requested = initial.selectOption(languageKey = "en", optionKey = addonKey)
        val afterStaleObservation = requested.observePlayback("en", internalKey)
        val acknowledged = afterStaleObservation.observePlayback("en", addonKey)

        assertEquals(addonKey, afterStaleObservation.requestedOptionKey)
        assertTrue(afterStaleObservation.isUserOwned)
        assertEquals(addonKey, acknowledged.requestedOptionKey)
        assertFalse(acknowledged.isUserOwned)
    }

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
        assertFalse(
            isUnhandledTap(
                standardClickWasHandled = false,
                downX = 20f,
                downY = 40f,
                upX = 40f,
                upY = 40f,
                touchSlop = 8f,
            ),
        )
        assertFalse(
            isUnhandledTap(
                standardClickWasHandled = false,
                downX = 20f,
                downY = 40f,
                upX = 32f,
                upY = 52f,
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
            addonSubtitles = AddonSubtitleSessionRegistry().reconcile(listOf(addon, addon)),
        )

        assertEquals(2, options.size)
        assertIs<SubtitleSelectionOption.BuiltIn>(options[0])
        assertIs<SubtitleSelectionOption.Addon>(options[1])
    }

    @Test
    fun lazyListKeysAreBundleSafeAndDoNotExposeAddonTransportIdentity() {
        val addon = addonSubtitle(
            id = "provider-id",
            url = "https://signed.example/subtitle.srt?token=secret",
            providerOrigin = "https://provider.example/manifest.json",
        )
        val addonEntry = AddonSubtitleSessionRegistry().reconcile(listOf(addon)).single()
        val keys = SubtitleOptionLazyKeyRegistry()

        val addonKey = keys.keyFor(SubtitleSelectionKey.Addon(addonEntry.identity))
        val builtInKey = keys.keyFor(SubtitleSelectionKey.BuiltIn(trackIndex = 7, trackId = "embedded:english"))

        assertEquals(String::class, addonKey::class)
        assertEquals(String::class, builtInKey::class)
        assertFalse(addonKey.contains(addon.url))
        assertFalse(addonKey.contains(addon.providerOrigin))
        assertEquals("subtitle-language-off", subtitleLanguageLazyListKey(SubtitleOffLanguageKey))
        assertEquals("subtitle-language-unknown", subtitleLanguageLazyListKey(SubtitleUnknownLanguageKey))
    }

    @Test
    fun addonLazyKeysStayStableAcrossDeepReorderAndSignedUrlRefresh() {
        val identityRegistry = AddonSubtitleSessionRegistry()
        val lazyKeyRegistry = SubtitleOptionLazyKeyRegistry()
        val initial = (0 until 35).map { index ->
            addonSubtitle(
                id = "subtitle-$index",
                url = "https://cdn.example/$index.srt?token=old",
                fileName = "subtitle-$index.srt",
            )
        }
        val target = initial[27]
        identityRegistry.reconcile(initial.take(10))
        val targetEntry = identityRegistry.reconcile(initial).single { it.subtitle == target }
        val targetSelectionKey = SubtitleSelectionKey.Addon(targetEntry.identity)
        val targetLazyKey = lazyKeyRegistry.keyFor(targetSelectionKey)

        val refreshedTarget = target.copy(url = "https://cdn.example/27.srt?token=new")
        val refreshedEntries = identityRegistry.reconcile(
            initial.map { if (it.id == target.id) refreshedTarget else it }.reversed(),
            pinnedSubtitle = target,
        )
        val refreshedOption = buildSubtitleSelectionOptions("en", emptyList(), refreshedEntries)
            .single { it.key == targetSelectionKey }

        assertEquals(targetLazyKey, lazyKeyRegistry.keyFor(refreshedOption.key))
        assertEquals(refreshedTarget, assertIs<SubtitleSelectionOption.Addon>(refreshedOption).subtitle)
    }

    @Test
    fun duplicateProviderIdsReceiveDistinctStableAddonLazyKeys() {
        val identityRegistry = AddonSubtitleSessionRegistry()
        val lazyKeyRegistry = SubtitleOptionLazyKeyRegistry()
        val providerA = addonSubtitle(id = "shared", providerOrigin = "https://a.example/manifest.json")
        val providerB = addonSubtitle(id = "shared", providerOrigin = "https://b.example/manifest.json")
        val sameProviderCollision = providerA.copy(
            url = "https://cdn.example/commentary.srt",
            providerFileName = "commentary.srt",
        )
        val initial = identityRegistry.reconcile(listOf(providerA, providerB, sameProviderCollision))
        val initialKeys = initial.associate { entry ->
            entry.identity to lazyKeyRegistry.keyFor(SubtitleSelectionKey.Addon(entry.identity))
        }

        val reordered = identityRegistry.reconcile(listOf(sameProviderCollision, providerB, providerA))
        val reorderedKeys = reordered.associate { entry ->
            entry.identity to lazyKeyRegistry.keyFor(SubtitleSelectionKey.Addon(entry.identity))
        }

        assertEquals(3, initialKeys.values.toSet().size)
        assertEquals(initialKeys, reorderedKeys)
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
        language: String = "en",
        url: String = "https://example.com/$id.srt",
        providerOrigin: String = "https://provider.example/manifest.json",
        fileName: String? = null,
    ) = AddonSubtitle(
        id = id,
        url = url,
        language = language,
        display = id,
        addonName = "Addon",
        providerOrigin = providerOrigin,
        providerSubtitleId = id,
        providerFileName = fileName,
    )
}
