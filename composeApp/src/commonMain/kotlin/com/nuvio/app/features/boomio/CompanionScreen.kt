package com.nuvio.app.features.boomio

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.LinkOff
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioScreen
import com.nuvio.app.core.ui.NuvioScreenHeader
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.core.ui.NuvioToastController
import kotlinx.coroutines.delay
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.companion_cancel
import nuvio.composeapp.generated.resources.companion_connected_hub
import nuvio.composeapp.generated.resources.companion_connecting_hub
import nuvio.composeapp.generated.resources.companion_connect
import nuvio.composeapp.generated.resources.companion_disconnect_tv
import nuvio.composeapp.generated.resources.companion_link_failed_expired
import nuvio.composeapp.generated.resources.companion_link_failed_start
import nuvio.composeapp.generated.resources.companion_link_failed_unauthenticated
import nuvio.composeapp.generated.resources.companion_linking
import nuvio.composeapp.generated.resources.companion_no_tvs
import nuvio.composeapp.generated.resources.companion_nothing_playing
import nuvio.composeapp.generated.resources.companion_now_playing
import nuvio.composeapp.generated.resources.companion_paused
import nuvio.composeapp.generated.resources.companion_pick_a_tv
import nuvio.composeapp.generated.resources.companion_play_pause
import nuvio.composeapp.generated.resources.companion_playing
import nuvio.composeapp.generated.resources.companion_remote_title
import nuvio.composeapp.generated.resources.companion_remove
import nuvio.composeapp.generated.resources.companion_toast_not_paired
import nuvio.composeapp.generated.resources.companion_toast_rate_limited
import nuvio.composeapp.generated.resources.companion_toast_state_restored
import nuvio.composeapp.generated.resources.companion_toast_timeout
import nuvio.composeapp.generated.resources.companion_unlink
import nuvio.composeapp.generated.resources.companion_unlink_confirm
import nuvio.composeapp.generated.resources.companion_unlinked_description
import nuvio.composeapp.generated.resources.companion_unlinked_title
import nuvio.composeapp.generated.resources.companion_volume
import nuvio.composeapp.generated.resources.compose_settings_page_companion
import org.jetbrains.compose.resources.stringResource

/** Interval between device-list refreshes while a companion session is active. */
private const val DEVICE_REFRESH_INTERVAL_MILLIS = 5_000L

/**
 * The N2 companion screen: link the phone to the boomio companion hub, pick a TV,
 * and control its playback. State lives in [BoomioSessionRepository] and
 * [CompanionBridge]; this screen only drives them.
 */
@Composable
fun CompanionScreen(
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(Unit) {
        BoomioSessionRepository.initialize()
        CompanionBridge.ensureStarted()
        CompanionBridge.refreshDevices()
    }

    val session by BoomioSessionRepository.session.collectAsStateWithLifecycle()
    val linkState by BoomioSessionRepository.linkState.collectAsStateWithLifecycle()
    val connected by CompanionBridge.connected.collectAsStateWithLifecycle()
    val devices by CompanionBridge.devices.collectAsStateWithLifecycle()
    val pairedDeviceId by CompanionBridge.pairedDeviceId.collectAsStateWithLifecycle()
    val deviceListError by CompanionBridge.deviceListError.collectAsStateWithLifecycle()

    // Keep the now-playing line current while linked.
    LaunchedEffect(session) {
        while (session != null) {
            CompanionBridge.refreshDevices()
            delay(DEVICE_REFRESH_INTERVAL_MILLIS)
        }
    }

    // Surface inbound hub events as toasts.
    val timeoutToast = stringResource(Res.string.companion_toast_timeout)
    val notPairedToast = stringResource(Res.string.companion_toast_not_paired)
    val rateLimitedToast = stringResource(Res.string.companion_toast_rate_limited)
    val stateRestoredToast = stringResource(Res.string.companion_toast_state_restored)
    LaunchedEffect(Unit) {
        CompanionBridge.events.collect { event ->
            when (event) {
                is CompanionEvent.Timeout -> NuvioToastController.show(timeoutToast)
                is CompanionEvent.NotPaired -> NuvioToastController.show(notPairedToast)
                is CompanionEvent.RateLimited -> NuvioToastController.show(rateLimitedToast)
                is CompanionEvent.StateRestored -> NuvioToastController.show(stateRestoredToast)
                is CompanionEvent.TvPush -> Unit
                is CompanionEvent.Error -> event.message?.let { NuvioToastController.show(it) }
            }
        }
    }

    NuvioScreen(modifier = modifier) {
        stickyHeader {
            NuvioScreenHeader(
                title = stringResource(Res.string.compose_settings_page_companion),
                onBack = onBack,
            )
        }
        if (session == null) {
            item { UnlinkedCard(linkState = linkState) }
        } else {
            val pairedId = pairedDeviceId
            if (pairedId == null) {
                item {
                    DevicePicker(
                        devices = devices,
                        deviceListError = deviceListError,
                        connected = connected,
                    )
                }
            } else {
                item {
                    RemoteControls(
                        pairedDeviceId = pairedId,
                        devices = devices,
                        connected = connected,
                    )
                }
            }
            item { UnlinkRow() }
        }
    }
}

@Composable
private fun UnlinkedCard(linkState: BoomioLinkState) {
    val title = stringResource(Res.string.companion_unlinked_title)
    val description = stringResource(Res.string.companion_unlinked_description)
    val connectLabel = stringResource(Res.string.companion_connect)
    val linkingLabel = stringResource(Res.string.companion_linking)
    val failStart = stringResource(Res.string.companion_link_failed_start)
    val failUnauthenticated = stringResource(Res.string.companion_link_failed_unauthenticated)
    val failExpired = stringResource(Res.string.companion_link_failed_expired)

    NuvioSurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(
                description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            when (linkState) {
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
                    val message = when (linkState.reason) {
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
private fun DevicePicker(
    devices: List<CompanionDevice>,
    deviceListError: String?,
    connected: Boolean,
) {
    val pickLabel = stringResource(Res.string.companion_pick_a_tv)
    val noTvs = stringResource(Res.string.companion_no_tvs)
    val connectLabel = stringResource(Res.string.companion_connect)
    val connectedHub = stringResource(Res.string.companion_connected_hub)
    val connectingHub = stringResource(Res.string.companion_connecting_hub)

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ConnectionStatusLine(connected = connected, connectedHub = connectedHub, connectingHub = connectingHub)
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
        if (devices.isEmpty()) {
            NuvioSurfaceCard {
                Text(
                    noTvs,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            devices.forEach { device ->
                NuvioSurfaceCard {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
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
                        Spacer(modifier = Modifier.width(12.dp))
                        Button(onClick = { CompanionBridge.pairTo(device.deviceId) }) {
                            Text(connectLabel)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RemoteControls(
    pairedDeviceId: String,
    devices: List<CompanionDevice>,
    connected: Boolean,
) {
    val remoteTitle = stringResource(Res.string.companion_remote_title)
    val connectedHub = stringResource(Res.string.companion_connected_hub)
    val connectingHub = stringResource(Res.string.companion_connecting_hub)
    val nowPlayingLabel = stringResource(Res.string.companion_now_playing)
    val nothingPlaying = stringResource(Res.string.companion_nothing_playing)
    val playing = stringResource(Res.string.companion_playing)
    val paused = stringResource(Res.string.companion_paused)
    val playPauseLabel = stringResource(Res.string.companion_play_pause)
    val volumeLabel = stringResource(Res.string.companion_volume)
    val disconnectLabel = stringResource(Res.string.companion_disconnect_tv)

    val device = devices.firstOrNull { it.deviceId == pairedDeviceId }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ConnectionStatusLine(connected = connected, connectedHub = connectedHub, connectingHub = connectingHub)
        Text(
            remoteTitle,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )

        NuvioSurfaceCard {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    nowPlayingLabel.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                val title = device?.nowPlaying ?: nothingPlaying
                val stateLabel = when {
                    device == null -> null
                    device.isPlaying -> playing
                    else -> paused
                }
                Text(
                    listOfNotNull(title, stateLabel).joinToString(" · "),
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Button(
            onClick = { CompanionBridge.togglePlayPause() },
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            Icon(
                imageVector = if (device?.isPlaying == true) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                contentDescription = playPauseLabel,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(playPauseLabel)
        }

        if (device != null && device.durationMs > 0L) {
            SeekBar(device = device)
        }

        VolumeSlider(volumeLabel = volumeLabel)

        OutlinedButton(
            onClick = { CompanionBridge.unpair() },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(
                imageVector = Icons.Rounded.LinkOff,
                contentDescription = null,
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(disconnectLabel)
        }
    }
}

@Composable
private fun SeekBar(device: CompanionDevice) {
    var scrubbing by remember(device.deviceId) { mutableStateOf(false) }
    var dragMs by remember(device.deviceId) { mutableFloatStateOf(device.positionMs.toFloat()) }
    LaunchedEffect(device.deviceId, device.positionMs) {
        if (!scrubbing) dragMs = device.positionMs.toFloat()
    }
    val durationMs = device.durationMs.coerceAtLeast(1L)
    Slider(
        value = dragMs.coerceIn(0f, durationMs.toFloat()),
        onValueChange = { newValue ->
            dragMs = newValue
            scrubbing = true
            CompanionBridge.sendScrubUpdate(newValue.toLong())
        },
        onValueChangeFinished = {
            scrubbing = false
            CompanionBridge.seekTo(dragMs.toLong())
        },
        valueRange = 0f..durationMs.toFloat(),
    )
}

@Composable
private fun VolumeSlider(volumeLabel: String) {
    var volume by remember { mutableIntStateOf(50) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            volumeLabel,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Slider(
            value = volume.toFloat(),
            onValueChange = { newValue ->
                volume = newValue.toInt()
                CompanionBridge.setVolume(volume)
            },
            valueRange = 0f..100f,
        )
    }
}

@Composable
private fun ConnectionStatusLine(connected: Boolean, connectedHub: String, connectingHub: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(
                    color = if (connected) Color(0xFF4CAF50) else Color(0xFFFFB300),
                    shape = CircleShape,
                ),
        )
        Text(
            text = if (connected) connectedHub else connectingHub,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun UnlinkRow() {
    val unlinkLabel = stringResource(Res.string.companion_unlink)
    val confirmLabel = stringResource(Res.string.companion_unlink_confirm)
    val removeLabel = stringResource(Res.string.companion_remove)
    val cancelLabel = stringResource(Res.string.companion_cancel)
    var showConfirm by remember { mutableStateOf(false) }

    TextButton(onClick = { showConfirm = true }) {
        Icon(
            imageVector = Icons.Rounded.LinkOff,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(unlinkLabel)
    }

    if (showConfirm) {
        AlertDialog(
            onDismissRequest = { showConfirm = false },
            title = { Text(confirmLabel) },
            confirmButton = {
                TextButton(onClick = {
                    showConfirm = false
                    BoomioSessionRepository.unlink()
                }) {
                    Text(removeLabel)
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirm = false }) {
                    Text(cancelLabel)
                }
            },
        )
    }
}
