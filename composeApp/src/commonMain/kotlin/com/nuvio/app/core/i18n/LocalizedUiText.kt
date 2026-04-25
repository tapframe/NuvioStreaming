package com.nuvio.app.core.i18n

import kotlinx.coroutines.runBlocking
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_play
import nuvio.composeapp.generated.resources.action_play_episode
import nuvio.composeapp.generated.resources.action_resume
import nuvio.composeapp.generated.resources.action_resume_episode
import nuvio.composeapp.generated.resources.compose_player_episode_code_episode_only
import nuvio.composeapp.generated.resources.compose_player_episode_code_full
import nuvio.composeapp.generated.resources.continue_watching_up_next
import nuvio.composeapp.generated.resources.continue_watching_up_next_episode
import nuvio.composeapp.generated.resources.date_month_april
import nuvio.composeapp.generated.resources.date_month_august
import nuvio.composeapp.generated.resources.date_month_december
import nuvio.composeapp.generated.resources.date_month_february
import nuvio.composeapp.generated.resources.date_month_january
import nuvio.composeapp.generated.resources.date_month_july
import nuvio.composeapp.generated.resources.date_month_june
import nuvio.composeapp.generated.resources.date_month_march
import nuvio.composeapp.generated.resources.date_month_may
import nuvio.composeapp.generated.resources.date_month_november
import nuvio.composeapp.generated.resources.date_month_october
import nuvio.composeapp.generated.resources.date_month_september
import nuvio.composeapp.generated.resources.date_month_short_apr
import nuvio.composeapp.generated.resources.date_month_short_aug
import nuvio.composeapp.generated.resources.date_month_short_dec
import nuvio.composeapp.generated.resources.date_month_short_feb
import nuvio.composeapp.generated.resources.date_month_short_jan
import nuvio.composeapp.generated.resources.date_month_short_jul
import nuvio.composeapp.generated.resources.date_month_short_jun
import nuvio.composeapp.generated.resources.date_month_short_mar
import nuvio.composeapp.generated.resources.date_month_short_may
import nuvio.composeapp.generated.resources.date_month_short_nov
import nuvio.composeapp.generated.resources.date_month_short_oct
import nuvio.composeapp.generated.resources.date_month_short_sep
import nuvio.composeapp.generated.resources.media_anime
import nuvio.composeapp.generated.resources.media_channels
import nuvio.composeapp.generated.resources.media_movie
import nuvio.composeapp.generated.resources.media_movies
import nuvio.composeapp.generated.resources.media_series
import nuvio.composeapp.generated.resources.media_tv
import nuvio.composeapp.generated.resources.unit_bytes_b
import nuvio.composeapp.generated.resources.unit_bytes_gb
import nuvio.composeapp.generated.resources.unit_bytes_kb
import nuvio.composeapp.generated.resources.unit_bytes_mb
import org.jetbrains.compose.resources.getString

fun localizedMediaTypeLabel(type: String): String = runBlocking {
    when (type.trim().lowercase()) {
        "movie" -> getString(Res.string.media_movies)
        "series" -> getString(Res.string.media_series)
        "anime" -> getString(Res.string.media_anime)
        "channel" -> getString(Res.string.media_channels)
        "tv" -> getString(Res.string.media_tv)
        else -> type.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
}

fun localizedMovieTypeLabel(): String = runBlocking { getString(Res.string.media_movie) }

fun localizedSeasonEpisodeCode(seasonNumber: Int?, episodeNumber: Int?): String? = runBlocking {
    when {
        seasonNumber != null && episodeNumber != null ->
            getString(Res.string.compose_player_episode_code_full, seasonNumber, episodeNumber)
        episodeNumber != null ->
            getString(Res.string.compose_player_episode_code_episode_only, episodeNumber)
        else -> null
    }
}

fun localizedPlayLabel(seasonNumber: Int?, episodeNumber: Int?): String = runBlocking {
    val episodeCode = localizedSeasonEpisodeCode(seasonNumber, episodeNumber)
    if (episodeCode != null) {
        getString(Res.string.action_play_episode, episodeCode)
    } else {
        getString(Res.string.action_play)
    }
}

fun localizedResumeLabel(seasonNumber: Int?, episodeNumber: Int?): String = runBlocking {
    val episodeCode = localizedSeasonEpisodeCode(seasonNumber, episodeNumber)
    if (episodeCode != null) {
        getString(Res.string.action_resume_episode, episodeCode)
    } else {
        getString(Res.string.action_resume)
    }
}

fun localizedUpNextLabel(seasonNumber: Int?, episodeNumber: Int?): String = runBlocking {
    if (seasonNumber != null && episodeNumber != null) {
        getString(Res.string.continue_watching_up_next_episode, seasonNumber, episodeNumber)
    } else {
        getString(Res.string.continue_watching_up_next)
    }
}

fun localizedMonthName(month: Int): String = runBlocking {
    when (month) {
        1 -> getString(Res.string.date_month_january)
        2 -> getString(Res.string.date_month_february)
        3 -> getString(Res.string.date_month_march)
        4 -> getString(Res.string.date_month_april)
        5 -> getString(Res.string.date_month_may)
        6 -> getString(Res.string.date_month_june)
        7 -> getString(Res.string.date_month_july)
        8 -> getString(Res.string.date_month_august)
        9 -> getString(Res.string.date_month_september)
        10 -> getString(Res.string.date_month_october)
        11 -> getString(Res.string.date_month_november)
        12 -> getString(Res.string.date_month_december)
        else -> month.toString()
    }
}

fun localizedShortMonthName(month: Int): String = runBlocking {
    when (month) {
        1 -> getString(Res.string.date_month_short_jan)
        2 -> getString(Res.string.date_month_short_feb)
        3 -> getString(Res.string.date_month_short_mar)
        4 -> getString(Res.string.date_month_short_apr)
        5 -> getString(Res.string.date_month_short_may)
        6 -> getString(Res.string.date_month_short_jun)
        7 -> getString(Res.string.date_month_short_jul)
        8 -> getString(Res.string.date_month_short_aug)
        9 -> getString(Res.string.date_month_short_sep)
        10 -> getString(Res.string.date_month_short_oct)
        11 -> getString(Res.string.date_month_short_nov)
        12 -> getString(Res.string.date_month_short_dec)
        else -> month.toString()
    }
}

fun localizedByteUnit(unit: String): String = runBlocking {
    when (unit) {
        "GB" -> getString(Res.string.unit_bytes_gb)
        "MB" -> getString(Res.string.unit_bytes_mb)
        "KB" -> getString(Res.string.unit_bytes_kb)
        else -> getString(Res.string.unit_bytes_b)
    }
}
