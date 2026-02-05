package com.nuvio.tv.data.repository

import android.util.Log
import com.nuvio.tv.core.network.NetworkResult
import com.nuvio.tv.core.network.safeApiCall
import com.nuvio.tv.data.local.AddonPreferences
import com.nuvio.tv.data.remote.api.AddonApi
import com.nuvio.tv.domain.model.Addon
import com.nuvio.tv.domain.model.Subtitle
import com.nuvio.tv.domain.repository.SubtitleRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import javax.inject.Inject

class SubtitleRepositoryImpl @Inject constructor(
    private val api: AddonApi,
    private val addonRepository: AddonRepositoryImpl
) : SubtitleRepository {

    companion object {
        private const val TAG = "SubtitleRepository"
    }

    override suspend fun getSubtitles(
        type: String,
        id: String,
        videoId: String?,
        videoHash: String?,
        videoSize: Long?,
        filename: String?
    ): List<Subtitle> = withContext(Dispatchers.IO) {
        Log.d(TAG, "Fetching subtitles for type=$type, id=$id, videoId=$videoId")
        
        // Get installed addons
        val addons = try {
            addonRepository.getInstalledAddons().first()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get installed addons", e)
            return@withContext emptyList()
        }
        
        // Filter addons that support subtitles resource
        val subtitleAddons = addons.filter { addon ->
            addon.resources.any { resource ->
                resource.name == "subtitles" && supportsType(resource, type, id)
            }
        }
        
        Log.d(TAG, "Found ${subtitleAddons.size} subtitle addons: ${subtitleAddons.map { it.name }}")
        
        if (subtitleAddons.isEmpty()) {
            return@withContext emptyList()
        }
        
        // Fetch subtitles from all addons in parallel
        coroutineScope {
            subtitleAddons.map { addon ->
                async {
                    fetchSubtitlesFromAddon(addon, type, id, videoId, videoHash, videoSize, filename)
                }
            }.awaitAll().flatten()
        }
    }
    
    private fun supportsType(resource: com.nuvio.tv.domain.model.AddonResource, type: String, id: String): Boolean {
        // Check if type is supported
        if (resource.types.isNotEmpty() && !resource.types.contains(type)) {
            return false
        }
        
        // Check if id prefix is supported
        val idPrefixes = resource.idPrefixes
        if (idPrefixes != null && idPrefixes.isNotEmpty()) {
            return idPrefixes.any { prefix -> id.startsWith(prefix) }
        }
        
        return true
    }
    
    private suspend fun fetchSubtitlesFromAddon(
        addon: Addon,
        type: String,
        id: String,
        videoId: String?,
        videoHash: String?,
        videoSize: Long?,
        filename: String?
    ): List<Subtitle> {
        val actualId = if (type == "series" && videoId != null) {
            // For series, use videoId which includes season/episode
            videoId
        } else {
            id
        }
        
        // Build the subtitle URL with optional extra parameters
        val baseUrl = addon.baseUrl.trimEnd('/')
        val extraParams = buildExtraParams(videoHash, videoSize, filename)
        val subtitleUrl = if (extraParams.isNotEmpty()) {
            "$baseUrl/subtitles/$type/$actualId/$extraParams.json"
        } else {
            "$baseUrl/subtitles/$type/$actualId.json"
        }
        
        Log.d(TAG, "Fetching subtitles from ${addon.name}: $subtitleUrl")
        
        return try {
            when (val result = safeApiCall { api.getSubtitles(subtitleUrl) }) {
                is NetworkResult.Success -> {
                    val subtitles = result.data.subtitles?.mapNotNull { dto ->
                        Subtitle(
                            id = dto.id ?: "${dto.lang}-${dto.url.hashCode()}",
                            url = dto.url,
                            lang = dto.lang,
                            addonName = addon.name,
                            addonLogo = addon.logo
                        )
                    } ?: emptyList()
                    
                    Log.d(TAG, "Got ${subtitles.size} subtitles from ${addon.name}")
                    subtitles
                }
                is NetworkResult.Error -> {
                    Log.e(TAG, "Failed to fetch subtitles from ${addon.name}: ${result.message}")
                    emptyList()
                }
                NetworkResult.Loading -> emptyList()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception fetching subtitles from ${addon.name}", e)
            emptyList()
        }
    }
    
    private fun buildExtraParams(
        videoHash: String?,
        videoSize: Long?,
        filename: String?
    ): String {
        val params = mutableListOf<String>()
        
        videoHash?.let { params.add("videoHash=$it") }
        videoSize?.let { params.add("videoSize=$it") }
        filename?.let { params.add("filename=$it") }
        
        return if (params.isNotEmpty()) {
            params.joinToString("&")
        } else {
            ""
        }
    }
}
