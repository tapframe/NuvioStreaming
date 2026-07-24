package com.nuvio.app.navigation

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class RouteDisposalRegistryTest {
    @Test
    fun disposesRegisteredRouteExactlyOnceWhenNav3ReportsPop() {
        val disposedRoutes = mutableListOf<String>()
        val registry = RouteDisposalRegistry<String>(disposedRoutes::add)

        registry.register(contentKey = "stream-entry", key = "stream-route")

        assertTrue(disposedRoutes.isEmpty())

        registry.dispose(contentKey = "stream-entry")
        registry.dispose(contentKey = "stream-entry")

        assertEquals(listOf("stream-route"), disposedRoutes)
    }

    @Test
    fun rejectsAContentKeySharedByDifferentRoutes() {
        val registry = RouteDisposalRegistry<String> {}
        registry.register(contentKey = "shared-entry", key = "first-route")

        assertFailsWith<IllegalStateException> {
            registry.register(contentKey = "shared-entry", key = "second-route")
        }
    }
}
