package com.nuvio.app.features.debrid

import kotlin.test.Test
import kotlin.test.assertEquals

class DirectDebridConfigEncoderTest {
    @Test
    fun `encodes Torbox config exactly like TV`() {
        val encoded = DirectDebridConfigEncoder().encodeTorbox("tb_key")

        assertEquals(
            "eyJjYWNoZWRPbmx5Ijp0cnVlLCJkZWJyaWRTZXJ2aWNlcyI6W3sic2VydmljZSI6InRvcmJveCIsImFwaUtleSI6InRiX2tleSJ9XSwiZW5hYmxlVG9ycmVudCI6ZmFsc2V9",
            encoded,
        )
    }

    @Test
    fun `escapes API key before base64 encoding`() {
        val encoded = DirectDebridConfigEncoder().encode(
            DebridServiceCredential(DebridProviders.RealDebrid, "rd\"key\\line"),
        )

        val expected = "eyJjYWNoZWRPbmx5Ijp0cnVlLCJkZWJyaWRTZXJ2aWNlcyI6W3sic2VydmljZSI6InJlYWxkZWJyaWQiLCJhcGlLZXkiOiJyZFwia2V5XFxsaW5lIn1dLCJlbmFibGVUb3JyZW50IjpmYWxzZX0="
        assertEquals(expected, encoded)
    }
}

