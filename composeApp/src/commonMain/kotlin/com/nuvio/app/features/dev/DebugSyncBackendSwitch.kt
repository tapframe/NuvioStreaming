package com.nuvio.app.features.dev

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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
import com.nuvio.app.core.auth.AuthRepository
import com.nuvio.app.core.build.AppFeaturePolicy
import com.nuvio.app.core.network.NetworkStatusRepository
import com.nuvio.app.core.network.SYNC_BACKEND_HOSTED_ID
import com.nuvio.app.core.network.SYNC_BACKEND_NUVIO_ID
import com.nuvio.app.core.network.SupabaseProvider
import com.nuvio.app.core.network.SyncBackendConfig
import com.nuvio.app.core.network.SyncBackendRepository
import com.nuvio.app.core.network.hasSameConnectionIdentity
import com.nuvio.app.core.ui.NuvioStatusModal
import com.nuvio.app.core.ui.NuvioTokens
import com.nuvio.app.core.ui.nuvio
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_cancel
import nuvio.composeapp.generated.resources.action_switch
import nuvio.composeapp.generated.resources.debug_backend_switch_confirm_message
import nuvio.composeapp.generated.resources.debug_backend_switch_confirm_title
import nuvio.composeapp.generated.resources.settings_account_sync_backend
import org.jetbrains.compose.resources.stringResource

internal fun shouldShowDebugSyncBackendSwitch(): Boolean =
    AppFeaturePolicy.debugBackendSwitcherEnabled &&
        SyncBackendRepository.debugSelectableBackends().size >= 2

@Composable
internal fun DebugSyncBackendSwitch(
    modifier: Modifier = Modifier,
    requireConfirmation: Boolean,
    container: Boolean = false,
) {
    if (!shouldShowDebugSyncBackendSwitch()) return

    val backendState by SyncBackendRepository.state.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()
    val selectableBackends = remember { SyncBackendRepository.debugSelectableBackends() }
    val hostedBackend = selectableBackends.firstOrNull { backend -> backend.id == SYNC_BACKEND_HOSTED_ID }
        ?: return
    val nuvioBackend = selectableBackends.firstOrNull { backend -> backend.id == SYNC_BACKEND_NUVIO_ID }
        ?: return
    val selectedBackend = backendState.selectedBackend
    val nuvioSelected = selectedBackend.id == SYNC_BACKEND_NUVIO_ID
    val targetBackend = if (nuvioSelected) hostedBackend else nuvioBackend
    val tokens = MaterialTheme.nuvio
    var pendingBackend by remember { mutableStateOf<SyncBackendConfig?>(null) }
    var isSwitching by remember { mutableStateOf(false) }

    fun switchToBackend(backend: SyncBackendConfig) {
        if (isSwitching || selectedBackend.hasSameConnectionIdentity(backend)) return

        isSwitching = true
        coroutineScope.launch {
            AuthRepository.resetForSyncBackendChange()
                .onSuccess {
                    val appliedBackend = SyncBackendRepository.applyDebugBackendAfterLogout(backend)
                    if (appliedBackend != null) {
                        SupabaseProvider.rebuildClient()
                        NetworkStatusRepository.requestRefresh(force = true)
                    }
                }
            pendingBackend = null
            isSwitching = false
        }
    }

    fun requestBackendSwitch(backend: SyncBackendConfig) {
        if (selectedBackend.hasSameConnectionIdentity(backend)) return

        if (requireConfirmation) {
            pendingBackend = backend
        } else {
            switchToBackend(backend)
        }
    }

    val content: @Composable () -> Unit = {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = !isSwitching) { requestBackendSwitch(targetBackend) }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = stringResource(Res.string.settings_account_sync_backend),
                    style = MaterialTheme.typography.bodyMedium,
                    color = tokens.colors.textMuted,
                )
                Text(
                    text = selectedBackend.displayName,
                    style = MaterialTheme.typography.bodyLarge,
                    color = tokens.colors.textPrimary,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (isSwitching) {
                CircularProgressIndicator(
                    color = tokens.colors.accent,
                    strokeWidth = NuvioTokens.Border.medium,
                )
            } else {
                Switch(
                    checked = nuvioSelected,
                    onCheckedChange = { checked ->
                        requestBackendSwitch(if (checked) nuvioBackend else hostedBackend)
                    },
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = tokens.colors.onAccent,
                        checkedTrackColor = tokens.colors.accent,
                        uncheckedThumbColor = tokens.colors.textMuted,
                        uncheckedTrackColor = tokens.colors.borderDefault,
                    ),
                )
            }
        }
    }

    if (container) {
        Surface(
            modifier = modifier.fillMaxWidth(),
            color = tokens.colors.surface,
            shape = tokens.shapes.compactCard,
            border = BorderStroke(tokens.borders.hairline, tokens.colors.borderSubtle),
        ) {
            content()
        }
    } else {
        Row(modifier = modifier.fillMaxWidth()) {
            content()
        }
    }

    pendingBackend?.let { backend ->
        NuvioStatusModal(
            title = stringResource(Res.string.debug_backend_switch_confirm_title),
            message = stringResource(
                Res.string.debug_backend_switch_confirm_message,
                backend.displayName,
            ),
            isVisible = true,
            isBusy = isSwitching,
            confirmText = stringResource(Res.string.action_switch),
            dismissText = stringResource(Res.string.action_cancel),
            onConfirm = { switchToBackend(backend) },
            onDismiss = { pendingBackend = null },
        )
    }
}
