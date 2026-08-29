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
    val castState by DlnaCastRepository.state.collectAsState()
    val devices by DlnaCastRepository.devices.collectAsState()
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
                    text = when (castState) {
                        is DlnaCastState.Scanning -> "Szukam telewizorów..."
                        is DlnaCastState.DevicesFound -> "Wybierz urządzenie"
                        is DlnaCastState.NoDevices -> "Nie znaleziono urządzeń"
                        is DlnaCastState.Casting -> "Odtwarzanie na TV"
                        is DlnaCastState.Error -> "Błąd"
                        else -> "Urządzenia DLNA w sieci"
                    },
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { DlnaCastRepository.startScan() }) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Odśwież")
                }
            }

            Text(
                text = "Telefon i TV muszą być w tej samej sieci Wi-Fi. Stary Samsung TV pojawi się jako np. \"[TV] Samsung\" lub adres http://...:7676/smp_...",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            when (castState) {
                is DlnaCastState.Scanning -> {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator()
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("Skanuję sieć (SSDP)...", style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
                is DlnaCastState.NoDevices -> {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Rounded.Tv, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Nie znaleziono TV", style = MaterialTheme.typography.bodyMedium)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("Sprawdź czy TV ma włączone DLNA / AllShare", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(onClick = { DlnaCastRepository.startScan() }) { Text("Skanuj ponownie") }
                        }
                    }
                }
                is DlnaCastState.Error -> {
                    val msg = (castState as DlnaCastState.Error).message
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) {
                        Text(msg, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodyMedium)
                    }
                    Button(onClick = { DlnaCastRepository.startScan() }, modifier = Modifier.fillMaxWidth()) { Text("Spróbuj ponownie") }
                }
                is DlnaCastState.Casting -> {
                    val casting = castState as DlnaCastState.Casting
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(12.dp)) {
                        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.CastConnected, contentDescription = null, tint = Color.White)
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(casting.device.friendlyName, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("Odtwarzanie...", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                    if (devices.isEmpty()) {
                        // initial idle -> auto scan
                        Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            TextButton(onClick = { DlnaCastRepository.startScan() }) { Text("Skanuj urządzenia") }
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(devices) { device ->
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
                    }
                }
            }

            // Footer for scanning state with devices
            if (castState is DlnaCastState.DevicesFound) {
                Text(
                    text = "Wykryto ${devices.size} urządze(ń). Kliknij aby wysłać aktualny film. Proxy automatycznie obsłuży headery/torrent. Transkodowanie wg ustawień Cast.",
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
