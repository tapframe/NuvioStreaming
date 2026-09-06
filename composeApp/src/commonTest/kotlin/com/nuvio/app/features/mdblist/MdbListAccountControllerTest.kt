package com.nuvio.app.features.mdblist

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class MdbListAccountControllerTest {
    @Test
    fun connectionPollsAfterIntervalAndPublishesApprovedScope() = runTest {
        val h = MdbListTestHarness()
        var approved: MdbListAuthScope? = null
        val controller = MdbListAccountController(h.auth, h.store, backgroundScope, { approved = it }, { h.now })
        h.reply(body = MdbListTestHarness.DEVICE_RESPONSE)
        assertTrue(controller.connect()!!.startsWith("https://mdblist.com/oauth/device/"))
        runCurrent()
        assertEquals(1, h.engine.requests.size)
        assertFalse(controller.status.value.isBusy)
        h.reply(body = MdbListTestHarness.TOKEN_RESPONSE)
        h.now += 5_000
        advanceTimeBy(5_000)
        runCurrent()
        assertTrue(h.store.state.value.isAuthenticated)
        assertEquals(h.store.scope(), approved)
        assertEquals(2, h.engine.requests.size)
    }

    @Test
    fun cancelAndProfileChangeRejectOldScreenActions() = runTest {
        val h = MdbListTestHarness()
        val controller = MdbListAccountController(h.auth, h.store, backgroundScope, {}, { h.now })
        h.reply(body = MdbListTestHarness.DEVICE_RESPONSE)
        controller.connect()
        controller.cancel()
        advanceTimeBy(10_000)
        assertEquals(1, h.engine.requests.size)
        val old = h.store.scope()
        h.store.selectProfile(2)
        expectMdbListFailure<CancellationException> { controller.connect(old) }
        expectMdbListFailure<CancellationException> { controller.disconnect(old) }
        assertEquals(1, h.engine.requests.size)
    }

    @Test
    fun reopeningPendingSignInReusesCodeAndConnectionErrorsCanBeRetried() = runTest {
        val h = MdbListTestHarness()
        val controller = MdbListAccountController(h.auth, h.store, backgroundScope, {}, { h.now })
        h.reply(503)
        assertEquals(null, controller.connect())
        assertEquals(MdbListSyncError.UNAVAILABLE, controller.status.value.error)
        h.reply(body = MdbListTestHarness.DEVICE_RESPONSE)
        val first = controller.connect()
        assertEquals(first, controller.connect())
        assertEquals(2, h.engine.requests.size)
        assertEquals(null, controller.status.value.error)
    }
}
