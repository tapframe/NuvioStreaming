package com.nuvio.app.features.player

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SubtitleRepositoryTest {

    @Test
    fun signedUrlIsKeptByteForByte() {
        val exactUrl = " https://cdn.example/sub.srt?token=a%2Bb%2Fc&expires=4102444800 "
        val payload = parseAddonSubtitlePayload(
            Json.parseToJsonElement(
                """{"id":"provider-id","url":"$exactUrl","lang":"en"}""",
            ).jsonObject,
        )

        assertEquals(exactUrl, payload?.url)
    }

    @Test
    fun missingProviderIdNeverUsesResponseOrdinal() {
        val first = parseAddonSubtitlePayload(
            Json.parseToJsonElement(
                """{"url":"https://cdn.example/a.srt","lang":"en"}""",
            ).jsonObject,
        )
        val second = parseAddonSubtitlePayload(
            Json.parseToJsonElement(
                """{"url":"https://cdn.example/b.srt","lang":"en"}""",
            ).jsonObject,
        )

        assertEquals(first?.id, second?.id)
        assertNull(first?.providerSubtitleId)
        assertNull(second?.providerSubtitleId)
    }
}
