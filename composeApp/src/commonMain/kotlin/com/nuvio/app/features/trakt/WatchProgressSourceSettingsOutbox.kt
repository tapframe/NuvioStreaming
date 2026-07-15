package com.nuvio.app.features.trakt

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
internal data class PendingWatchProgressSourceChange(
    val accountId: String,
    val profileId: Int,
    val source: WatchProgressSource,
)

internal class WatchProgressSourceSettingsOutbox(
    private val loadPayload: (profileId: Int) -> String?,
    private val savePayload: (profileId: Int, payload: String) -> Unit,
    private val clearPayload: (profileId: Int) -> Unit,
) {
    private val lock = SynchronizedObject()
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun record(change: PendingWatchProgressSourceChange) = synchronized(lock) {
        savePayload(change.profileId, json.encodeToString(change))
    }

    fun pendingFor(accountId: String, profileId: Int): PendingWatchProgressSourceChange? =
        synchronized(lock) {
            val payload = loadPayload(profileId).orEmpty().trim()
            if (payload.isEmpty()) return@synchronized null

            val change = runCatching {
                json.decodeFromString<PendingWatchProgressSourceChange>(payload)
            }.getOrNull()
            if (change == null || change.accountId != accountId || change.profileId != profileId) {
                clearPayload(profileId)
                return@synchronized null
            }
            change
        }

    fun clearIfMatches(change: PendingWatchProgressSourceChange): Boolean = synchronized(lock) {
        val current = loadPayload(change.profileId)
            ?.let { payload ->
                runCatching {
                    json.decodeFromString<PendingWatchProgressSourceChange>(payload)
                }.getOrNull()
            }
        if (current != change) return@synchronized false
        clearPayload(change.profileId)
        true
    }
}

internal object ProfileSettingsWatchSourceOutbox {
    private val delegate = WatchProgressSourceSettingsOutbox(
        loadPayload = TraktSettingsStorage::loadPendingWatchProgressSourcePayload,
        savePayload = TraktSettingsStorage::savePendingWatchProgressSourcePayload,
        clearPayload = TraktSettingsStorage::clearPendingWatchProgressSourcePayload,
    )

    fun record(
        accountId: String,
        profileId: Int,
        source: WatchProgressSource,
    ) {
        delegate.record(
            PendingWatchProgressSourceChange(
                accountId = accountId,
                profileId = profileId,
                source = source,
            ),
        )
    }

    fun pendingFor(accountId: String, profileId: Int): PendingWatchProgressSourceChange? =
        delegate.pendingFor(accountId = accountId, profileId = profileId)

    fun clearIfMatches(change: PendingWatchProgressSourceChange): Boolean =
        delegate.clearIfMatches(change)
}
