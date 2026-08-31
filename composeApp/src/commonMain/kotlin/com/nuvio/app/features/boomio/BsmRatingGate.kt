package com.nuvio.app.features.boomio

import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.profiles.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.decodeFromString

/**
 * Client-side soft rating gate: fetches each Nuvio profile's content-rating ceiling
 * from BSM (`GET /api/nuvio/profile-ratings`) and exposes the active profile's ceiling
 * as a [StateFlow]. When BSM is unreachable (e.g. off-LAN), the seam is disabled, or a
 * rating is unknown, the gate fails open — this is a convenience filter, not a security
 * boundary.
 *
 * NOTE: static, uncompiled port of the legacy `BsmRatingGate`.
 */
object BsmRatingGate {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val json = Json { ignoreUnknownKeys = true }

    private val _ceilings = MutableStateFlow<Map<Int, String>>(emptyMap())

    private val activeProfileIndex = ProfileRepository.state
        .map { it.activeProfile?.profileIndex ?: 1 }
        .distinctUntilChanged()

    /** Content-rating ceiling for the currently active profile (null = no ceiling). */
    val activeCeiling: StateFlow<String?> = combine(
        activeProfileIndex,
        _ceilings,
    ) { profileIndex, ceilings -> ceilings[profileIndex] }
        .stateIn(scope, SharingStarted.Eagerly, null)

    init {
        scope.launch {
            activeProfileIndex.collect { refresh() }
        }
    }

    fun refresh() {
        val base = BoomioConfig.bsmBaseUrl.trim().trimEnd('/')
        if (base.isBlank()) return
        scope.launch {
            try {
                val payload = httpGetText("$base/api/nuvio/profile-ratings")
                val body = json.decodeFromString<List<BsmProfileRatingDto>>(payload)
                _ceilings.value = body.associate { dto ->
                    dto.profileIndex to (dto.contentRating ?: "G")
                }
            } catch (_: Throwable) {
                // BSM is LAN-only; leave ceilings empty and fail open.
            }
        }
    }

    fun isAllowed(ageRating: String?): Boolean =
        RatingOrdinal.isAllowed(ageRating, activeCeiling.value)
}

@Serializable
private data class BsmProfileRatingDto(
    val profileIndex: Int = 0,
    val contentRating: String? = null,
    val profileType: String? = null,
    val dateOfBirth: String? = null,
)
