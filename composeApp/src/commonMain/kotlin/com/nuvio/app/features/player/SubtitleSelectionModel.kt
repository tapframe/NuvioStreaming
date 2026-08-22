package com.nuvio.app.features.player

internal const val SubtitleOffLanguageKey = "__off__"
internal const val SubtitleUnknownLanguageKey = "__unknown__"

internal data class SubtitleLanguageItem(
    val key: String,
    val count: Int,
)

internal enum class SubtitleOptionsRailEmptyContent {
    NONE,
    LOADING,
    FETCH,
}

internal enum class AddonSubtitleDiscriminatorKind {
    FILE_NAME,
    LANGUAGE,
    FORMAT,
}

internal data class AddonSubtitleIdentityDiscriminator(
    val kind: AddonSubtitleDiscriminatorKind,
    val value: String,
)

internal data class AddonSubtitleSessionIdentity(
    val providerOrigin: String,
    val providerSubtitleId: String?,
    val discriminator: AddonSubtitleIdentityDiscriminator? = null,
    val fallbackToken: Long? = null,
)

internal data class AddonSubtitleSessionEntry(
    val identity: AddonSubtitleSessionIdentity,
    val subtitle: AddonSubtitle,
)

internal data class RestoredAddonSubtitleReference(
    val subtitleId: String?,
    val subtitleUrl: String,
    val addonName: String?,
)

internal sealed interface SubtitleSelectionKey {
    data class BuiltIn(
        val trackIndex: Int,
        val trackId: String,
    ) : SubtitleSelectionKey

    data class Addon(
        val identity: AddonSubtitleSessionIdentity,
    ) : SubtitleSelectionKey
}

internal data class SubtitleModalSelectionState(
    val activeLanguageKey: String,
    val requestedOptionKey: SubtitleSelectionKey?,
    val isUserOwned: Boolean,
) {
    fun selectLanguage(
        languageKey: String,
        optionKeyInLanguage: SubtitleSelectionKey?,
    ): SubtitleModalSelectionState = copy(
        activeLanguageKey = languageKey,
        requestedOptionKey = optionKeyInLanguage,
        isUserOwned = true,
    )

    fun selectOption(
        languageKey: String,
        optionKey: SubtitleSelectionKey?,
    ): SubtitleModalSelectionState = copy(
        activeLanguageKey = languageKey,
        requestedOptionKey = optionKey,
        isUserOwned = true,
    )

    fun observePlayback(
        languageKey: String,
        optionKey: SubtitleSelectionKey?,
    ): SubtitleModalSelectionState {
        if (!isUserOwned) return fromPlayback(languageKey, optionKey)
        return if (languageKey == activeLanguageKey && optionKey == requestedOptionKey) {
            copy(isUserOwned = false)
        } else {
            this
        }
    }

    companion object {
        fun fromPlayback(
            languageKey: String,
            optionKey: SubtitleSelectionKey?,
        ) = SubtitleModalSelectionState(
            activeLanguageKey = languageKey,
            requestedOptionKey = optionKey,
            isUserOwned = false,
        )
    }
}

internal class AddonSubtitleSessionRegistry {
    private data class PrimaryKey(
        val providerOrigin: String,
        val providerSubtitleId: String?,
    )

    private data class StableMetadata(
        val fileName: String?,
        val language: String?,
        val format: String?,
    )

    private class Record(
        val identity: AddonSubtitleSessionIdentity,
        val primaryKey: PrimaryKey,
        val stableMetadata: StableMetadata,
        var latestSubtitle: AddonSubtitle,
    ) {
        val observedSubtitles = mutableListOf(latestSubtitle)

        fun update(subtitle: AddonSubtitle) {
            latestSubtitle = subtitle
            if (observedSubtitles.none { it == subtitle }) observedSubtitles += subtitle
        }
    }

    private val records = mutableListOf<Record>()
    private var nextFallbackToken = 1L

    fun reconcile(
        subtitles: List<AddonSubtitle>,
        pinnedSubtitle: AddonSubtitle? = null,
    ): List<AddonSubtitleSessionEntry> {
        val usedIdentities = mutableSetOf<AddonSubtitleSessionIdentity>()
        val entries = subtitles.map { subtitle ->
            val record = findRecord(subtitle, usedIdentities) ?: createRecord(subtitle)
            record.update(subtitle)
            usedIdentities += record.identity
            AddonSubtitleSessionEntry(record.identity, subtitle)
        }.distinctBy { it.identity }

        val pinnedRecord = pinnedSubtitle?.let(::recordForPreviouslyObservedSubtitle)
        if (pinnedRecord == null || entries.any { it.identity == pinnedRecord.identity }) return entries
        return entries + AddonSubtitleSessionEntry(pinnedRecord.identity, pinnedSubtitle)
    }

    fun identityOf(subtitle: AddonSubtitle): AddonSubtitleSessionIdentity? =
        recordForPreviouslyObservedSubtitle(subtitle)?.identity

    private fun findRecord(
        subtitle: AddonSubtitle,
        usedIdentities: Set<AddonSubtitleSessionIdentity>,
    ): Record? {
        val primaryKey = subtitle.primaryKey()
        val candidates = records.filter { it.primaryKey == primaryKey }
        if (candidates.isEmpty()) return null

        candidates.singleOrNull { record ->
            record.observedSubtitles.any { observed -> observed == subtitle }
        }?.let { return it }

        candidates.singleOrNull { record ->
            record.observedSubtitles.any { observed ->
                observed.url == subtitle.url
            }
        }?.let { return it }

        val metadata = subtitle.stableMetadata()
        val stableMatches = candidates.filter { record -> record.stableMetadata == metadata }
        stableMatches.singleOrNull { it.identity !in usedIdentities }?.let { return it }

        if (candidates.size == 1) {
            val only = candidates.single()
            if (only.identity !in usedIdentities) return only
        }
        return null
    }

    private fun createRecord(subtitle: AddonSubtitle): Record {
        val primaryKey = subtitle.primaryKey()
        val candidates = records.filter { it.primaryKey == primaryKey }
        val discriminator = subtitle.stableDiscriminators().firstOrNull { discriminator ->
            candidates.none { record -> record.stableValue(discriminator.kind) == discriminator.value }
        }
        val identity = if (candidates.isEmpty()) {
            AddonSubtitleSessionIdentity(
                providerOrigin = primaryKey.providerOrigin,
                providerSubtitleId = primaryKey.providerSubtitleId,
            )
        } else if (discriminator != null) {
            AddonSubtitleSessionIdentity(
                providerOrigin = primaryKey.providerOrigin,
                providerSubtitleId = primaryKey.providerSubtitleId,
                discriminator = discriminator,
            )
        } else {
            AddonSubtitleSessionIdentity(
                providerOrigin = primaryKey.providerOrigin,
                providerSubtitleId = primaryKey.providerSubtitleId,
                fallbackToken = nextFallbackToken++,
            )
        }
        return Record(
            identity = identity,
            primaryKey = primaryKey,
            stableMetadata = subtitle.stableMetadata(),
            latestSubtitle = subtitle,
        ).also(records::add)
    }

    private fun recordForPreviouslyObservedSubtitle(subtitle: AddonSubtitle): Record? {
        val candidates = records.filter { it.primaryKey == subtitle.primaryKey() }
        return candidates.singleOrNull { record ->
            record.observedSubtitles.any { observed -> observed == subtitle }
        } ?: candidates.singleOrNull { record ->
            record.observedSubtitles.any { observed -> observed.url == subtitle.url }
        }
    }

    private fun AddonSubtitle.primaryKey() = PrimaryKey(
        providerOrigin = providerOrigin.ifBlank { addonName.orEmpty() },
        providerSubtitleId = providerSubtitleId?.takeIf { it.isNotBlank() },
    )

    private fun AddonSubtitle.stableMetadata() = StableMetadata(
        fileName = providerFileName?.trim()?.takeIf { it.isNotBlank() },
        language = normalizeLanguageCode(language),
        format = providerFormat?.trim()?.lowercase()?.takeIf { it.isNotBlank() },
    )

    private fun AddonSubtitle.stableDiscriminators(): List<AddonSubtitleIdentityDiscriminator> =
        listOfNotNull(
            providerFileName?.trim()?.takeIf { it.isNotBlank() }?.let {
                AddonSubtitleIdentityDiscriminator(AddonSubtitleDiscriminatorKind.FILE_NAME, it)
            },
            normalizeLanguageCode(language)?.let {
                AddonSubtitleIdentityDiscriminator(AddonSubtitleDiscriminatorKind.LANGUAGE, it)
            },
            providerFormat?.trim()?.lowercase()?.takeIf { it.isNotBlank() }?.let {
                AddonSubtitleIdentityDiscriminator(AddonSubtitleDiscriminatorKind.FORMAT, it)
            },
        )

    private fun Record.stableValue(kind: AddonSubtitleDiscriminatorKind): String? = when (kind) {
        AddonSubtitleDiscriminatorKind.FILE_NAME -> stableMetadata.fileName
        AddonSubtitleDiscriminatorKind.LANGUAGE -> stableMetadata.language
        AddonSubtitleDiscriminatorKind.FORMAT -> stableMetadata.format
    }

}

internal sealed interface SubtitleSelectionOption {
    val key: SubtitleSelectionKey

    data class BuiltIn(
        val track: SubtitleTrack,
    ) : SubtitleSelectionOption {
        override val key = SubtitleSelectionKey.BuiltIn(track.index, track.id)
    }

    data class Addon(
        val entry: AddonSubtitleSessionEntry,
    ) : SubtitleSelectionOption {
        val subtitle: AddonSubtitle get() = entry.subtitle
        override val key = SubtitleSelectionKey.Addon(entry.identity)
    }
}

internal fun buildSubtitleLanguageItems(
    subtitleTracks: List<SubtitleTrack>,
    addonSubtitles: List<AddonSubtitle>,
    preferredLanguage: String,
    secondaryPreferredLanguage: String?,
    showOnlyPreferredLanguages: Boolean,
    selectedLanguageKey: String,
): List<SubtitleLanguageItem> {
    val counts = linkedMapOf<String, Int>()
    subtitleTracks.forEach { track ->
        val key = track.subtitleLanguageKey()
        counts[key] = (counts[key] ?: 0) + 1
    }
    addonSubtitles.forEach { subtitle ->
        val key = subtitleLanguageKey(subtitle.language)
        counts[key] = (counts[key] ?: 0) + 1
    }

    val preferredOrder = listOfNotNull(
        preferredLanguage.toPreferredSubtitleKey(),
        secondaryPreferredLanguage.toPreferredSubtitleKey(),
    ).distinct()
    val preferredKeys = preferredOrder.toSet()
    val visibleEntries = counts.entries.filter { entry ->
        !showOnlyPreferredLanguages || entry.key in preferredKeys || entry.key == selectedLanguageKey
    }
    val sortedEntries = visibleEntries.sortedWith(
        compareBy<Map.Entry<String, Int>>(
            { entry -> preferredOrder.indexOf(entry.key).takeIf { it >= 0 } ?: Int.MAX_VALUE },
            { entry -> if (entry.key == SubtitleUnknownLanguageKey) "\uFFFF" else entry.key },
        ),
    )

    return listOf(SubtitleLanguageItem(SubtitleOffLanguageKey, 0)) +
        sortedEntries.map { SubtitleLanguageItem(it.key, it.value) }
}

internal fun buildSubtitleSelectionOptions(
    languageKey: String,
    subtitleTracks: List<SubtitleTrack>,
    addonSubtitles: List<AddonSubtitleSessionEntry>,
): List<SubtitleSelectionOption> {
    if (languageKey == SubtitleOffLanguageKey) return emptyList()

    val builtInOptions = subtitleTracks
        .filter { it.subtitleLanguageKey() == languageKey }
        .map { SubtitleSelectionOption.BuiltIn(it) }
    val seenAddonIds = mutableSetOf<SubtitleSelectionKey>()
    val addonOptions = addonSubtitles
        .filter { subtitleLanguageKey(it.subtitle.language) == languageKey }
        .map(SubtitleSelectionOption::Addon)
        .filter { seenAddonIds.add(it.key) }

    return builtInOptions + addonOptions
}

internal fun subtitleOptionsRailEmptyContent(
    selectedLanguageKey: String,
    hasAvailableLanguages: Boolean,
    isLoadingAddonSubtitles: Boolean,
): SubtitleOptionsRailEmptyContent {
    if (selectedLanguageKey == SubtitleOffLanguageKey && hasAvailableLanguages) {
        return SubtitleOptionsRailEmptyContent.NONE
    }
    return if (isLoadingAddonSubtitles) {
        SubtitleOptionsRailEmptyContent.LOADING
    } else {
        SubtitleOptionsRailEmptyContent.FETCH
    }
}

internal fun selectedSubtitleLanguageKey(
    subtitleTracks: List<SubtitleTrack>,
    selectedSubtitleIndex: Int,
    selectedAddonSubtitle: AddonSubtitle?,
): String {
    selectedAddonSubtitle?.let { return subtitleLanguageKey(it.language) }
    return subtitleTracks
        .firstOrNull { it.index == selectedSubtitleIndex }
        ?.subtitleLanguageKey()
        ?: subtitleTracks.firstOrNull { it.isSelected }?.subtitleLanguageKey()
        ?: SubtitleOffLanguageKey
}

internal fun selectedSubtitleOptionKey(
    subtitleTracks: List<SubtitleTrack>,
    selectedSubtitleIndex: Int,
    selectedAddonIdentity: AddonSubtitleSessionIdentity?,
): SubtitleSelectionKey? {
    selectedAddonIdentity?.let { return SubtitleSelectionKey.Addon(it) }
    return subtitleTracks
        .firstOrNull { it.index == selectedSubtitleIndex }
        ?.let { SubtitleSelectionKey.BuiltIn(it.index, it.id) }
        ?: subtitleTracks
            .firstOrNull { it.isSelected }
            ?.let { SubtitleSelectionKey.BuiltIn(it.index, it.id) }
}

internal fun resolveRestoredAddonSubtitle(
    subtitles: List<AddonSubtitle>,
    subtitleId: String?,
    subtitleUrl: String?,
    addonName: String?,
): AddonSubtitle? {
    subtitleUrl?.takeIf { it.isNotBlank() }?.let { exactUrl ->
        subtitles.singleOrNull { it.url == exactUrl }?.let { return it }
    }
    val id = subtitleId?.takeIf { it.isNotBlank() } ?: return null
    val idMatches = subtitles.filter { it.id == id }
    if (!addonName.isNullOrBlank()) {
        idMatches.singleOrNull { it.addonName == addonName }?.let { return it }
    }
    return idMatches.singleOrNull()
}

internal fun subtitleLanguageKey(language: String?): String {
    val normalized = normalizeLanguageCode(language) ?: return SubtitleUnknownLanguageKey
    return when (normalized) {
        "pt-br", "es-419" -> normalized
        else -> normalized.substringBefore('-').ifBlank { SubtitleUnknownLanguageKey }
    }
}

private fun SubtitleTrack.subtitleLanguageKey(): String {
    val normalized = subtitleLanguageKey(language)
    val haystack = listOf(label, language, id).filterNotNull().joinToString(" ").lowercase()
    return when (normalized) {
        "pt" -> when {
            BrazilianPortugueseHints.any(haystack::contains) &&
                EuropeanPortugueseHints.none(haystack::contains) -> "pt-br"
            else -> normalized
        }
        "es" -> when {
            LatinAmericanSpanishHints.any(haystack::contains) &&
                CastilianSpanishHints.none(haystack::contains) -> "es-419"
            else -> normalized
        }
        else -> normalized
    }
}

private fun String?.toPreferredSubtitleKey(): String? {
    val normalized = normalizeLanguageCode(this) ?: return null
    if (normalized == SubtitleLanguageOption.NONE || normalized == SubtitleLanguageOption.FORCED) return null
    return subtitleLanguageKey(normalized).takeUnless { it == SubtitleUnknownLanguageKey }
}

private val BrazilianPortugueseHints = listOf(
    "pt-br", "pt_br", "pob", "brazilian", "brazil", "brasil", "brasileiro", "(br)",
)

private val EuropeanPortugueseHints = listOf(
    "pt-pt", "pt_pt", "portugal", "european", "europeu", "iberian", "(eu)",
)

private val LatinAmericanSpanishHints = listOf(
    "es-419", "es_419", "es-la", "es-lat", "latino", "latinoamerica", "latam", "latin america",
)

private val CastilianSpanishHints = listOf(
    "es-es", "es_es", "castilian", "castellano", "spain", "españa", "espana", "iberian",
)
