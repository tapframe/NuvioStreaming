package com.nuvio.app.core.ui

import androidx.compose.runtime.Composable
import com.nuvio.app.features.watchprogress.ContinueWatchingItem
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
fun localizedContinueWatchingSubtitle(item: ContinueWatchingItem): String {
    val seasonNumber = item.seasonNumber
    val episodeNumber = item.episodeNumber
    val episodeTitle = item.episodeTitle?.takeIf { it.isNotBlank() }

    val base = when {
        seasonNumber != null && episodeNumber != null && item.isNextUp ->
            stringResource(Res.string.continue_watching_up_next_episode, seasonNumber, episodeNumber)
        seasonNumber != null && episodeNumber != null ->
            stringResource(Res.string.compose_player_episode_code_full, seasonNumber, episodeNumber)
        item.isNextUp ->
            stringResource(Res.string.continue_watching_up_next)
        else ->
            stringResource(Res.string.media_movie)
    }

    return episodeTitle?.let { "$base • $it" } ?: base
}
