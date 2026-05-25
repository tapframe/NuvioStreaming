package com.nuvio.app.features.debrid

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TorboxDeviceAuthTest {
    @Test
    fun `maps unused device code response to pending`() {
        val response = DebridApiResponse(
            status = 400,
            body = TorboxEnvelopeDto<TorboxDeviceTokenDto>(
                success = false,
                detail = "This device code has not been used yet. Please wait for the user to scan the code.",
            ),
            rawBody = "",
        )

        assertEquals(
            DebridDeviceAuthorizationTokenResult.Pending,
            torboxDeviceAuthorizationTokenResult(response),
        )
    }

    @Test
    fun `maps authorized and expired Torbox device states`() {
        assertTrue(
            torboxDeviceAuthorizationTokenResult(
                DebridApiResponse(
                    status = 200,
                    body = TorboxEnvelopeDto(
                        success = true,
                        data = TorboxDeviceTokenDto(accessToken = "tb-token", tokenType = "Bearer"),
                    ),
                    rawBody = "",
                ),
            ) is DebridDeviceAuthorizationTokenResult.Authorized,
        )
        assertEquals(
            DebridDeviceAuthorizationTokenResult.Expired,
            torboxDeviceAuthorizationTokenResult(
                DebridApiResponse(
                    status = 410,
                    body = TorboxEnvelopeDto(success = false, detail = "Device code expired."),
                    rawBody = "",
                ),
            ),
        )
    }
}
