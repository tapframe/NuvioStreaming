package com.nuvio.app.features.watchprogress

import androidx.compose.runtime.Composable
import com.nuvio.app.core.format.formatReleaseDateWithoutYear
import com.nuvio.app.core.time.daysUntilEpisodeRelease
import com.nuvio.app.core.time.parseEpisodeReleaseEpochMs
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.pluralStringResource
import org.jetbrains.compose.resources.stringResource
import co.touchlab.kermit.Logger

@Composable
fun computeAirDateBadgeText(
    releasedIso: String?,
    todayIsoDate: String,
    compact: Boolean
): String? {
    if (releasedIso.isNullOrBlank() || todayIsoDate.isBlank()) {
        return null
    }

    val releaseEpoch = parseEpisodeReleaseEpochMs(releasedIso)
    if (releaseEpoch != null && WatchProgressClock.nowEpochMs() >= releaseEpoch) {
        return null
    }

    val daysUntil = daysUntilEpisodeRelease(
        todayIsoDate = todayIsoDate,
        releasedDate = releasedIso,
    ) ?: return null

    return when {
        daysUntil < 0 -> null
        daysUntil == 0 -> {
            if (compact) stringResource(Res.string.cw_airs_today_short)
            else stringResource(Res.string.cw_airs_today)
        }
        daysUntil == 1 -> {
            if (compact) stringResource(Res.string.cw_airs_tomorrow_short)
            else stringResource(Res.string.cw_airs_tomorrow)
        }
        daysUntil in 2..7 -> {
            if (compact) pluralStringResource(Res.plurals.cw_airs_in_days_short, daysUntil, daysUntil)
            else pluralStringResource(Res.plurals.cw_airs_in_days, daysUntil, daysUntil)
        }
        else -> {
            val formattedDate = formatReleaseDateWithoutYear(releasedIso)
            if (compact) stringResource(Res.string.cw_airs_date_short, formattedDate)
            else stringResource(Res.string.cw_airs_date, formattedDate)
        }
    }
}

fun parseReleaseDateToEpochMs(raw: String?): Long? {
    return parseEpisodeReleaseEpochMs(raw)
}

class ReleaseAlertState(
    val isReleaseAlert: Boolean,
    val isNewSeasonRelease: Boolean,
)

fun calculateReleaseAlertState(
    seedLastUpdatedEpochMs: Long,
    seedSeasonNumber: Int?,
    nextSeasonNumber: Int?,
    releasedIso: String?,
): ReleaseAlertState {
    val releaseEpoch = parseReleaseDateToEpochMs(releasedIso)
    val nowMs = WatchProgressClock.nowEpochMs()

    val log = Logger.withTag("ReleaseAlert")
    log.d {
        "calculateReleaseAlertState inputs: releasedIso=$releasedIso, " +
        "releaseEpoch=$releaseEpoch, seedLastUpdatedEpochMs=$seedLastUpdatedEpochMs, " +
        "seedSeasonNumber=$seedSeasonNumber, nextSeasonNumber=$nextSeasonNumber, nowMs=$nowMs"
    }

    if (releaseEpoch == null) {
        log.d { "calculateReleaseAlertState failed: releaseEpoch is null" }
        return ReleaseAlertState(false, false)
    }

    val hasAired = nowMs >= releaseEpoch
    val sixtyDaysMs = 60L * 24 * 60 * 60 * 1000
    val isReleaseAlert = hasAired &&
        releaseEpoch > seedLastUpdatedEpochMs &&
        (nowMs - releaseEpoch) < sixtyDaysMs

    val isNewSeasonRelease = isReleaseAlert &&
        seedSeasonNumber != null &&
        nextSeasonNumber != null &&
        nextSeasonNumber != seedSeasonNumber

    log.d {
        "calculateReleaseAlertState result: isReleaseAlert=$isReleaseAlert (hasAired=$hasAired, " +
        "epoch>seed=${releaseEpoch > seedLastUpdatedEpochMs}, ageMs=${nowMs - releaseEpoch}), " +
        "isNewSeasonRelease=$isNewSeasonRelease"
    }

    return ReleaseAlertState(
        isReleaseAlert = isReleaseAlert,
        isNewSeasonRelease = isNewSeasonRelease
    )
}
