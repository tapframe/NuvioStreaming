package com.nuvio.app.features.cast

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Cast
import androidx.compose.material.icons.rounded.CastConnected
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SmartDisplay
import androidx.compose.material.icons.rounded.Tv
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.rememberCoroutineScope
import com.nuvio.app.core.ui.NuvioModalBottomSheet
import com.nuvio.app.core.ui.dismissNuvioBottomSheet
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CastBottomSheet(
    isVisible: Boolean,
    castRequest: DlnaCastRequest?,
    onDismiss: () -> Unit,
    onDeviceSelected: (DlnaDevice) -> Unit = {},
) {
    if (!isVisible) return
    // Unified = DLNA + Chromecast
    val unifiedState by UnifiedCastRepository.state.collectAsState()
    val unifiedDevices by UnifiedCastRepository.devices.collectAsState()
    // Fallback legacy DLNA state for detailed casting screen (kept for overlay compatibility)
    val dlnaCastState by DlnaCastRepository.state.collectAsState()
    val isUnifiedCasting = unifiedState is UnifiedCastState.Casting
    val isDlnaCasting = dlnaCastState is DlnaCastState.Casting
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()

    fun dismiss() {
        scope.launch { dismissNuvioBottomSheet(sheetState, onDismiss) }
    }

    NuvioModalBottomSheet(
        onDismissRequest = { scope.launch { dismissNuvioBottomSheet(sheetState, onDismiss) } },
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Header info
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = when {
                        unifiedState is UnifiedCastState.Scanning || dlnaCastState is DlnaCastState.Scanning -> "Szukam telewizorów..."
                        unifiedState is UnifiedCastState.DevicesFound || dlnaCastState is DlnaCastState.DevicesFound -> "Wybierz urządzenie"
                        unifiedState is UnifiedCastState.NoDevices -> "Nie znaleziono urządzeń"
                        isUnifiedCasting || isDlnaCasting -> "Odtwarzanie na TV"
                        unifiedState is UnifiedCastState.Error -> "Błąd"
                        dlnaCastState is DlnaCastState.Error -> "Błąd"
                        else -> "Urządzenia w sieci (Chromecast + stary Samsung na końcu)"
                    },
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = {
                    UnifiedCastRepository.startScan()
                    DlnaCastRepository.startScan()
                }) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Odśwież")
                }
            }

            Text(
                text = "Telefon i TV muszą być w tej samej sieci Wi-Fi. Najpierw Chromecast (Google Cast), na końcu jako dodatek — stary Samsung (DLNA 7676/smp_).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            when {
                unifiedState is UnifiedCastState.Scanning || dlnaCastState is DlnaCastState.Scanning -> {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator()
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("Skanuję (Chromecast + DLNA)...", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                unifiedState is UnifiedCastState.NoDevices && dlnaCastState is DlnaCastState.NoDevices -> {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Rounded.Tv, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Nie znaleziono TV", style = MaterialTheme.typography.bodyMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("Sprawdź czy Chromecast jest w tej samej sieci. Stary Samsung (DLNA / AllShare) tylko jako dodatek na końcu.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(onClick = { UnifiedCastRepository.startScan(); DlnaCastRepository.startScan() }) { Text("Skanuj ponownie") }
                        }
                    }
                }
                (unifiedState as? UnifiedCastState.Error)?.let { it.message } != null -> {
                    val msg = (unifiedState as UnifiedCastState.Error).message
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) {
                        Text(msg, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(onClick = { UnifiedCastRepository.startScan() }, modifier = Modifier.fillMaxWidth()) { Text("Spróbuj ponownie") }
                }
                dlnaCastState is DlnaCastState.Error -> {
                    val msg = (dlnaCastState as DlnaCastState.Error).message
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) {
                        Text(msg, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(onClick = { DlnaCastRepository.startScan() }, modifier = Modifier.fillMaxWidth()) { Text("Spróbuj ponownie") }
                }
                isUnifiedCasting -> {
                    val casting = unifiedState as UnifiedCastState.Casting
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) {
                        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                                Icon(
                                    imageVector = if (casting.device.protocol == CastProtocol.CHROMECAST) Icons.Rounded.SmartDisplay else Icons.Rounded.CastConnected,
                                    contentDescription = null, tint = Color.White
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(casting.device.name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    if (casting.device.protocol == CastProtocol.CHROMECAST) "Chromecast • Odtwarzanie..." else "DLNA • Odtwarzanie...",
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                if (casting.proxyUrl.isNotBlank()) {
                                    Text(casting.proxyUrl, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = { UnifiedCastRepository.stop(); DlnaCastRepository.stopCasting() }, modifier = Modifier.weight(1f)) { Text("Zatrzymaj") }
                        Button(onClick = { dismiss() }, modifier = Modifier.weight(1f)) { Text("Zamknij") }
                    }
                }
                isDlnaCasting -> {
                    val casting = dlnaCastState as DlnaCastState.Casting
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) {
                        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.CastConnected, contentDescription = null, tint = Color.White)
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(casting.device.friendlyName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("DLNA • Odtwarzanie...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (casting.proxyUrl.isNotBlank()) {
                                    Text(casting.proxyUrl, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        TextButton(onClick = { DlnaCastRepository.stopCasting() }, modifier = Modifier.weight(1f)) { Text("Zatrzymaj") }
                        Button(onClick = { dismiss() }, modifier = Modifier.weight(1f)) { Text("Zamknij") }
                    }
                }
                else -> {
                    val allDevices = if (unifiedDevices.isNotEmpty()) unifiedDevices else emptyList()
                    // Fallback to DLNA devices if unified empty but Dlna has
                    val dlnaAsUnified = if (allDevices.isEmpty()) {
                        // collect legacy Dlna devices as fallback (for overlay compatibility)
                        emptyList<UnifiedCastDevice>()
                    } else allDevices

                    val showList = if (unifiedDevices.isNotEmpty()) unifiedDevices else dlnaAsUnified
                    if (showList.isEmpty()) {
                        // No devices yet, offer scan
                        val legacyDevices by DlnaCastRepository.devices.collectAsState()
                        if (legacyDevices.isNotEmpty()) {
                            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(legacyDevices) { device ->
                                    DlnaDeviceRow(device = device, onClick = {
                                        if (castRequest != null) {
                                            DlnaCastRepository.castToDevice(device, castRequest) { success, _ ->
                                                if (success) onDeviceSelected(device)
                                            }
                                        } else {
                                            onDeviceSelected(device)
                                        }
                                    })
                                }
                            }
                        } else {
                            Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    TextButton(onClick = { UnifiedCastRepository.startScan(); DlnaCastRepository.startScan() }) { Text("Skanuj urządzenia") }
                                    Text("Wykrywa Chromecast (mDNS) i DLNA na końcu", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(showList) { device ->
                                UnifiedDeviceRow(device = device, onClick = {
                                    if (castRequest != null) {
                                        UnifiedCastRepository.castToDevice(device, castRequest, chromecastPoster = null)
                                        // also keep legacy callback
                                        device.dlnaDevice?.let { onDeviceSelected(it) }
                                    }
                                })
                            }
                        }
                    }
                }
            }

            // Footer - Chromecast first, old Samsung at very end
            if (unifiedState is UnifiedCastState.DevicesFound || dlnaCastState is DlnaCastState.DevicesFound) {
                Text(
                    text = "Najpierw Chromecast (bez transkodu), na końcu jako dodatek stary Samsung (DLNA przez proxy). Wybierz TV.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun DlnaDeviceRow(device: DlnaDevice, onClick: () -> Unit) {
    Surface(
        tonalElevation = 2.dp,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(42.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.Tv, contentDescription = null, tint = MaterialTheme.colorScheme.onSecondaryContainer)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(device.friendlyName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!device.modelName.isNullOrBlank()) {
                        Text(device.modelName, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    device.ipAddress?.let {
                        Text("• $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                if (device.locationUrl.contains("7676") || device.locationUrl.contains("smp_")) {
                    Text("Samsung DLNA (7676/smp_)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
                }
            }
            Icon(Icons.Rounded.Cast, contentDescription = "Cast", tint = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun UnifiedDeviceRow(device: UnifiedCastDevice, onClick: () -> Unit) {
    val isCast = device.protocol == CastProtocol.CHROMECAST
    Surface(
        tonalElevation = 2.dp,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(42.dp).clip(CircleShape).background(
                    if (isCast) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer
                ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = if (isCast) Icons.Rounded.SmartDisplay else Icons.Rounded.Tv,
                    contentDescription = null,
                    tint = if (isCast) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSecondaryContainer
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(device.name, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        if (isCast) "Chromecast" else "DLNA",
                        style = MaterialTheme.typography.labelSmall,
                        color = if (isCast) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Medium
                    )
                    device.ipAddress?.let {
                        Text("• $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    device.chromecastDescription?.takeIf { it.isNotBlank() }?.let {
                        Text("• $it", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (!isCast && (device.dlnaDevice?.locationUrl?.contains("7676") == true)) {
                    Text("Samsung DLNA (7676/smp_)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
                }
            }
            Icon(
                imageVector = if (isCast) Icons.Rounded.SmartDisplay else Icons.Rounded.Cast,
                contentDescription = "Cast",
                tint = MaterialTheme.colorScheme.primary
            )
        }
    }
}
