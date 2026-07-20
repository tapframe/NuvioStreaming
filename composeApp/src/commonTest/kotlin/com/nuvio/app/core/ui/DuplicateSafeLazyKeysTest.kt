package com.nuvio.app.core.ui

import kotlin.test.Test
import kotlin.test.assertEquals

class DuplicateSafeLazyKeysTest {
    @Test
    fun `duplicate lazy keys receive stable occurrence suffixes`() {
        val result = listOf("duplicate", "other", "duplicate")
            .withDuplicateSafeLazyKeys { value -> value }

        assertEquals(listOf("duplicate#0", "other", "duplicate#1"), result.map { it.lazyKey })
    }
}
