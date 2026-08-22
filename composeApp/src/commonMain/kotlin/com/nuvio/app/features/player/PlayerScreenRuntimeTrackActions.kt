package com.nuvio.app.features.player

internal val PlayerScreenRuntime.subtitleStyle: SubtitleStyleState
    get() = playerSettingsUiState.subtitleStyle

internal val PlayerScreenRuntime.activeAddonSubtitleType: String
    get() = contentType ?: parentMetaType

internal val PlayerScreenRuntime.addonSubtitleFetchKey: String?
    get() = buildAddonSubtitleFetchKey(
        addons = addonsUiState.addons,
        type = activeAddonSubtitleType,
        videoId = activeVideoId,
    )

internal val PlayerScreenRuntime.visibleAddonSubtitles: List<AddonSubtitle>
    get() = filterAddonSubtitlesForSettings(
        subtitles = addonSubtitles,
        settings = playerSettingsUiState,
    )

internal val PlayerScreenRuntime.selectedAddonSubtitle: AddonSubtitle?
    get() = activeAddonSubtitle

internal fun PlayerScreenRuntime.updateTrackPreference(
    update: (PersistedPlayerTrackPreference) -> PersistedPlayerTrackPreference,
) {
    if (parentMetaId.isBlank()) return
    val current = PlayerTrackPreferenceStorage.load(parentMetaId) ?: PersistedPlayerTrackPreference()
    PlayerTrackPreferenceStorage.save(parentMetaId, update(current))
}

internal fun PlayerScreenRuntime.persistAudioPreference(track: AudioTrack?) {
    updateTrackPreference { current ->
        current.copy(
            audioLanguage = track?.language,
            audioName = track?.label,
            audioTrackId = track?.id,
        )
    }
}

internal fun PlayerScreenRuntime.persistInternalSubtitlePreference(track: SubtitleTrack?) {
    updateTrackPreference { current ->
        current.copy(
            subtitleType = if (track == null) {
                PersistedSubtitleSelectionType.DISABLED
            } else {
                PersistedSubtitleSelectionType.INTERNAL
            },
            subtitleLanguage = track?.language,
            subtitleName = track?.label,
            subtitleTrackId = track?.id,
            addonSubtitleId = null,
            addonSubtitleUrl = null,
            addonSubtitleAddonName = null,
        )
    }
}

internal fun PlayerScreenRuntime.persistAddonSubtitlePreference(subtitle: AddonSubtitle) {
    updateTrackPreference { current ->
        current.copy(
            subtitleType = PersistedSubtitleSelectionType.ADDON,
            subtitleLanguage = subtitle.language,
            subtitleName = subtitle.display,
            subtitleTrackId = null,
            addonSubtitleId = subtitle.id,
            addonSubtitleUrl = subtitle.url,
            addonSubtitleAddonName = subtitle.addonName,
        )
    }
}

internal fun PlayerScreenRuntime.selectBuiltInSubtitleFromUser(index: Int) {
    preferredSubtitleSelectionApplied = true
    selectedSubtitleIndex = index
    selectedAddonSubtitleId = null
    activeAddonSubtitle = null
    pendingRestoredAddonSubtitle = null
    useCustomSubtitles = false
    persistInternalSubtitlePreference(subtitleTracks.firstOrNull { it.index == index })
    playerController?.selectSubtitleTrack(index)
}

internal fun PlayerScreenRuntime.selectAddonSubtitleFromUser(subtitle: AddonSubtitle) {
    preferredSubtitleSelectionApplied = true
    selectedAddonSubtitleId = subtitle.id
    activeAddonSubtitle = subtitle
    pendingRestoredAddonSubtitle = null
    selectedSubtitleIndex = -1
    useCustomSubtitles = true
    persistAddonSubtitlePreference(subtitle)
    playerController?.selectAddonSubtitle(subtitle)
}

internal fun PlayerScreenRuntime.restorePersistedTrackPreferenceIfNeeded() {
    if (trackPreferenceRestoreApplied) return
    val preference = PlayerTrackPreferenceStorage.load(parentMetaId)
    if (preference == null) {
        trackPreferenceRestoreApplied = true
        return
    }

    if (
        audioTracks.isNotEmpty() &&
        (!preference.audioTrackId.isNullOrBlank() ||
            !preference.audioLanguage.isNullOrBlank() ||
            !preference.audioName.isNullOrBlank())
    ) {
        val restoredAudioIndex = findPersistedAudioTrackIndex(audioTracks, preference)
        if (restoredAudioIndex >= 0 && restoredAudioIndex != selectedAudioIndex) {
            playerController?.selectAudioTrack(restoredAudioIndex)
            selectedAudioIndex = restoredAudioIndex
        }
        preferredAudioSelectionApplied = true
    }

    when (preference.subtitleType) {
        PersistedSubtitleSelectionType.DISABLED -> {
            playerController?.selectSubtitleTrack(-1)
            selectedSubtitleIndex = -1
            selectedAddonSubtitleId = null
            activeAddonSubtitle = null
            pendingRestoredAddonSubtitle = null
            useCustomSubtitles = false
            preferredSubtitleSelectionApplied = true
        }
        PersistedSubtitleSelectionType.INTERNAL -> {
            if (subtitleTracks.isNotEmpty()) {
                val restoredSubtitleIndex = findPersistedSubtitleTrackIndex(subtitleTracks, preference)
                if (restoredSubtitleIndex >= 0) {
                    if (useCustomSubtitles) {
                        playerController?.clearExternalSubtitleAndSelect(restoredSubtitleIndex)
                    } else {
                        playerController?.selectSubtitleTrack(restoredSubtitleIndex)
                    }
                    selectedSubtitleIndex = restoredSubtitleIndex
                    selectedAddonSubtitleId = null
                    activeAddonSubtitle = null
                    pendingRestoredAddonSubtitle = null
                    useCustomSubtitles = false
                    preferredSubtitleSelectionApplied = true
                }
            }
        }
        PersistedSubtitleSelectionType.ADDON -> {
            val url = preference.addonSubtitleUrl?.takeIf { it.isNotBlank() }
            if (url != null) {
                selectedAddonSubtitleId = preference.addonSubtitleId ?: url
                activeAddonSubtitle = null
                pendingRestoredAddonSubtitle = RestoredAddonSubtitleReference(
                    subtitleId = preference.addonSubtitleId,
                    subtitleUrl = url,
                    addonName = preference.addonSubtitleAddonName,
                )
                selectedSubtitleIndex = -1
                useCustomSubtitles = true
                playerController?.setSubtitleUri(url)
                preferredSubtitleSelectionApplied = true
            }
        }
    }

    trackPreferenceRestoreApplied = true
}

internal fun PlayerScreenRuntime.refreshTracks() {
    val ctrl = playerController ?: return
    audioTracks = ctrl.getAudioTracks()
    subtitleTracks = ctrl.getSubtitleTracks()
    val selectedAudio = audioTracks.firstOrNull { it.isSelected }
    if (selectedAudio != null) selectedAudioIndex = selectedAudio.index
    val selectedSub = subtitleTracks.firstOrNull { it.isSelected }
    if (selectedSub != null && !useCustomSubtitles) selectedSubtitleIndex = selectedSub.index

    restorePersistedTrackPreferenceIfNeeded()

    val preferredAudioTargets = resolvePreferredAudioLanguageTargets(
        preferredAudioLanguage = playerSettingsUiState.preferredAudioLanguage,
        secondaryPreferredAudioLanguage = playerSettingsUiState.secondaryPreferredAudioLanguage,
        deviceLanguages = DeviceLanguagePreferences.preferredLanguageCodes(),
        contentOriginalLanguage = resolveContentLanguage(
            language = metaUiState.meta?.language,
            country = metaUiState.meta?.country,
        ) ?: args.contentLanguage,
    )

    if (!preferredAudioSelectionApplied) {
        if (preferredAudioTargets.isEmpty()) {
            preferredAudioSelectionApplied = true
        } else if (audioTracks.isNotEmpty()) {
            val preferredAudioIndex = findPreferredTrackIndex(
                tracks = audioTracks,
                targets = preferredAudioTargets,
                language = ::resolveAudioTrackLanguageTarget,
            )
            if (preferredAudioIndex >= 0 && preferredAudioIndex != selectedAudioIndex) {
                playerController?.selectAudioTrack(preferredAudioIndex)
                selectedAudioIndex = preferredAudioIndex
            }
            preferredAudioSelectionApplied = true
        }
    }

    if (!preferredSubtitleSelectionApplied) {
        val preferredSubtitleLanguage = normalizeLanguageCode(
            playerSettingsUiState.preferredSubtitleLanguage,
        )
        val preferredSubtitleTargets = if (
            preferredSubtitleLanguage == SubtitleLanguageOption.NONE ||
            preferredSubtitleLanguage == SubtitleLanguageOption.FORCED
        ) {
            emptyList()
        } else {
            resolvePreferredSubtitleLanguageTargets(
                preferredSubtitleLanguage = playerSettingsUiState.preferredSubtitleLanguage,
                secondaryPreferredSubtitleLanguage = playerSettingsUiState.secondaryPreferredSubtitleLanguage,
                deviceLanguages = DeviceLanguagePreferences.preferredLanguageCodes(),
            )
        }
        val selectedAudioTrack = audioTracks.firstOrNull { track -> track.index == selectedAudioIndex }
            ?: audioTracks.firstOrNull { it.isSelected }
        val selectionPlan = resolveSubtitleAutoSelectionPlan(
            selectedAudioLanguage = resolveAudioTrackLanguageTarget(selectedAudioTrack),
            preferredAudioTargets = preferredAudioTargets,
            preferredSubtitleTargets = preferredSubtitleTargets,
            useForcedSubtitles = subtitleStyle.useForcedSubtitles,
        )
        if (selectionPlan == null) {
            disableAutomaticSubtitleSelection()
            return
        }

        if (selectionPlan.targets.isEmpty()) {
            disableAutomaticSubtitleSelection()
            preferredSubtitleSelectionApplied = true
        } else if (subtitleTracks.isNotEmpty()) {
            val preferredSubtitleIndex = findPreferredSubtitleTrackIndex(
                tracks = subtitleTracks,
                targets = selectionPlan.targets,
                mode = selectionPlan.mode,
            )
            if (preferredSubtitleIndex >= 0 && preferredSubtitleIndex != selectedSubtitleIndex) {
                playerController?.selectSubtitleTrack(preferredSubtitleIndex)
                selectedSubtitleIndex = preferredSubtitleIndex
                selectedAddonSubtitleId = null
                activeAddonSubtitle = null
                pendingRestoredAddonSubtitle = null
                useCustomSubtitles = false
            } else if (preferredSubtitleIndex < 0) {
                val activeSubtitleTrack = subtitleTracks.firstOrNull { track ->
                    track.index == selectedSubtitleIndex
                } ?: subtitleTracks.firstOrNull { it.isSelected }
                if (
                    selectionPlan.mode == SubtitleAutoSelectionMode.FORCED_ONLY ||
                    activeSubtitleTrack?.isForced == true
                ) {
                    disableAutomaticSubtitleSelection()
                }
            }
            preferredSubtitleSelectionApplied = true
        }
    }
}

private fun PlayerScreenRuntime.disableAutomaticSubtitleSelection() {
    if (selectedSubtitleIndex != -1 || subtitleTracks.any { it.isSelected }) {
        playerController?.selectSubtitleTrack(-1)
    }
    selectedSubtitleIndex = -1
    selectedAddonSubtitleId = null
    activeAddonSubtitle = null
    pendingRestoredAddonSubtitle = null
    useCustomSubtitles = false
}

internal fun PlayerScreenRuntime.resolvePendingRestoredAddonSubtitle() {
    val restored = pendingRestoredAddonSubtitle ?: return
    val resolved = resolveRestoredAddonSubtitle(
        subtitles = addonSubtitles,
        subtitleId = restored.subtitleId,
        subtitleUrl = restored.subtitleUrl,
        addonName = restored.addonName,
    ) ?: return
    activeAddonSubtitle = resolved
    selectedAddonSubtitleId = resolved.id
    pendingRestoredAddonSubtitle = null
}
