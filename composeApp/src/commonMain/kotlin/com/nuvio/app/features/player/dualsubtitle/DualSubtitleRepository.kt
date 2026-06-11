package com.nuvio.app.features.player.dualsubtitle

import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.player.AddonSubtitle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Repository managing the dual subtitle feature state.
 *
 * Design:
 * - The primary subtitle is rendered by the native player (ExoPlayer/MPV) as usual.
 * - The secondary subtitle is fetched, parsed, and rendered as a Compose overlay.
 * - This separation ensures zero interference with the existing subtitle pipeline.
 */
object DualSubtitleRepository {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val _state = MutableStateFlow(DualSubtitleState())
    val state: StateFlow<DualSubtitleState> = _state.asStateFlow()

    private val _secondaryStyle = MutableStateFlow(SecondarySubtitleStyle())
    val secondaryStyle: StateFlow<SecondarySubtitleStyle> = _secondaryStyle.asStateFlow()

    private var secondaryCues: List<SubtitleCue> = emptyList()
    private var fetchJob: Job? = null

    /**
     * Enables dual subtitle mode with the specified secondary subtitle.
     */
    fun enableDualSubtitle(secondary: AddonSubtitle) {
        _state.value = _state.value.copy(
            enabled = true,
            secondarySubtitle = secondary,
            secondaryCueText = "",
        )
        loadSecondarySubtitle(secondary.url)
    }

    /**
     * Disables dual subtitle mode.
     */
    fun disable() {
        fetchJob?.cancel()
        secondaryCues = emptyList()
        _state.value = DualSubtitleState()
    }

    /**
     * Updates the secondary subtitle text based on current playback position.
     * Called from the player runtime effects on each position update.
     */
    fun updatePosition(positionMs: Long) {
        if (!_state.value.enabled || secondaryCues.isEmpty()) return

        val cue = SubtitleParser.findCueAtPosition(secondaryCues, positionMs)
        val newText = cue?.text ?: ""

        if (newText != _state.value.secondaryCueText) {
            _state.value = _state.value.copy(secondaryCueText = newText)
        }
    }

    /**
     * Updates the secondary subtitle style.
     */
    fun updateStyle(style: SecondarySubtitleStyle) {
        _secondaryStyle.value = style
    }

    /**
     * Checks if the dual subtitle feature is currently active.
     */
    val isActive: Boolean get() = _state.value.enabled && secondaryCues.isNotEmpty()

    // --- Private ---

    private fun loadSecondarySubtitle(url: String) {
        fetchJob?.cancel()
        fetchJob = scope.launch {
            try {
                val content = withContext(Dispatchers.Default) {
                    httpGetText(url)
                }
                secondaryCues = SubtitleParser.parse(content)
            } catch (_: Exception) {
                secondaryCues = emptyList()
                _state.value = _state.value.copy(enabled = false)
            }
        }
    }
}
