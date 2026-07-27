package com.nuvio.app.core.auth

import co.touchlab.kermit.Logger
import com.nuvio.app.core.build.AppVersionConfig
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.sync.SyncClientIdentity
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.time.Duration.Companion.minutes
import kotlin.time.TimeMark
import kotlin.time.TimeSource

private const val CLIENT_NAME = "Nuvio Mobile"
private val REGISTRATION_INTERVAL = 15.minutes

internal data class DeviceClientMetadata(
    val deviceName: String,
    val platform: String,
)

internal expect fun currentDeviceClientMetadata(): DeviceClientMetadata

object DeviceSessionRegistration {
    private val log = Logger.withTag("DeviceSessionRegistration")
    private val registrationMutex = Mutex()
    private var lastRegistration: TimeMark? = null

    suspend fun registerIfAuthenticated(force: Boolean = false): Boolean {
        val authState = AuthRepository.state.value as? AuthState.Authenticated ?: return false
        if (authState.isAnonymous) return false

        return registrationMutex.withLock {
            if (!force && lastRegistration?.elapsedNow()?.let { it < REGISTRATION_INTERVAL } == true) {
                return@withLock true
            }

            val metadata = currentDeviceClientMetadata()
            val params = buildDeviceRegistrationParams(
                installationId = SyncClientIdentity.currentClientId(),
                clientVersion = AppVersionConfig.VERSION_NAME,
                metadata = metadata,
            )

            try {
                SupabaseProvider.client.postgrest.rpc("register_current_device", params)
                lastRegistration = TimeSource.Monotonic.markNow()
                true
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                log.w(error) { "Device session registration failed" }
                false
            }
        }
    }
}

internal fun buildDeviceRegistrationParams(
    installationId: String,
    clientVersion: String,
    metadata: DeviceClientMetadata,
): JsonObject = buildJsonObject {
    put("p_installation_id", installationId)
    put("p_client_name", CLIENT_NAME)
    put("p_client_version", clientVersion)
    put("p_platform", metadata.platform)
    put("p_device_name", metadata.deviceName)
}

internal fun formatDeviceName(
    manufacturer: String,
    model: String,
    fallback: String,
): String {
    val normalizedManufacturer = manufacturer.trim()
    val normalizedModel = model.trim()

    return when {
        normalizedModel.isBlank() -> fallback
        normalizedManufacturer.isBlank() -> normalizedModel
        normalizedModel.startsWith(normalizedManufacturer, ignoreCase = true) -> normalizedModel
        else -> "$normalizedManufacturer $normalizedModel"
    }
}
