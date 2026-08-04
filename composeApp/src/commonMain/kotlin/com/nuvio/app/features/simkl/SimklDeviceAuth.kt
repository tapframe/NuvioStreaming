package com.nuvio.app.features.simkl

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class SimklAuthenticationMethod(val storageValue: String) {
    BROWSER_REDIRECT("browser_redirect"),
    DEVICE_CODE("device_code"),
    ;

    companion object {
        fun fromStorageValue(value: String?): SimklAuthenticationMethod =
            entries.firstOrNull { it.storageValue.equals(value, ignoreCase = true) } ?: BROWSER_REDIRECT
    }
}

internal const val SIMKL_PIN_VERIFICATION_URL = "https://simkl.com/pin"

internal const val SIMKL_DEFAULT_PIN_POLL_INTERVAL_SECONDS = 5
internal const val SIMKL_DEFAULT_PIN_EXPIRES_IN_SECONDS = 900

internal const val SIMKL_PIN_STATE_PREFIX = "pin:"

internal fun buildPendingPinState(userCode: String): String = "$SIMKL_PIN_STATE_PREFIX$userCode"

internal fun pendingPinUserCode(state: String?): String? =
    state?.takeIf { it.startsWith(SIMKL_PIN_STATE_PREFIX) }?.removePrefix(SIMKL_PIN_STATE_PREFIX)

@Serializable
internal data class SimklPinResponse(
    @SerialName("user_code") val userCode: String = "",
    @SerialName("verification_url") val verificationUrl: String? = null,
    @SerialName("expires_in") val expiresIn: Int? = null,
    val interval: Int? = null,
)

@Serializable
internal data class SimklPinPollResponse(
    val result: String? = null,
    val message: String? = null,
    @SerialName("access_token") val accessToken: String? = null,
) {
    val isAuthorized: Boolean
        get() = result.equals("OK", ignoreCase = true) && !accessToken.isNullOrBlank()
}
