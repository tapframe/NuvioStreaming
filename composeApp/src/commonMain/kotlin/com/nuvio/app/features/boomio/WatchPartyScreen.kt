package com.nuvio.app.features.boomio

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Group
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import co.touchlab.kermit.Logger
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.core.ui.NuvioToastController
import com.nuvio.app.navigation.WatchPartyRoute
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.companion_cancel
import nuvio.composeapp.generated.resources.companion_connected_hub
import nuvio.composeapp.generated.resources.companion_connecting_hub
import nuvio.composeapp.generated.resources.companion_link_failed_expired
import nuvio.composeapp.generated.resources.companion_link_failed_start
import nuvio.composeapp.generated.resources.companion_link_failed_unauthenticated
import nuvio.composeapp.generated.resources.watch_party_connect
import nuvio.composeapp.generated.resources.watch_party_end
import nuvio.composeapp.generated.resources.watch_party_end_confirm
import nuvio.composeapp.generated.resources.watch_party_end_desc
import nuvio.composeapp.generated.resources.watch_party_linking
import nuvio.composeapp.generated.resources.watch_party_members
import nuvio.composeapp.generated.resources.watch_party_no_tvs
import nuvio.composeapp.generated.resources.watch_party_paused
import nuvio.composeapp.generated.resources.watch_party_pick_tvs
import nuvio.composeapp.generated.resources.watch_party_playing
import nuvio.composeapp.generated.resources.watch_party_start
import nuvio.composeapp.generated.resources.watch_party_start_failed
import nuvio.composeapp.generated.resources.watch_party_started_toast
import nuvio.composeapp.generated.resources.watch_party_title
import nuvio.composeapp.generated.resources.watch_party_unlinked_description
import nuvio.composeapp.generated.resources.watch_party_unlinked_title
import org.jetbrains.compose.resources.stringResource

/** Interval between party position polls while a party is active. */
private const val POSITION_POLL_INTERVAL_MILLIS = 5_000L

private val log = Logger.withTag("WatchPartyScreen")

/**
 * The N3 watch-party screen: pick 2+ TVs and start synced playback of a title,
 * then control the party (pause/resume for all, host seek, end). Create mode
 * when the party hasn't started; control mode once [WatchPartyRepository] has a
 * party id. State lives in [BoomioSessionRepository], [CompanionBridge], and
 * [WatchPartyRepository]; this screen only drives them.
 */
@Composable
fun WatchPartyScreen(
    route: WatchPartyRoute,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(Unit) {
        BoomioSessionRepository.initialize()
        CompanionBridge.ensureStarted()
        CompanionBridge.refreshDevices()
    }

    val session by BoomioSessionRepository.session.collectAsStateWithLifecycle()
    val devices by CompanionBridge.devices.collectAsStateWithLifecycle()
    val connected by CompanionBridge.connected.collectAsStateWithLifecycle()
    val deviceListError by CompanionBridge.deviceListError.collectAsStateWithLifecycle()

    var partyId by remember { mutableStateOf<String?>(null) }

    NuvioScreen(modifier = modifier) {
        stickyHeader {
            NuvioScreenHeader(
                title = stringResource(Res.string.watch_party_title),
                onBack = onBack,
            )
        }
        val id = partyId
        if (session == null) {
            item { UnlinkedCard() }
        } else if (id == null) {
            item {
                PartyCreator(
                    route = route,
                    devices = devices,
                    connected = connected,
                    deviceListError = deviceListError,
                    onPartyStarted = { partyId = it },
                )
            }
        } else {
            item {
                PartyControls(
                    route = route,
                    partyId = id,
                    devices = devices,
                    onEnded = {
                        partyId = null
                        onBack()
                    },
                )
            }
        }
    }
}

@Composable
private fun UnlinkedCard() {
    val title = stringResource(Res.string.watch_party_unlinked_title)
    val description = stringResource(Res.string.watch_party_unlinked_description)
    val connectLabel = stringResource(Res.string.watch_party_connect)
    val linkingLabel = stringResource(Res.string.watch_party_linking)
    val failStart = stringResource(Res.string.companion_link_failed_start)
    val failUnauthenticated = stringResource(Res.string.companion_link_failed_unauthenticated)
    val failExpired = stringResource(Res.string.companion_link_failed_expired)
    val linkState by BoomioSessionRepository.linkState.collectAsStateWithLifecycle()
    val state = linkState

    NuvioSurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            when (state) {
                BoomioLinkState.Idle -> {
                    Button(onClick = { BoomioSessionRepository.startLink() }) {
                        Text(connectLabel)
                    }
                }
                BoomioLinkState.Starting, BoomioLinkState.Linking -> {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                        )
                        Text(linkingLabel, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                is BoomioLinkState.Failed -> {
                    val message = when (state.reason) {
                        BoomioLinkFailure.Unauthenticated -> failUnauthenticated
                        BoomioLinkFailure.Expired -> failExpired
                        BoomioLinkFailure.Start -> failStart
                    }
                    Text(
                        message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Button(onClick = { BoomioSessionRepository.startLink() }) {
                        Text(connectLabel)
                    }
                }
            }
        }
    }
}

@Composable
private fun PartyCreator(
    route: WatchPartyRoute,
    devices: List<CompanionDevice>,
    connected: Boolean,
    deviceListError: String?,
    onPartyStarted: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val pickLabel = stringResource(Res.string.watch_party_pick_tvs)
    val startLabel = stringResource(Res.string.watch_party_start)
    val noTvs = stringResource(Res.string.watch_party_no_tvs)
    val startFailed = stringResource(Res.string.watch_party_start_failed)
    val startedToastTemplate = stringResource(Res.string.watch_party_started_toast)
    val connectedHub = stringResource(Res.string.companion_connected_hub)
    val connectingHub = stringResource(Res.string.companion_connecting_hub)

    var selected by remember { mutableStateOf(setOf<String>()) }
    var isStarting by remember { mutableStateOf(false) }
    var startError by remember { mutableStateOf<String?>(null) }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        NuvioSurfaceCard {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(route.title.orEmpty(), style = MaterialTheme.typography.titleMedium)
                Text(
                    route.episodeContextLabel(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Text(
            pickLabel,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )

        deviceListError?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        startError?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }

        if (devices.isEmpty()) {
            NuvioSurfaceCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ConnectionStatusLine(connected = connected, connectedHub = connectedHub, connectingHub = connectingHub)
                    Text(
                        noTvs,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            devices.forEach { device ->
                val isSelected = device.deviceId in selected
                NuvioSurfaceCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(
                            checked = isSelected,
                            onCheckedChange = { checked ->
                                selected = if (checked) {
                                    selected + device.deviceId
                                } else {
                                    selected - device.deviceId
                                }
                            },
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(device.name, style = MaterialTheme.typography.titleSmall)
                            Text(
                                device.nowPlaying ?: noTvs,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }

        Button(
            onClick = {
                if (isStarting) return@Button
                isStarting = true
                startError = null
                scope.launch {
                    try {
                        val result = WatchPartyRepository.startWatchParty(
                            imdbId = route.imdbId,
                            season = route.season,
                            episode = route.episode,
                            targetDeviceIds = selected.toList(),
                            title = route.title,
                        )
                        val deliveredCount = result.delivered.count { it.delivered }
                        NuvioToastController.show(
                            startedToastTemplate.replace("{count}", deliveredCount.toString()),
                        )
                        onPartyStarted(result.partyId)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: WatchPartyException) {
                        startError = error.message
                    } catch (error: Throwable) {
                        log.w(error) { "Watch-party start failed" }
                        startError = startFailed
                    } finally {
                        isStarting = false
                    }
                }
            },
            enabled = selected.isNotEmpty() && !isStarting,
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            if (isStarting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(
                    imageVector = Icons.Rounded.Group,
                    contentDescription = null,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(startLabel)
        }
    }
}

@Composable
private fun PartyControls(
    route: WatchPartyRoute,
    partyId: String,
    devices: List<CompanionDevice>,
    onEnded: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val membersLabel = stringResource(Res.string.watch_party_members)
    val playing = stringResource(Res.string.watch_party_playing)
    val paused = stringResource(Res.string.watch_party_paused)
    val endLabel = stringResource(Res.string.watch_party_end)
    val endConfirm = stringResource(Res.string.watch_party_end_confirm)
    val endDesc = stringResource(Res.string.watch_party_end_desc)
    val cancelLabel = stringResource(Res.string.companion_cancel)

    var positions by remember(partyId) { mutableStateOf<WatchPartyPositions?>(null) }
    var endConfirming by remember { mutableStateOf(false) }
    var scrubbing by remember { mutableStateOf(false) }
    var dragMs by remember { mutableFloatStateOf(0f) }

    // Poll member positions while the party is live.
    LaunchedEffect(partyId) {
        while (isActive) {
            try {
                positions = WatchPartyRepository.getPartyPositions(partyId)
            } catch (error: CancellationException) {
                throw error
            } catch (error: WatchPartyException) {
                NuvioToastController.show(error.message ?: "Could not load positions")
            } catch (_: Throwable) {
                // transient — keep polling
            }
            delay(POSITION_POLL_INTERVAL_MILLIS)
        }
    }

    val partyIsPlaying = positions?.isPlaying ?: false
    val (durationMs, _) = averagePosition(positions)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        NuvioSurfaceCard {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(route.title.orEmpty(), style = MaterialTheme.typography.titleMedium)
                Text(
                    route.episodeContextLabel(),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    if (partyIsPlaying) playing else paused,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }

        Button(
            onClick = {
                scope.launch {
                    runCatching {
                        if (partyIsPlaying) WatchPartyRepository.pauseParty(partyId)
                        else WatchPartyRepository.resumeParty(partyId)
                    }.onFailure { error ->
                        NuvioToastController.show((error as? WatchPartyException)?.message ?: "Command failed")
                    }
                }
            },
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            Icon(
                imageVector = if (partyIsPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                contentDescription = null,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(if (partyIsPlaying) paused else playing)
        }

        if (durationMs > 0L) {
            LaunchedEffect(positions) {
                if (!scrubbing) {
                    val current = positions?.positions?.firstOrNull { it.durationMs > 0 }?.positionMs ?: 0L
                    dragMs = current.toFloat()
                }
            }
            Slider(
                value = dragMs.coerceIn(0f, durationMs.toFloat()),
                onValueChange = { newValue ->
                    dragMs = newValue
                    scrubbing = true
                },
                onValueChangeFinished = {
                    scrubbing = false
                    val target = dragMs.toLong()
                    scope.launch {
                        runCatching { WatchPartyRepository.seekParty(partyId, target) }
                            .onFailure { error ->
                                NuvioToastController.show((error as? WatchPartyException)?.message ?: "Seek failed")
                            }
                    }
                },
                valueRange = 0f..durationMs.toFloat(),
            )
        }

        Text(
            membersLabel.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val memberPositions = positions?.positions ?: emptyList()
        if (memberPositions.isEmpty()) {
            NuvioSurfaceCard {
                Text(
                    stringResource(Res.string.watch_party_no_tvs),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            memberPositions.forEach { member ->
                val device = devices.firstOrNull { it.deviceId == member.deviceId }
                NuvioSurfaceCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(device?.name ?: member.deviceId, style = MaterialTheme.typography.titleSmall)
                            Text(
                                formatPosition(member.positionMs, member.durationMs),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        OutlinedButton(
            onClick = { endConfirming = true },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(
                imageVector = Icons.Rounded.Group,
                contentDescription = null,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(endLabel)
        }
    }

    if (endConfirming) {
        AlertDialog(
            onDismissRequest = { endConfirming = false },
            title = { Text(endConfirm) },
            text = { Text(endDesc) },
            confirmButton = {
                TextButton(onClick = {
                    endConfirming = false
                    scope.launch {
                        runCatching { WatchPartyRepository.endParty(partyId) }
                            .onFailure { error ->
                                NuvioToastController.show((error as? WatchPartyException)?.message ?: "Could not end the party")
                            }
                        onEnded()
                    }
                }) {
                    Text(endLabel)
                }
            },
            dismissButton = {
                TextButton(onClick = { endConfirming = false }) {
                    Text(cancelLabel)
                }
            },
        )
    }
}

/** Returns (durationMs, average positionMs) across members with a known duration. */
private fun averagePosition(positions: WatchPartyPositions?): Pair<Long, Long> {
    val withDuration = positions?.positions?.filter { it.durationMs > 0L } ?: emptyList()
    if (withDuration.isEmpty()) return 0L to 0L
    val duration = withDuration.maxOf { it.durationMs }
    val avg = withDuration.map { it.positionMs }.average().toLong()
    return duration to avg
}

private fun formatPosition(positionMs: Long, durationMs: Long): String {
    val pos = formatClock(positionMs)
    return if (durationMs > 0L) "$pos / ${formatClock(durationMs)}" else pos
}

private fun formatClock(ms: Long): String {
    val totalSeconds = (ms / 1000L).coerceAtLeast(0L)
    val minutes = totalSeconds / 60L
    val seconds = totalSeconds % 60L
    val secondsPadded = if (seconds < 10) "0$seconds" else "$seconds"
    return "$minutes:$secondsPadded"
}

private fun WatchPartyRoute.episodeContextLabel(): String = when {
    season != null && episode != null -> "S$season · E$episode"
    season != null -> "Season $season"
    else -> ""
}

@Composable
private fun ConnectionStatusLine(connected: Boolean, connectedHub: String, connectingHub: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = if (connected) connectedHub else connectingHub,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
