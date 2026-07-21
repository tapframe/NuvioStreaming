package com.nuvio.app.features.tracking

import co.touchlab.kermit.Logger
import com.nuvio.app.features.profiles.ProfileRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.supervisorScope

data class TrackingScrobbleFailure(
    val providerId: TrackingProviderId,
    val cause: Throwable,
)

object TrackingScrobbleCoordinator {
    private val log = Logger.withTag("TrackingScrobble")

    suspend fun scrobble(
        profileId: Int,
        action: TrackingScrobbleAction,
        event: TrackingScrobbleEvent,
    ): List<TrackingScrobbleFailure> {
        if (profileId != ProfileRepository.activeProfileId) return emptyList()
        TrackingProviderRegistry.ensureLoaded()
        val failures = dispatchTrackingScrobble(
            scrobblers = TrackingProviderRegistry.connectedScrobblers(),
            profileId = profileId,
            action = action,
            event = event,
        )
        failures.forEach { failure ->
            log.w(failure.cause) {
                "${failure.providerId.storageId} scrobble ${action.wireValue} failed"
            }
        }
        return failures
    }
}

internal suspend fun dispatchTrackingScrobble(
    scrobblers: Collection<TrackingScrobbler>,
    profileId: Int,
    action: TrackingScrobbleAction,
    event: TrackingScrobbleEvent,
): List<TrackingScrobbleFailure> = supervisorScope {
    scrobblers.map { scrobbler ->
        async {
            try {
                scrobbler.scrobble(profileId = profileId, action = action, event = event)
                null
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                TrackingScrobbleFailure(providerId = scrobbler.providerId, cause = error)
            }
        }
    }.awaitAll().filterNotNull()
}
