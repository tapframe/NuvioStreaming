package com.nuvio.app.features.player

import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.buildAddonResourceUrl
import com.nuvio.app.features.addons.httpGetText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_player_no_subtitles_found
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

    fun fetchAddonSubtitles(type: String, videoId: String) {
        scope.launch {
            _isLoading.value = true
            _error.value = null
            _addonSubtitles.value = emptyList()

            val addons = AddonRepository.uiState.value.addons
            val allSubs = mutableListOf<AddonSubtitle>()

            for (addon in addons) {
                val manifest = addon.manifest ?: continue
                val subtitleResource = manifest.resources.find { it.name == "subtitles" } ?: continue
                if (!subtitleResource.types.contains(type)) continue

                val prefixMatch = subtitleResource.idPrefixes.isEmpty() ||
                    subtitleResource.idPrefixes.any { videoId.startsWith(it) }
                if (!prefixMatch) continue

                val subtitleUrl = buildAddonResourceUrl(
                    manifestUrl = manifest.transportUrl,
                    resource = "subtitles",
                    type = type,
                    id = videoId,
                )

                try {
                    val response = withContext(Dispatchers.Default) {
                        httpGetText(subtitleUrl)
                    }
                    val parsed = json.parseToJsonElement(response).jsonObject
                    val subtitlesArray = parsed["subtitles"]?.jsonArray ?: continue

                    for (element in subtitlesArray) {
                        val obj = element.jsonObject
                        val id = obj["id"]?.jsonPrimitive?.content
                            ?: "${manifest.id}_${allSubs.size}"
                        val url = obj["url"]?.jsonPrimitive?.content ?: continue
                        val lang = obj["lang"]?.jsonPrimitive?.content ?: "unknown"

                        allSubs.add(
                            AddonSubtitle(
                                id = id,
                                url = url,
                                language = lang,
                                display = "${getLanguageLabelForCode(lang)} (${addon.displayTitle})",
                            )
                        )
                    }
                } catch (_: Throwable) {
                }
            }

            _addonSubtitles.value = allSubs
            if (allSubs.isEmpty() && addons.any { it.manifest?.resources?.any { r -> r.name == "subtitles" } == true }) {
                _error.value = getString(Res.string.compose_player_no_subtitles_found)
            }
            _isLoading.value = false
        }
    }

    fun clear() {
        _addonSubtitles.value = emptyList()
        _isLoading.value = false
        _error.value = null
    }
}
