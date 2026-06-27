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
        selectedAddonSubtitleId = selectedAddonSubtitleId,
    )

internal val PlayerScreenRuntime.selectedAddonSubtitle: AddonSubtitle?
    get() = addonSubtitles.firstOrNull { subtitle ->
        subtitle.id == selectedAddonSubtitleId || subtitle.url == selectedAddonSubtitleId
    }

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
                    useCustomSubtitles = false
                    preferredSubtitleSelectionApplied = true
                }
            }
        }
        PersistedSubtitleSelectionType.ADDON -> {
            val url = preference.addonSubtitleUrl?.takeIf { it.isNotBlank() }
            if (url != null) {
                selectedAddonSubtitleId = preference.addonSubtitleId ?: url
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

    if (!preferredAudioSelectionApplied) {
        val preferredAudioTargets = resolvePreferredAudioLanguageTargets(
            preferredAudioLanguage = playerSettingsUiState.preferredAudioLanguage,
            secondaryPreferredAudioLanguage = playerSettingsUiState.secondaryPreferredAudioLanguage,
            deviceLanguages = DeviceLanguagePreferences.preferredLanguageCodes(),
            contentOriginalLanguage = resolveContentLanguage(
                language = metaUiState.meta?.language,
                country = metaUiState.meta?.country,
            ) ?: args.contentLanguage,
        )
        if (preferredAudioTargets.isEmpty()) {
            preferredAudioSelectionApplied = true
        } else if (audioTracks.isNotEmpty()) {
            val preferredAudioIndex = findPreferredTrackIndex(
                tracks = audioTracks,
                targets = preferredAudioTargets,
                language = { track -> track.language },
            )
            if (preferredAudioIndex >= 0 && preferredAudioIndex != selectedAudioIndex) {
                playerController?.selectAudioTrack(preferredAudioIndex)
                selectedAudioIndex = preferredAudioIndex
            }
            preferredAudioSelectionApplied = true
        }
    }

    if (!preferredSubtitleSelectionApplied) {
        val preferredSubtitleTargets = resolvePreferredSubtitleLanguageTargets(
            preferredSubtitleLanguage = if (subtitleStyle.useForcedSubtitles) {
                SubtitleLanguageOption.FORCED
            } else {
                playerSettingsUiState.preferredSubtitleLanguage
            },
            secondaryPreferredSubtitleLanguage = playerSettingsUiState.secondaryPreferredSubtitleLanguage,
            deviceLanguages = DeviceLanguagePreferences.preferredLanguageCodes(),
        )

        if (preferredSubtitleTargets.isEmpty()) {
            if (selectedSubtitleIndex != -1 || subtitleTracks.any { it.isSelected }) {
                playerController?.selectSubtitleTrack(-1)
            }
            selectedSubtitleIndex = -1
            selectedAddonSubtitleId = null
            useCustomSubtitles = false
            preferredSubtitleSelectionApplied = true
        } else if (subtitleTracks.isNotEmpty()) {
            val preferredSubtitleIndex = findPreferredSubtitleTrackIndex(
                tracks = subtitleTracks,
                targets = preferredSubtitleTargets,
            )
            if (preferredSubtitleIndex >= 0 && preferredSubtitleIndex != selectedSubtitleIndex) {
                playerController?.selectSubtitleTrack(preferredSubtitleIndex)
                selectedSubtitleIndex = preferredSubtitleIndex
                selectedAddonSubtitleId = null
                useCustomSubtitles = false
            } else if (
                preferredSubtitleIndex < 0 &&
                (subtitleStyle.useForcedSubtitles ||
                    normalizeLanguageCode(playerSettingsUiState.preferredSubtitleLanguage) ==
                    SubtitleLanguageOption.FORCED)
            ) {
                if (selectedSubtitleIndex != -1 || subtitleTracks.any { it.isSelected }) {
                    playerController?.selectSubtitleTrack(-1)
                }
                selectedSubtitleIndex = -1
                selectedAddonSubtitleId = null
                useCustomSubtitles = false
            }
            preferredSubtitleSelectionApplied = true
        }
    }
}
