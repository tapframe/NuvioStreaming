package com.nuvio.app.features.tracking

import kotlinx.coroutines.flow.StateFlow
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized

enum class TrackingProviderId(
    val storageId: String,
) {
    TRAKT("trakt"),
    SIMKL("simkl");

    companion object {
        fun fromStorage(value: String?): TrackingProviderId? =
            entries.firstOrNull { provider ->
                provider.storageId.equals(value?.trim(), ignoreCase = true) ||
                    provider.name.equals(value?.trim(), ignoreCase = true)
            }
    }
}

enum class TrackingCapability {
    AUTHENTICATION,
    LIBRARY_READ,
    LIBRARY_WRITE,
    WATCHED_READ,
    WATCHED_WRITE,
    PROGRESS_READ,
    PROGRESS_WRITE,
    SCROBBLE,
    COMMENTS,
    RECOMMENDATIONS,
}

data class TrackingProviderDescriptor(
    val id: TrackingProviderId,
    val displayName: String,
    val capabilities: Set<TrackingCapability>,
)

interface TrackingProfileStore {
    val providerId: TrackingProviderId

    fun onProfileChanged()
    fun clearLocalState()
    fun removeStoredProfile(profileId: Int)
}

interface TrackingAuthProvider : TrackingProfileStore {
    val descriptor: TrackingProviderDescriptor
    val isAuthenticated: StateFlow<Boolean>
    override val providerId: TrackingProviderId
        get() = descriptor.id

    fun ensureLoaded()
    fun handleAuthCallback(url: String): Boolean = false
}

object TrackingProviderRegistry {
    private val lock = SynchronizedObject()
    private val authProviders = mutableMapOf<TrackingProviderId, TrackingAuthProvider>()
    private val profileStores = mutableSetOf<TrackingProfileStore>()

    fun register(provider: TrackingAuthProvider) = synchronized(lock) {
        authProviders[provider.descriptor.id] = provider
        profileStores += provider
    }

    fun registerProfileStore(store: TrackingProfileStore) = synchronized(lock) {
        profileStores += store
    }

    fun authProvider(id: TrackingProviderId): TrackingAuthProvider? = synchronized(lock) {
        authProviders[id]
    }

    fun isAuthenticated(id: TrackingProviderId): Boolean =
        authProvider(id)?.also(TrackingAuthProvider::ensureLoaded)?.isAuthenticated?.value == true

    fun connectedProviderIds(): Set<TrackingProviderId> =
        providerSnapshot()
            .onEach(TrackingAuthProvider::ensureLoaded)
            .filterTo(linkedSetOf()) { provider -> provider.isAuthenticated.value }
            .mapTo(linkedSetOf()) { provider -> provider.descriptor.id }

    fun providersWith(capability: TrackingCapability): List<TrackingAuthProvider> =
        providerSnapshot()
            .filter { provider -> capability in provider.descriptor.capabilities }
            .sortedBy { provider -> provider.descriptor.id.ordinal }

    fun handleAuthCallback(url: String): Boolean =
        providersWith(TrackingCapability.AUTHENTICATION)
            .any { provider -> provider.handleAuthCallback(url) }

    fun ensureLoaded() {
        providerSnapshot().forEach(TrackingAuthProvider::ensureLoaded)
    }

    fun onProfileChanged() {
        profileStoreSnapshot().forEach(TrackingProfileStore::onProfileChanged)
    }

    fun clearLocalState() {
        profileStoreSnapshot().forEach(TrackingProfileStore::clearLocalState)
    }

    fun removeStoredProfiles(profileIds: Iterable<Int>) {
        val stores = profileStoreSnapshot()
        profileIds.forEach { profileId ->
            stores.forEach { store -> store.removeStoredProfile(profileId) }
        }
    }

    private fun providerSnapshot(): List<TrackingAuthProvider> = synchronized(lock) {
        authProviders.values.toList()
    }

    private fun profileStoreSnapshot(): List<TrackingProfileStore> = synchronized(lock) {
        profileStores.toList()
    }
}
