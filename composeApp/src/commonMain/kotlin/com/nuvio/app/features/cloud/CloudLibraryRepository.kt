package com.nuvio.app.features.cloud

import com.nuvio.app.features.debrid.DebridProviderCapability
import com.nuvio.app.features.debrid.DebridProviders
import com.nuvio.app.features.debrid.DebridServiceCredential
import com.nuvio.app.features.debrid.DebridSettingsRepository
import com.nuvio.app.features.debrid.supports
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.cloud_library_playback_disabled
import nuvio.composeapp.generated.resources.cloud_library_provider_unavailable
import org.jetbrains.compose.resources.getString

internal class CloudLibraryStore(
    private val credentialsProvider: suspend () -> List<DebridServiceCredential>,
    private val providerApis: List<CloudLibraryProviderApi>,
) {
    suspend fun refresh(): CloudLibraryUiState {
        val credentials = credentialsProvider()
            .filter { credential -> credential.provider.supports(DebridProviderCapability.CloudLibrary) }

        val providerStates = credentials.map { credential ->
            val api = providerApis.firstOrNull { it.provider.id == credential.provider.id }
            if (api == null) {
                return@map CloudLibraryProviderState(
                    provider = credential.provider,
                    errorMessage = getString(
                        Res.string.cloud_library_provider_unavailable,
                        credential.provider.displayName,
                    ),
                )
            }

            api.listItems(credential.apiKey)
                .fold(
                    onSuccess = { items ->
                        CloudLibraryProviderState(
                            provider = credential.provider,
                            items = items,
                        )
                    },
                    onFailure = { error ->
                        CloudLibraryProviderState(
                            provider = credential.provider,
                            errorMessage = error.message,
                        )
                    },
                )
        }

        return CloudLibraryUiState(
            isLoaded = true,
            isRefreshing = false,
            providers = providerStates,
        )
    }

    suspend fun resolvePlayback(
        item: CloudLibraryItem,
        file: CloudLibraryFile,
    ): CloudLibraryPlaybackResult {
        if (!file.playable) return CloudLibraryPlaybackResult.NotPlayable
        val credential = credentialsProvider()
            .firstOrNull { credential -> credential.provider.id == item.providerId }
            ?: return CloudLibraryPlaybackResult.MissingCredentials
        val api = providerApis.firstOrNull { it.provider.id == item.providerId }
            ?: return CloudLibraryPlaybackResult.Failed()
        file.playbackUrl?.takeIf { it.isNotBlank() }?.let { url ->
            return CloudLibraryPlaybackResult.Success(
                url = url,
                filename = file.name.takeIf { it.isNotBlank() },
                videoSizeBytes = file.sizeBytes,
            )
        }
        return api.resolvePlayback(
            apiKey = credential.apiKey,
            item = item,
            file = file,
        )
    }
}

object CloudLibraryRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val store = CloudLibraryStore(
        credentialsProvider = {
            DebridSettingsRepository.ensureLoaded()
            DebridProviders.configuredServices(DebridSettingsRepository.snapshot())
        },
        providerApis = CloudLibraryProviderApis.all(),
    )
    private val _uiState = MutableStateFlow(CloudLibraryUiState())
    private var loadedConnectionKeys: List<CloudConnectionKey> = emptyList()
    val uiState = _uiState.asStateFlow()

    fun ensureLoaded() {
        DebridSettingsRepository.ensureLoaded()
        if (!DebridSettingsRepository.snapshot().cloudLibraryEnabled) {
            loadedConnectionKeys = emptyList()
            _uiState.value = CloudLibraryUiState(isLoaded = true, isEnabled = false)
            return
        }
        val current = _uiState.value
        if (current.isRefreshing) return
        val connectedKeys = connectedCloudConnectionKeys()
        if (!current.isLoaded || connectedKeys != loadedConnectionKeys) {
            refresh()
        }
    }

    fun refresh() {
        DebridSettingsRepository.ensureLoaded()
        if (!DebridSettingsRepository.snapshot().cloudLibraryEnabled) {
            loadedConnectionKeys = emptyList()
            _uiState.value = CloudLibraryUiState(isLoaded = true, isEnabled = false)
            return
        }
        _uiState.update { current ->
            current.copy(
                isEnabled = true,
                isRefreshing = true,
                providers = current.providers.map { it.copy(isLoading = true, errorMessage = null) },
            )
        }
        scope.launch {
            val refreshed = store.refresh()
            loadedConnectionKeys = connectedCloudConnectionKeys()
            _uiState.value = refreshed
        }
    }

    suspend fun findPlaybackTargetForProgress(
        contentId: String,
        videoId: String,
    ): CloudLibraryPlaybackTarget? =
        when (val result = findPlaybackTargetForProgressResult(contentId = contentId, videoId = videoId)) {
            is CloudLibraryPlaybackTargetLookupResult.Found -> result.target
            CloudLibraryPlaybackTargetLookupResult.Disabled,
            is CloudLibraryPlaybackTargetLookupResult.NotConnected,
            CloudLibraryPlaybackTargetLookupResult.NotFound,
            -> null
        }

    suspend fun findPlaybackTargetForProgressResult(
        contentId: String,
        videoId: String,
    ): CloudLibraryPlaybackTargetLookupResult {
        DebridSettingsRepository.ensureLoaded()
        if (!DebridSettingsRepository.snapshot().cloudLibraryEnabled) {
            loadedConnectionKeys = emptyList()
            _uiState.value = CloudLibraryUiState(isLoaded = true, isEnabled = false)
            return CloudLibraryPlaybackTargetLookupResult.Disabled
        }

        val providerId = cloudLibraryProviderId(contentId)
            .ifBlank { cloudLibraryProviderId(videoId) }
        val connectedCredentials = connectedCloudCredentials()
        if (connectedCredentials.isEmpty()) {
            return CloudLibraryPlaybackTargetLookupResult.NotConnected(
                providerName = providerId.takeIf { it.isNotBlank() }?.let(DebridProviders::displayName),
            )
        }
        if (
            providerId.isNotBlank() &&
            connectedCredentials.none { credential -> credential.provider.id.equals(providerId, ignoreCase = true) }
        ) {
            return CloudLibraryPlaybackTargetLookupResult.NotConnected(
                providerName = DebridProviders.displayName(providerId),
            )
        }

        _uiState.value.findPlaybackTargetForProgress(
            contentId = contentId,
            videoId = videoId,
        )?.let { target -> return CloudLibraryPlaybackTargetLookupResult.Found(target) }

        val refreshed = refreshNow()
        val refreshedTarget = refreshed.findPlaybackTargetForProgress(
            contentId = contentId,
            videoId = videoId,
        )
        return if (refreshedTarget != null) {
            CloudLibraryPlaybackTargetLookupResult.Found(refreshedTarget)
        } else {
            CloudLibraryPlaybackTargetLookupResult.NotFound
        }
    }

    suspend fun resolvePlayback(
        item: CloudLibraryItem,
        file: CloudLibraryFile,
    ): CloudLibraryPlaybackResult {
        DebridSettingsRepository.ensureLoaded()
        if (!DebridSettingsRepository.snapshot().cloudLibraryEnabled) {
            return CloudLibraryPlaybackResult.Failed(getString(Res.string.cloud_library_playback_disabled))
        }
        val result = store.resolvePlayback(item, file)
        if (result is CloudLibraryPlaybackResult.Success) {
            rememberResolvedPlaybackUrl(item = item, file = file, url = result.url)
        }
        return result
    }

    private fun rememberResolvedPlaybackUrl(
        item: CloudLibraryItem,
        file: CloudLibraryFile,
        url: String,
    ) {
        if (url.isBlank()) return
        _uiState.update { current ->
            current.withResolvedPlaybackUrl(
                item = item,
                file = file,
                url = url,
            )
        }
    }

    private fun connectedCloudCredentials(): List<DebridServiceCredential> =
        DebridSettingsRepository.snapshot()
            .takeIf { settings -> settings.cloudLibraryEnabled }
            ?.let(DebridProviders::configuredServices)
            .orEmpty()
            .filter { credential -> credential.provider.supports(DebridProviderCapability.CloudLibrary) }

    private fun connectedCloudConnectionKeys(): List<CloudConnectionKey> =
        connectedCloudCredentials().map { credential ->
            CloudConnectionKey(
                providerId = credential.provider.id,
                apiKeyHash = credential.apiKey.hashCode(),
            )
        }.sortedBy { it.providerId }

    private suspend fun refreshNow(): CloudLibraryUiState {
        _uiState.update { current ->
            current.copy(
                isEnabled = true,
                isRefreshing = true,
                providers = current.providers.map { it.copy(isLoading = true, errorMessage = null) },
            )
        }
        val refreshed = store.refresh()
        loadedConnectionKeys = connectedCloudConnectionKeys()
        _uiState.value = refreshed
        return refreshed
    }

    private data class CloudConnectionKey(
        val providerId: String,
        val apiKeyHash: Int,
    )
}

internal fun CloudLibraryUiState.findPlaybackTargetForProgress(
    contentId: String,
    videoId: String,
): CloudLibraryPlaybackTarget? {
    val normalizedContentId = contentId.trim()
    val normalizedVideoId = videoId.trim()
    if (normalizedContentId.isBlank()) return null

    val matchingItems = items.filter { item -> item.stableKey == normalizedContentId }
    if (matchingItems.isEmpty()) return null

    for (item in matchingItems) {
        val exactFile = item.playableFiles.firstOrNull { file ->
            item.playbackVideoId(file) == normalizedVideoId
        }
        if (exactFile != null) {
            return CloudLibraryPlaybackTarget(item = item, file = exactFile)
        }
    }

    val singleItem = matchingItems.singleOrNull() ?: return null
    val singleFile = singleItem.playableFiles.singleOrNull() ?: return null
    return CloudLibraryPlaybackTarget(item = singleItem, file = singleFile)
}

internal fun CloudLibraryUiState.withResolvedPlaybackUrl(
    item: CloudLibraryItem,
    file: CloudLibraryFile,
    url: String,
): CloudLibraryUiState {
    val normalizedUrl = url.trim().takeIf { it.isNotBlank() } ?: return this
    val targetItemKey = item.stableKey
    val targetFileKey = file.stableKey
    var didUpdate = false
    val updatedProviders = providers.map { providerState ->
        if (providerState.providerId != item.providerId) return@map providerState
        val updatedItems = providerState.items.map { candidateItem ->
            if (candidateItem.stableKey != targetItemKey) return@map candidateItem
            val updatedFiles = candidateItem.files.map { candidateFile ->
                if (candidateFile.stableKey != targetFileKey) {
                    candidateFile
                } else {
                    didUpdate = true
                    candidateFile.copy(playbackUrl = normalizedUrl)
                }
            }
            candidateItem.copy(files = updatedFiles)
        }
        providerState.copy(items = updatedItems)
    }
    return if (didUpdate) {
        copy(providers = updatedProviders)
    } else {
        this
    }
}
