package com.nuvio.app.features.tracking

import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals

class TrackingScrobbleCoordinatorTest {
    @Test
    fun `fanout isolates one provider failure`() = runBlocking {
        val successful = FakeScrobbler(TrackingProviderId.TRAKT)
        val failing = FakeScrobbler(TrackingProviderId.SIMKL, failure = IllegalStateException("offline"))
        val event = TrackingScrobbleEvent(
            media = TrackingMediaReference(
                kind = TrackingMediaKind.MOVIE,
                ids = TrackingExternalIds(imdb = "tt0111161"),
            ),
            progressPercent = 42.5,
        )

        val failures = dispatchTrackingScrobble(
            scrobblers = listOf(successful, failing),
            profileId = 2,
            action = TrackingScrobbleAction.PAUSE,
            event = event,
        )

        assertEquals(1, successful.callCount)
        assertEquals(1, failing.callCount)
        assertEquals(listOf(TrackingProviderId.SIMKL), failures.map(TrackingScrobbleFailure::providerId))
    }

    private class FakeScrobbler(
        override val providerId: TrackingProviderId,
        private val failure: Throwable? = null,
    ) : TrackingScrobbler {
        var callCount: Int = 0

        override suspend fun scrobble(
            profileId: Int,
            action: TrackingScrobbleAction,
            event: TrackingScrobbleEvent,
        ) {
            callCount += 1
            failure?.let { throw it }
        }
    }
}
