package com.nuvio.app.features.tracking

enum class TrackingListStatus(val wireValue: String) {
    WATCHING("watching"),
    PLAN_TO_WATCH("plantowatch"),
    ON_HOLD("hold"),
    COMPLETED("completed"),
    DROPPED("dropped"),
}

enum class TrackingScrobbleAction(val wireValue: String) {
    START("start"),
    PAUSE("pause"),
    STOP("stop"),
}

data class TrackingHistoryItem(
    val media: TrackingMediaReference,
    val watchedAtEpochMs: Long? = null,
)

data class TrackingScrobbleEvent(
    val media: TrackingMediaReference,
    val progressPercent: Double,
)

data class TrackingMutationResult(
    val attemptedCount: Int,
    val notFoundCount: Int = 0,
) {
    val isComplete: Boolean
        get() = notFoundCount == 0
}

interface TrackingListWriter {
    val providerId: TrackingProviderId

    suspend fun moveToList(
        profileId: Int,
        items: Collection<TrackingMediaReference>,
        destination: TrackingListStatus,
    ): TrackingMutationResult

    suspend fun removeFromList(
        profileId: Int,
        items: Collection<TrackingMediaReference>,
    ): TrackingMutationResult
}

interface TrackingHistoryWriter {
    val providerId: TrackingProviderId

    suspend fun addToHistory(
        profileId: Int,
        items: Collection<TrackingHistoryItem>,
    ): TrackingMutationResult

    suspend fun removeFromHistory(
        profileId: Int,
        items: Collection<TrackingMediaReference>,
    ): TrackingMutationResult
}

interface TrackingScrobbler {
    val providerId: TrackingProviderId

    suspend fun scrobble(
        profileId: Int,
        action: TrackingScrobbleAction,
        event: TrackingScrobbleEvent,
    )
}
