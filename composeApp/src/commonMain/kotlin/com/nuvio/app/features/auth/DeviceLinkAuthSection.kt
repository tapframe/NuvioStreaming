package com.nuvio.app.features.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.nuvio.app.core.auth.DeviceLinkAuthFailure
import com.nuvio.app.core.auth.DeviceLinkAuthState
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.compose_auth_link_cancel
import nuvio.composeapp.generated.resources.compose_auth_link_code_expired
import nuvio.composeapp.generated.resources.compose_auth_link_creating_code
import nuvio.composeapp.generated.resources.compose_auth_link_failed
import nuvio.composeapp.generated.resources.compose_auth_link_open
import nuvio.composeapp.generated.resources.compose_auth_link_open_failed
import nuvio.composeapp.generated.resources.compose_auth_link_sign_in
import nuvio.composeapp.generated.resources.compose_auth_link_signing_in
import nuvio.composeapp.generated.resources.compose_auth_link_try_again
import nuvio.composeapp.generated.resources.compose_auth_link_waiting
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun DeviceLinkAuthSection(
    state: DeviceLinkAuthState,
    enabled: Boolean,
    height: Dp,
    scale: Float,
    onStart: () -> Unit,
    onCancel: () -> Unit,
) {
    val uriHandler = LocalUriHandler.current
    var openFailed by remember(state) { mutableStateOf(false) }

    when (state) {
        DeviceLinkAuthState.Idle -> {
            AuthSecondaryButton(
                text = stringResource(Res.string.compose_auth_link_sign_in),
                enabled = enabled,
                height = height,
                scale = scale,
                onClick = onStart,
            )
        }
        DeviceLinkAuthState.Starting -> {
            AuthSecondaryButton(
                text = stringResource(Res.string.compose_auth_link_creating_code),
                enabled = false,
                height = height,
                scale = scale,
                onClick = {},
            )
        }
        is DeviceLinkAuthState.Waiting -> {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(AuthFieldBackground)
                        .border(1.dp, AuthFieldBorder, RoundedCornerShape(16.dp))
                        .padding(horizontal = 18.dp, vertical = 18.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = state.code,
                        style = MaterialTheme.typography.headlineMedium.copy(
                            color = AuthTextPrimary,
                            fontSize = (26f * scale).sp,
                            lineHeight = (30f * scale).sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = (2.5f * scale).sp,
                        ),
                    )
                }

                Spacer(modifier = Modifier.height(12.dp * scale))

                AuthPrimaryButton(
                    text = stringResource(Res.string.compose_auth_link_open),
                    isLoading = state.isCompleting,
                    enabled = enabled && !state.isCompleting,
                    height = height,
                    scale = scale,
                    onClick = {
                        openFailed = runCatching {
                            uriHandler.openUri(state.verificationUrl)
                        }.isFailure
                    },
                )

                Spacer(modifier = Modifier.height(10.dp * scale))

                Text(
                    text = if (state.isCompleting) {
                        stringResource(Res.string.compose_auth_link_signing_in)
                    } else {
                        stringResource(Res.string.compose_auth_link_waiting)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = AuthTextSecondary,
                        fontSize = (13f * scale).sp,
                        lineHeight = (18f * scale).sp,
                    ),
                    textAlign = TextAlign.Center,
                )

                if (openFailed) {
                    Spacer(modifier = Modifier.height(8.dp * scale))
                    Text(
                        text = stringResource(Res.string.compose_auth_link_open_failed),
                        modifier = Modifier.fillMaxWidth(),
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = MaterialTheme.colorScheme.error,
                            fontSize = (13f * scale).sp,
                            lineHeight = (18f * scale).sp,
                        ),
                        textAlign = TextAlign.Center,
                    )
                }

                if (!state.isCompleting) {
                    Spacer(modifier = Modifier.height(10.dp * scale))
                    Text(
                        text = stringResource(Res.string.compose_auth_link_cancel),
                        modifier = Modifier.clickable(onClick = onCancel),
                        style = MaterialTheme.typography.bodyMedium.copy(
                            color = AuthTextPrimary,
                            fontSize = (13f * scale).sp,
                            lineHeight = (18f * scale).sp,
                            fontWeight = FontWeight.Medium,
                        ),
                    )
                }
            }
        }
        is DeviceLinkAuthState.Failed -> {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = when (state.reason) {
                        DeviceLinkAuthFailure.Expired -> {
                            stringResource(Res.string.compose_auth_link_code_expired)
                        }
                        DeviceLinkAuthFailure.Start,
                        DeviceLinkAuthFailure.Complete,
                        -> stringResource(Res.string.compose_auth_link_failed)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = MaterialTheme.colorScheme.error,
                        fontSize = (13f * scale).sp,
                        lineHeight = (18f * scale).sp,
                    ),
                    textAlign = TextAlign.Center,
                )

                Spacer(modifier = Modifier.height(12.dp * scale))

                AuthSecondaryButton(
                    text = stringResource(Res.string.compose_auth_link_try_again),
                    enabled = enabled,
                    height = height,
                    scale = scale,
                    onClick = onStart,
                )
            }
        }
    }
}
