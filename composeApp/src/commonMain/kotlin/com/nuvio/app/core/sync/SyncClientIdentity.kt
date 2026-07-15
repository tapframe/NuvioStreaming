package com.nuvio.app.core.sync

import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.put
import kotlin.random.Random

private const val CLIENT_ID_LENGTH = 32
private const val CLIENT_ID_PREFIX = "nuvio-mobile-"
private const val ORIGIN_CLIENT_ID_PARAM = "p_origin_client_id"
private const val CLIENT_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

object SyncClientIdentity {
    private var cachedClientId: String? = null

    fun currentClientId(): String {
        cachedClientId?.let { return it }

        val stored = SyncClientIdentityStorage.loadClientId()
            ?.trim()
            ?.takeIf { it.isValidSyncClientId() }
        if (stored != null) {
            cachedClientId = stored
            return stored
        }

        val generated = generateClientId()
        SyncClientIdentityStorage.saveClientId(generated)
        cachedClientId = generated
        return generated
    }

    private fun generateClientId(): String =
        CLIENT_ID_PREFIX + buildString(CLIENT_ID_LENGTH) {
            repeat(CLIENT_ID_LENGTH) {
                append(CLIENT_ID_ALPHABET[Random.nextInt(CLIENT_ID_ALPHABET.length)])
            }
        }

    private fun String.isValidSyncClientId(): Boolean =
        length in 16..96 && all { it.isLetterOrDigit() || it == '-' || it == '_' }
}

internal fun JsonObjectBuilder.putSyncOriginClientId() {
    put(ORIGIN_CLIENT_ID_PARAM, SyncClientIdentity.currentClientId())
}

internal expect object SyncClientIdentityStorage {
    fun loadClientId(): String?
    fun saveClientId(clientId: String)
}
