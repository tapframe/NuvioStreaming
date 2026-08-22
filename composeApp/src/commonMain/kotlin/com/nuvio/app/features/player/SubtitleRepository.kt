package com.nuvio.app.features.player

import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.AddonResource
import com.nuvio.app.features.addons.buildAddonResourceUrl
import com.nuvio.app.features.addons.enabledAddons
import com.nuvio.app.features.addons.fetchAddonResponseText
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_player_no_subtitles_found
import nuvio.composeapp.generated.resources.player_addon_subtitle_display_format
import org.jetbrains.compose.resources.getString

object SubtitleRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val json = Json { ignoreUnknownKeys = true }

    private val _addonSubtitles = MutableStateFlow<List<AddonSubtitle>>(emptyList())
    val addonSubtitles: StateFlow<List<AddonSubtitle>> = _addonSubtitles.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var activeFetchJob: Job? = null

    fun fetchAddonSubtitles(type: String, videoId: String) {
        activeFetchJob?.cancel()
        activeFetchJob = scope.launch {
            val requestType = canonicalSubtitleType(type)
            _isLoading.value = true
            _error.value = null

            val addons = AddonRepository.uiState.value.addons.enabledAddons()
            val allSubs = mutableListOf<AddonSubtitle>()

            for (addon in addons) {
                val manifest = addon.manifest ?: continue
                val subtitleResource = manifest.resources.find { it.name.isSubtitleResourceName() } ?: continue
                if (!subtitleResource.supportsSubtitleType(requestType, videoId)) continue

                val subtitleUrl = buildAddonResourceUrl(
                    manifestUrl = manifest.transportUrl,
                    resource = "subtitles",
                    type = requestType,
                    id = videoId,
                )

                try {
                    val response = withContext(Dispatchers.Default) {
                        fetchAddonResponseText(subtitleUrl)
                    }
                    val parsed = json.parseToJsonElement(response).jsonObject
                    val subtitlesArray = parsed["subtitles"]?.jsonArray ?: continue

                    for (element in subtitlesArray) {
                        val payload = parseAddonSubtitlePayload(element.jsonObject) ?: continue
                        val rawLang = payload.language
                        val normalizedLang = normalizeLanguageCode(rawLang) ?: rawLang

                        allSubs.add(
                            AddonSubtitle(
                                id = payload.id,
                                url = payload.url,
                                language = normalizedLang,
                                display = getString(
                                    Res.string.player_addon_subtitle_display_format,
                                    getLanguageLabelForCode(rawLang),
                                    addon.displayTitle,
                                ),
                                addonName = addon.displayTitle,
                                providerOrigin = addon.manifestUrl,
                                providerSubtitleId = payload.providerSubtitleId,
                                providerFileName = payload.fileName,
                                providerFormat = payload.format,
                            )
                        )
                    }
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                }
            }

            _addonSubtitles.value = allSubs
            if (allSubs.isEmpty() && addons.any { it.manifest?.resources?.any { r -> r.name.isSubtitleResourceName() } == true }) {
                _error.value = getString(Res.string.compose_player_no_subtitles_found)
            }
            _isLoading.value = false
        }
    }

    fun clear() {
        activeFetchJob?.cancel()
        _addonSubtitles.value = emptyList()
        _isLoading.value = false
        _error.value = null
    }
}

internal data class AddonSubtitlePayload(
    val id: String,
    val providerSubtitleId: String?,
    val url: String,
    val language: String,
    val fileName: String?,
    val format: String?,
)

internal fun parseAddonSubtitlePayload(value: JsonObject): AddonSubtitlePayload? {
    val providerSubtitleId = value.stringValue("id")
    val fileName = value.firstStringValue("fileName", "filename", "name")
    return AddonSubtitlePayload(
        id = providerSubtitleId ?: fileName ?: MissingProviderSubtitleId,
        providerSubtitleId = providerSubtitleId,
        url = value.payloadValue("url") ?: return null,
        language = value.subtitleLanguage() ?: "unknown",
        fileName = fileName,
        format = value.firstStringValue("format", "type"),
    )
}

private fun canonicalSubtitleType(type: String): String =
    if (type.equals("tv", ignoreCase = true)) "series" else type.lowercase()

private fun String.isSubtitleResourceName(): Boolean =
    equals("subtitles", ignoreCase = true) || equals("subtitle", ignoreCase = true)

private fun AddonResource.supportsSubtitleType(type: String, videoId: String): Boolean {
    val canonical = canonicalSubtitleType(type)
    val typeMatches = types.isEmpty() || types.any { canonicalSubtitleType(it).equals(canonical, ignoreCase = true) }
    if (!typeMatches) return false
    return idPrefixes.isEmpty() || idPrefixes.any { prefix -> videoId.startsWith(prefix) }
}

private fun JsonObject.subtitleLanguage(): String? =
    stringValue("lang")
        ?: stringValue("language")
        ?: stringValue("languageCode")
        ?: stringValue("locale")
        ?: stringValue("label")

private fun JsonObject.stringValue(name: String): String? =
    this[name]
        ?.jsonPrimitive
        ?.contentOrNull
        ?.trim()
        ?.takeIf { it.isNotBlank() }

private fun JsonObject.firstStringValue(vararg names: String): String? =
    names.firstNotNullOfOrNull(::stringValue)

private fun JsonObject.payloadValue(name: String): String? =
    this[name]
        ?.jsonPrimitive
        ?.contentOrNull
        ?.takeIf { it.isNotBlank() }

private const val MissingProviderSubtitleId = "subtitle"
