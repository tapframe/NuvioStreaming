package com.nuvio.app.core.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.network.NetworkCondition
import com.nuvio.app.core.network.messageForEmptyState
import com.nuvio.app.core.network.titleForEmptyState
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.action_retry
import org.jetbrains.compose.resources.stringResource

@Composable
fun NuvioNetworkOfflineCard(
    condition: NetworkCondition,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    NuvioSurfaceCard(modifier = modifier) {
        Text(
            text = condition.titleForEmptyState(),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = condition.messageForEmptyState(),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (onRetry != null) {
            Spacer(modifier = Modifier.height(16.dp))
            NuvioPrimaryButton(
                text = stringResource(Res.string.action_retry),
                onClick = onRetry,
            )
        }
    }
}
