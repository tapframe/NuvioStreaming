package com.nuvio.app.features.trakt

import com.nuvio.app.features.library.LibrarySourceMode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

const val TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL = 0
const val TRAKT_DEFAULT_CONTINUE_WATCHING_DAYS_CAP = 60
const val TRAKT_MIN_CONTINUE_WATCHING_DAYS_CAP = 7
const val TRAKT_MAX_CONTINUE_WATCHING_DAYS_CAP = 365

val TraktContinueWatchingDaysOptions: List<Int> = listOf(
    14,
    30,
    TRAKT_DEFAULT_CONTINUE_WATCHING_DAYS_CAP,
    90,
    180,
    TRAKT_MAX_CONTINUE_WATCHING_DAYS_CAP,
    TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL,
)

@Serializable
enum class WatchProgressSource {
    TRAKT,
    NUVIO_SYNC;

    companion object {
        fun fromStorage(value: String?): WatchProgressSource =
            entries.firstOrNull { it.name == value } ?: DEFAULT_WATCH_PROGRESS_SOURCE
    }
}

val DEFAULT_WATCH_PROGRESS_SOURCE: WatchProgressSource = WatchProgressSource.TRAKT
val DEFAULT_LIBRARY_SOURCE_MODE: LibrarySourceMode = LibrarySourceMode.TRAKT

fun librarySourceModeFromStorage(value: String?): LibrarySourceMode =
    LibrarySourceMode.entries.firstOrNull { it.name == value } ?: DEFAULT_LIBRARY_SOURCE_MODE

data class TraktSettingsUiState(
    val watchProgressSource: WatchProgressSource = DEFAULT_WATCH_PROGRESS_SOURCE,
    val continueWatchingDaysCap: Int = TRAKT_DEFAULT_CONTINUE_WATCHING_DAYS_CAP,
    val librarySourceMode: LibrarySourceMode = DEFAULT_LIBRARY_SOURCE_MODE,
)

@Serializable
private data class StoredTraktSettings(
    val watchProgressSource: String? = null,
    val continueWatchingDaysCap: Int = TRAKT_DEFAULT_CONTINUE_WATCHING_DAYS_CAP,
    val librarySourceMode: String? = null,
)

object TraktSettingsRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    private val _uiState = MutableStateFlow(TraktSettingsUiState())
    val uiState: StateFlow<TraktSettingsUiState> = _uiState.asStateFlow()

    private var hasLoaded = false

    fun ensureLoaded() {
        if (hasLoaded) return
        loadFromDisk()
    }

    fun onProfileChanged() {
        loadFromDisk()
    }

    fun clearLocalState() {
        hasLoaded = false
        _uiState.value = TraktSettingsUiState()
    }

    fun setWatchProgressSource(source: WatchProgressSource) {
        ensureLoaded()
        if (_uiState.value.watchProgressSource == source) return
        _uiState.value = _uiState.value.copy(watchProgressSource = source)
        persist()
    }

    fun setContinueWatchingDaysCap(days: Int) {
        ensureLoaded()
        val normalized = normalizeTraktContinueWatchingDaysCap(days)
        if (_uiState.value.continueWatchingDaysCap == normalized) return
        _uiState.value = _uiState.value.copy(continueWatchingDaysCap = normalized)
        persist()
    }

    fun setLibrarySourceMode(mode: LibrarySourceMode) {
        ensureLoaded()
        if (_uiState.value.librarySourceMode == mode) return
        _uiState.value = _uiState.value.copy(librarySourceMode = mode)
        persist()
    }

    private fun loadFromDisk() {
        hasLoaded = true

        val payload = TraktSettingsStorage.loadPayload().orEmpty().trim()
        if (payload.isEmpty()) {
            _uiState.value = TraktSettingsUiState()
            return
        }

        val stored = runCatching {
            json.decodeFromString<StoredTraktSettings>(payload)
        }.getOrNull()

        _uiState.value = if (stored != null) {
            TraktSettingsUiState(
                watchProgressSource = WatchProgressSource.fromStorage(stored.watchProgressSource),
                continueWatchingDaysCap = normalizeTraktContinueWatchingDaysCap(stored.continueWatchingDaysCap),
                librarySourceMode = librarySourceModeFromStorage(stored.librarySourceMode),
            )
        } else {
            TraktSettingsUiState()
        }
    }

    private fun persist() {
        TraktSettingsStorage.savePayload(
            json.encodeToString(
                StoredTraktSettings(
                    watchProgressSource = _uiState.value.watchProgressSource.name,
                    continueWatchingDaysCap = _uiState.value.continueWatchingDaysCap,
                    librarySourceMode = _uiState.value.librarySourceMode.name,
                ),
            ),
        )
    }
}

fun normalizeTraktContinueWatchingDaysCap(days: Int): Int =
    if (days == TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL) {
        TRAKT_CONTINUE_WATCHING_DAYS_CAP_ALL
    } else {
        days.coerceIn(TRAKT_MIN_CONTINUE_WATCHING_DAYS_CAP, TRAKT_MAX_CONTINUE_WATCHING_DAYS_CAP)
    }

fun shouldUseTraktProgress(
    isAuthenticated: Boolean,
    source: WatchProgressSource,
): Boolean = isAuthenticated && source == WatchProgressSource.TRAKT

fun effectiveLibrarySourceMode(
    isAuthenticated: Boolean,
    source: LibrarySourceMode,
): LibrarySourceMode =
    if (isAuthenticated && source == LibrarySourceMode.TRAKT) {
        LibrarySourceMode.TRAKT
    } else {
        LibrarySourceMode.LOCAL
    }

fun shouldUseTraktLibrary(
    isAuthenticated: Boolean,
    source: LibrarySourceMode,
): Boolean = effectiveLibrarySourceMode(isAuthenticated, source) == LibrarySourceMode.TRAKT
