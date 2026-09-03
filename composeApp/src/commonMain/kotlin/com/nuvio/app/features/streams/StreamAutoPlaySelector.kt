package com.nuvio.app.features.streams

import com.nuvio.app.core.build.AppFeaturePolicy

object StreamAutoPlaySelector {

    fun orderAddonStreams(
        groups: List<AddonStreamGroup>,
        installedOrder: List<String>,
    ): List<AddonStreamGroup> {
        if (groups.isEmpty()) return groups

        val addonRankByName = HashMap<String, Int>(installedOrder.size)
        installedOrder.forEachIndexed { index, addonName ->
            if (addonName !in addonRankByName) addonRankByName[addonName] = index
        }

        val (directDebridEntries, remainingEntries) = groups.partition { group ->
            group.addonId.startsWith("debrid:") ||
                group.streams.any { stream -> stream.isAddonDebridCandidate && stream.isDirectDebridStream }
        }
        if (installedOrder.isEmpty()) return directDebridEntries + remainingEntries

        val (addonEntries, pluginEntries) = remainingEntries.partition { group ->
            group.addonName in addonRankByName
        }
        val orderedAddons = addonEntries.sortedBy { group -> addonRankByName.getValue(group.addonName) }
        return directDebridEntries + orderedAddons + pluginEntries
    }

    fun selectAutoPlayStream(
        streams: List<StreamItem>,
        mode: StreamAutoPlayMode,
        regexPattern: String,
        source: StreamAutoPlaySource,
        installedAddonNames: Set<String>,
        selectedAddons: Set<String>,
        selectedPlugins: Set<String>,
        preferredBingeGroup: String? = null,
        preferBingeGroupInSelection: Boolean = false,
        bingeGroupOnly: Boolean = false,
        debridEnabled: Boolean = true,
        activeResolverProviderId: String? = null,
        smartSelectionContext: SmartStreamSelector.Context = SmartStreamSelector.Context(),
    ): StreamItem? = evaluateAutoPlayStream(
        streams = streams,
        mode = mode,
        regexPattern = regexPattern,
        source = source,
        installedAddonNames = installedAddonNames,
        selectedAddons = selectedAddons,
        selectedPlugins = selectedPlugins,
        preferredBingeGroup = preferredBingeGroup,
        preferBingeGroupInSelection = preferBingeGroupInSelection,
        bingeGroupOnly = bingeGroupOnly,
        debridEnabled = debridEnabled,
        activeResolverProviderId = activeResolverProviderId,
        smartSelectionContext = smartSelectionContext,
    ).stream

    fun evaluateAutoPlayStream(
        streams: List<StreamItem>,
        mode: StreamAutoPlayMode,
        regexPattern: String,
        source: StreamAutoPlaySource,
        installedAddonNames: Set<String>,
        selectedAddons: Set<String>,
        selectedPlugins: Set<String>,
        preferredBingeGroup: String? = null,
        preferBingeGroupInSelection: Boolean = false,
        bingeGroupOnly: Boolean = false,
        debridEnabled: Boolean = true,
        activeResolverProviderId: String? = null,
        smartSelectionContext: SmartStreamSelector.Context = SmartStreamSelector.Context(),
    ): StreamAutoPlayEvaluation {
        if (streams.isEmpty()) return StreamAutoPlayEvaluation()

        val sourceScopedStreams = when (source) {
            StreamAutoPlaySource.ALL_SOURCES -> streams
            StreamAutoPlaySource.INSTALLED_ADDONS_ONLY -> streams.filter { it.addonName in installedAddonNames }
            StreamAutoPlaySource.ENABLED_PLUGINS_ONLY -> streams.filter { it.addonName !in installedAddonNames }
        }
        val candidateStreams = sourceScopedStreams.filter { stream ->
            val isAddonStream = stream.addonName in installedAddonNames
            if (isAddonStream) selectedAddons.isEmpty() || stream.addonName in selectedAddons
            else selectedPlugins.isEmpty() || stream.addonName in selectedPlugins
        }
        if (candidateStreams.isEmpty()) return StreamAutoPlayEvaluation()
        if (mode == StreamAutoPlayMode.MANUAL && !bingeGroupOnly) return StreamAutoPlayEvaluation()

        val targetBingeGroup = preferredBingeGroup?.trim().orEmpty()
        val bingeGroupCandidates = if (preferBingeGroupInSelection && targetBingeGroup.isNotEmpty()) {
            candidateStreams.filter { it.behaviorHints.bingeGroup == targetBingeGroup }
        } else emptyList()

        val preferredReadyStream = SmartStreamSelector.rank(
            bingeGroupCandidates.filter { it.isAutoPlayable(debridEnabled, activeResolverProviderId) },
            smartSelectionContext,
        ).firstOrNull()

        if (bingeGroupOnly) {
            val readyStreams = preferredReadyStream?.let(::listOf).orEmpty()
            return StreamAutoPlayEvaluation(
                stream = preferredReadyStream,
                readyStreams = readyStreams,
                hasPendingDebridCandidate = preferredReadyStream == null &&
                    bingeGroupCandidates.any { it.isPendingDebridAutoPlay(debridEnabled, activeResolverProviderId) },
            )
        }
        if (mode == StreamAutoPlayMode.MANUAL) return StreamAutoPlayEvaluation()

        val matchingStreams = when (mode) {
            StreamAutoPlayMode.MANUAL -> emptyList()
            StreamAutoPlayMode.FIRST_STREAM -> candidateStreams
            StreamAutoPlayMode.REGEX_MATCH -> {
                val pattern = regexPattern.trim()
                val userRegex = runCatching { Regex(pattern, RegexOption.IGNORE_CASE) }.getOrNull()
                    ?: return StreamAutoPlayEvaluation()

                val exclusionMatches = Regex("\\(\\?![^)]*?\\(([^)]+)\\)").findAll(pattern)
                val exclusionWords = exclusionMatches
                    .flatMap { match -> match.groupValues[1].split("|") }
                    .map { it.trim() }
                    .filter { it.isNotBlank() }
                    .toList()
                val excludeRegex = if (exclusionWords.isNotEmpty()) {
                    Regex("\\b(${exclusionWords.joinToString("|")})\\b", RegexOption.IGNORE_CASE)
                } else null

                candidateStreams.filter { stream ->
                    val searchableText = buildString {
                        append(stream.addonName).append(' ')
                        append(stream.name.orEmpty()).append(' ')
                        append(stream.streamLabel).append(' ')
                        append(stream.description.orEmpty()).append(' ')
                        append(stream.playableDirectUrl.orEmpty())
                    }
                    userRegex.containsMatchIn(searchableText) &&
                        (excludeRegex == null || !excludeRegex.containsMatchIn(searchableText))
                }
            }
        }

        val readyCandidates = matchingStreams.filter {
            it.isAutoPlayable(debridEnabled, activeResolverProviderId)
        }
        if (readyCandidates.isEmpty() && preferredReadyStream == null) {
            return StreamAutoPlayEvaluation(
                hasPendingDebridCandidate = matchingStreams.any {
                    it.isPendingDebridAutoPlay(debridEnabled, activeResolverProviderId)
                },
            )
        }

        val rankedReadyStreams = SmartStreamSelector.rank(readyCandidates, smartSelectionContext)
        val readyStreams = buildList {
            preferredReadyStream?.let(::add)
            rankedReadyStreams.filterNot { it == preferredReadyStream }.forEach(::add)
        }
        val selected = readyStreams.firstOrNull()
        return StreamAutoPlayEvaluation(
            stream = selected,
            readyStreams = readyStreams,
        )
    }

    private fun StreamItem.isAutoPlayable(
        debridEnabled: Boolean,
        activeResolverProviderId: String?,
    ): Boolean = playableDirectUrl != null ||
        (AppFeaturePolicy.p2pEnabled && needsLocalDebridResolve && p2pInfoHash != null &&
            !isPendingDebridAutoPlay(debridEnabled, activeResolverProviderId)) ||
        (debridEnabled && isAddonDebridCandidate && isReadyDebridAutoPlay(activeResolverProviderId))

    private fun StreamItem.isReadyDebridAutoPlay(activeResolverProviderId: String?): Boolean = when {
        isDirectDebridStream -> clientResolve?.service.matchesResolver(activeResolverProviderId)
        isCachedDebridTorrentStream -> debridCacheStatus?.providerId.matchesResolver(activeResolverProviderId)
        else -> false
    }

    private fun StreamItem.isPendingDebridAutoPlay(
        debridEnabled: Boolean,
        activeResolverProviderId: String?,
    ): Boolean {
        if (!debridEnabled || !isInstalledAddonStream || !needsLocalDebridResolve) return false
        if (!debridCacheStatus?.providerId.matchesResolver(activeResolverProviderId)) return false
        val state = debridCacheStatus?.state
        return state == null || state == StreamDebridCacheState.CHECKING
    }

    private fun String?.matchesResolver(activeResolverProviderId: String?): Boolean {
        val active = activeResolverProviderId?.trim().orEmpty()
        return active.isBlank() || this == null || equals(active, ignoreCase = true)
    }
}

data class StreamAutoPlayEvaluation(
    val stream: StreamItem? = null,
    val readyStreams: List<StreamItem> = emptyList(),
    val hasPendingDebridCandidate: Boolean = false,
)
