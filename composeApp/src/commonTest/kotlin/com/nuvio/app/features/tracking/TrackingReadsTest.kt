package com.nuvio.app.features.tracking

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class TrackingReadsTest {
    @Test
    fun `selection group keeps one provider status selected`() {
        val tabs = listOf(
            tab("local", providerId = null),
            tab("simkl:watching", selectionGroup = "simkl:status"),
            tab("simkl:completed", selectionGroup = "simkl:status"),
        )
        val current = mapOf(
            "local" to true,
            "simkl:watching" to true,
            "simkl:completed" to false,
        )

        val updated = toggleTrackingLibraryMembership(
            tabs = tabs,
            membership = current,
            key = "simkl:completed",
        )

        assertEquals(true, updated["local"])
        assertEquals(false, updated["simkl:watching"])
        assertEquals(true, updated["simkl:completed"])
    }

    @Test
    fun `unknown selection key leaves membership unchanged`() {
        val current = mapOf("local" to true)

        val updated = toggleTrackingLibraryMembership(
            tabs = listOf(tab("local", providerId = null)),
            membership = current,
            key = "missing",
        )

        assertSame(current, updated)
    }

    @Test
    fun `content type support filters provider specific statuses`() {
        val seriesOnly = tab("simkl:watching").copy(supportedContentTypes = setOf("series"))

        assertTrue(seriesOnly.supportsContentType("SERIES"))
        assertFalse(seriesOnly.supportsContentType("movie"))
        assertTrue(tab("trakt:watchlist").supportsContentType("movie"))
    }

    @Test
    fun `non destination status stays in selection group without appearing in picker`() {
        val watching = tab("simkl:watching", selectionGroup = "simkl:status")
        val completed = tab("simkl:completed", selectionGroup = "simkl:status")
            .copy(isMembershipDestination = false)
        val tabs = listOf(watching, completed)

        assertEquals(listOf(watching), trackingMembershipDestinations(tabs))

        val updated = toggleTrackingLibraryMembership(
            tabs = tabs,
            membership = mapOf(watching.key to false, completed.key to true),
            key = watching.key,
        )

        assertEquals(true, updated[watching.key])
        assertEquals(false, updated[completed.key])
    }

    private fun tab(
        key: String,
        providerId: TrackingProviderId? = TrackingProviderId.SIMKL,
        selectionGroup: String? = null,
    ) = TrackingLibraryTab(
        key = key,
        title = key,
        providerId = providerId,
        kind = TrackingLibraryTabKind.STATUS,
        selectionGroup = selectionGroup,
    )
}
