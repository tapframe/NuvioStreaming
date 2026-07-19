package com.nuvio.app

import androidx.compose.ui.unit.dp
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AppLayoutTest {

    @Test
    fun `phone navigation classification stays stable across rotation`() {
        assertFalse(isTabletAppLayout(width = 666.dp, height = 1000.dp))
        assertFalse(isTabletAppLayout(width = 1000.dp, height = 666.dp))
    }

    @Test
    fun `tablet navigation classification stays stable across rotation`() {
        assertTrue(isTabletAppLayout(width = 800.dp, height = 1280.dp))
        assertTrue(isTabletAppLayout(width = 1280.dp, height = 800.dp))
    }

    @Test
    fun `platform override still forces tablet navigation`() {
        assertTrue(
            isTabletAppLayout(
                width = 390.dp,
                height = 844.dp,
                forceTabletLayout = true,
            ),
        )
    }
}
