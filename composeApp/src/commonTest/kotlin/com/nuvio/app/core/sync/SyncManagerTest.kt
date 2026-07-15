package com.nuvio.app.core.sync

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SyncManagerTest {

    @Test
    fun `source prerequisites finish before source dependent pulls`() = runBlocking {
        val events = mutableListOf<String>()
        var profileSettingsApplied = false
        var traktCredentialsApplied = false

        runOrderedProfileSync(
            profileId = 7,
            pluginsEnabled = true,
            operations = ProfileSyncOperations(
                pullAddons = { events += "addons" },
                pullPlugins = { events += "plugins" },
                pullProfileSettings = {
                    events += "settings:start"
                    yield()
                    profileSettingsApplied = true
                    events += "settings:end"
                },
                pullTraktCredentials = {
                    events += "credentials:start"
                    yield()
                    traktCredentialsApplied = true
                    events += "credentials:end"
                },
                pullLibrary = {
                    assertTrue(profileSettingsApplied)
                    assertTrue(traktCredentialsApplied)
                    events += "library"
                },
                refreshActiveWatchSource = {
                    assertTrue(profileSettingsApplied)
                    assertTrue(traktCredentialsApplied)
                    events += "active-watch-source"
                },
                pullCollections = { events += "collections" },
                pullHomeCatalogSettings = { events += "home-settings" },
            ),
            onFailure = { _, error -> throw error },
        )

        val lastPrerequisite = maxOf(
            events.indexOf("settings:end"),
            events.indexOf("credentials:end"),
        )
        assertTrue(events.indexOf("library") > lastPrerequisite)
        assertTrue(events.indexOf("active-watch-source") > lastPrerequisite)
        assertEquals(1, events.count { it == "active-watch-source" })
    }

    @Test
    fun `disabled plugins are skipped without changing sync ordering`() = runBlocking {
        val events = mutableListOf<String>()

        runOrderedProfileSync(
            profileId = 2,
            pluginsEnabled = false,
            operations = recordingOperations(events),
            onFailure = { _, error -> throw error },
        )

        assertTrue("plugins" !in events)
        assertTrue(events.indexOf("settings") < events.indexOf("library"))
        assertTrue(events.indexOf("credentials") < events.indexOf("active-watch-source"))
    }

    @Test
    fun `duplicate active request for one profile is coalesced`() = runBlocking {
        val gate = ProfileSyncRequestGate()
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        var runCount = 0

        val first = gate.launch(this, profileId = 4) {
            runCount += 1
            firstStarted.complete(Unit)
            releaseFirst.await()
        }
        firstStarted.await()

        val duplicate = gate.launch(this, profileId = 4) {
            runCount += 1
        }

        assertEquals(ProfileSyncRequestResult.Started, first)
        assertEquals(ProfileSyncRequestResult.Coalesced, duplicate)
        assertEquals(1, runCount)

        releaseFirst.complete(Unit)
        yield()
        gate.cancel()
    }

    @Test
    fun `new profile replaces stale in flight request`() = runBlocking {
        val gate = ProfileSyncRequestGate()
        val firstStarted = CompletableDeferred<Unit>()
        val firstCancelled = CompletableDeferred<Unit>()
        val secondCompleted = CompletableDeferred<Unit>()

        gate.launch(this, profileId = 1) {
            firstStarted.complete(Unit)
            try {
                CompletableDeferred<Unit>().await()
            } finally {
                firstCancelled.complete(Unit)
            }
        }
        firstStarted.await()

        val replacement = gate.launch(this, profileId = 2) {
            secondCompleted.complete(Unit)
        }

        assertEquals(ProfileSyncRequestResult.Replaced, replacement)
        firstCancelled.await()
        secondCompleted.await()
        gate.cancel()
    }

    @Test
    fun `failed step is reported by ordered sync result`() = runBlocking {
        val result = runOrderedProfileSync(
            profileId = 3,
            pluginsEnabled = false,
            operations = recordingOperations(mutableListOf()).copy(
                refreshActiveWatchSource = { error("source refresh failed") },
            ),
        )

        assertFalse(result.succeeded)
        assertEquals(setOf(ProfileSyncStep.ActiveWatchSource), result.failedSteps)
    }

    @Test
    fun `realtime invalidation queued during active sync runs once afterwards`() = runBlocking {
        val gate = ProfileSyncRequestGate()
        val firstStarted = CompletableDeferred<Unit>()
        val releaseFirst = CompletableDeferred<Unit>()
        val replayCompleted = CompletableDeferred<Unit>()
        var runCount = 0

        gate.launch(this, profileId = 1) {
            runCount += 1
            firstStarted.complete(Unit)
            releaseFirst.await()
        }
        firstStarted.await()

        val queued = gate.launch(this, profileId = 1, queueIfCoalesced = true) {
            runCount += 1
            replayCompleted.complete(Unit)
        }

        assertEquals(ProfileSyncRequestResult.Coalesced, queued)
        releaseFirst.complete(Unit)
        replayCompleted.await()
        assertEquals(2, runCount)
        gate.cancel()
    }

    private fun recordingOperations(events: MutableList<String>): ProfileSyncOperations =
        ProfileSyncOperations(
            pullAddons = { events += "addons" },
            pullPlugins = { events += "plugins" },
            pullProfileSettings = { events += "settings" },
            pullTraktCredentials = { events += "credentials" },
            pullLibrary = { events += "library" },
            refreshActiveWatchSource = { events += "active-watch-source" },
            pullCollections = { events += "collections" },
            pullHomeCatalogSettings = { events += "home-settings" },
        )
}
