package com.nuvio.app.features.debrid

import co.touchlab.kermit.Logger
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.streams.AddonStreamGroup
import com.nuvio.app.features.streams.StreamParser
import kotlinx.coroutines.CancellationException

private const val DIRECT_DEBRID_TAG = "DirectDebridStreams"

data class DirectDebridStreamTarget(
    val provider: DebridProvider,
    val apiKey: String,
) {
    val addonId: String = DebridProviders.addonId(provider.id)
    val addonName: String = DebridProviders.instantName(provider.id)
}

object DirectDebridStreamSource {
    private val log = Logger.withTag(DIRECT_DEBRID_TAG)
    private val encoder = DirectDebridConfigEncoder()
    private val formatter = DebridStreamFormatter()

    fun configuredTargets(): List<DirectDebridStreamTarget> {
        DebridSettingsRepository.ensureLoaded()
        val settings = DebridSettingsRepository.snapshot()
        if (!settings.enabled || DebridConfig.DIRECT_DEBRID_API_BASE_URL.isBlank()) return emptyList()
        return DebridProviders.configuredServices(settings).map { credential ->
            DirectDebridStreamTarget(
                provider = credential.provider,
                apiKey = credential.apiKey,
            )
        }
    }

    fun placeholders(): List<AddonStreamGroup> =
        configuredTargets().map { target ->
            AddonStreamGroup(
                addonName = target.addonName,
                addonId = target.addonId,
                streams = emptyList(),
                isLoading = true,
            )
        }

    suspend fun fetchProviderStreams(
        type: String,
        videoId: String,
        target: DirectDebridStreamTarget,
    ): AddonStreamGroup {
        val settings = DebridSettingsRepository.snapshot()
        val baseUrl = DebridConfig.DIRECT_DEBRID_API_BASE_URL.trim().trimEnd('/')
        if (!settings.enabled || baseUrl.isBlank()) {
            return target.emptyGroup()
        }

        val credential = DebridServiceCredential(target.provider, target.apiKey)
        val url = "$baseUrl/${encoder.encode(credential)}/client-stream/${encodePathSegment(type)}/${encodePathSegment(videoId)}.json"
        return try {
            val payload = httpGetText(url)
            val streams = StreamParser.parse(
                payload = payload,
                addonName = DirectDebridStreamFilter.FALLBACK_SOURCE_NAME,
                addonId = target.addonId,
            )
                .let(DirectDebridStreamFilter::filterInstant)
                .filter { stream -> stream.clientResolve?.service.equals(target.provider.id, ignoreCase = true) }
                .map { stream -> formatter.format(stream.copy(addonId = target.addonId), settings) }

            AddonStreamGroup(
                addonName = target.addonName,
                addonId = target.addonId,
                streams = streams,
                isLoading = false,
            )
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            log.w(error) { "Direct debrid ${target.provider.id} stream fetch failed" }
            AddonStreamGroup(
                addonName = target.addonName,
                addonId = target.addonId,
                streams = emptyList(),
                isLoading = false,
                error = error.message,
            )
        }
    }

    private fun DirectDebridStreamTarget.emptyGroup(): AddonStreamGroup =
        AddonStreamGroup(
            addonName = addonName,
            addonId = addonId,
            streams = emptyList(),
            isLoading = false,
        )
}
