package com.nuvio.app.features.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.features.mdblist.MdbListAuthError
import com.nuvio.app.features.mdblist.MdbListSyncError
import com.nuvio.app.features.mdblist.MdbListTracker
import com.nuvio.app.features.tracking.TrackingProviderId
import com.nuvio.app.features.tracking.TrackingRefreshIntent
import com.nuvio.app.features.watchprogress.WatchProgressSourceCoordinator
import kotlinx.coroutines.launch
import nuvio.composeapp.generated.resources.*
import org.jetbrains.compose.resources.stringResource

@Composable
internal fun MdbListProviderCard(modifier: Modifier = Modifier) {
    val auth by remember { MdbListTracker.ensureLoaded(); MdbListTracker.auth.state }.collectAsStateWithLifecycle()
    val accountStatus by MdbListTracker.account.status.collectAsStateWithLifecycle()
    val sync by MdbListTracker.sync.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val status = accountStatus.takeIf { it.scope == auth.scope }
    val syncStatus = sync.takeIf { it.scope == auth.scope }
    LaunchedEffect(auth.scope) {
        if (auth.session != null) MdbListTracker.account.resumePolling(auth.scope)
    }
    TrackingProviderCard(
        brand = TrackingBrand.MDBLIST,
        mode = when {
            auth.isAuthenticated -> TrackingConnectionCardMode.CONNECTED
            auth.session != null -> TrackingConnectionCardMode.AWAITING_APPROVAL
            else -> TrackingConnectionCardMode.DISCONNECTED
        },
        credentialsConfigured = MdbListTracker.auth.hasRequiredCredentials(),
        isLoading = status?.isBusy == true,
        connectedLabel = stringResource(Res.string.settings_mdblist_connected_as, auth.user?.username ?: "MDBList"),
        connectedDescription = stringResource(Res.string.settings_mdblist_connected_description),
        signInDescription = stringResource(Res.string.settings_mdblist_sign_in_description),
        finishSignInLabel = stringResource(Res.string.settings_mdblist_finish_sign_in),
        approvalDescription = stringResource(Res.string.settings_mdblist_approval_description, auth.session?.userCode.orEmpty()),
        connectLabel = stringResource(Res.string.settings_mdblist_connect),
        openLoginLabel = stringResource(Res.string.settings_mdblist_open_login),
        disconnectLabel = stringResource(Res.string.settings_mdblist_disconnect),
        missingCredentialsMessage = stringResource(Res.string.settings_mdblist_missing_credentials),
        syncLabel = stringResource(Res.string.settings_mdblist_sync_now),
        isSyncing = syncStatus?.isLoading == true,
        errorMessage = mdbListAccountError(auth.error ?: status?.authError, status?.error ?: syncStatus?.error),
        websiteLabel = stringResource(Res.string.settings_mdblist_visit),
        websiteUrl = "https://mdblist.com",
        onConnectRequested = { MdbListTracker.account.connect(auth.scope) },
        onResumeAuthorization = { MdbListTracker.account.resumePolling(auth.scope) },
        onCancelAuthorization = { MdbListTracker.account.cancel(auth.scope) },
        onDisconnect = { scope.launch { MdbListTracker.account.disconnect(auth.scope) } },
        onSyncRequested = {
            scope.launch {
                WatchProgressSourceCoordinator.refreshProviderAndActiveSource(
                    profileId = auth.scope.profileId,
                    providerId = TrackingProviderId.MDBLIST,
                    refreshProvider = {
                        MdbListTracker.store.checkScope(auth.scope)
                        MdbListTracker.sync.refresh(TrackingRefreshIntent.USER_INITIATED)
                        MdbListTracker.sync.state.value.let { it.scope == auth.scope && it.hasLoaded && it.error == null }
                    },
                )
            }
        },
        modifier = modifier,
    )
}

@Composable
private fun mdbListAccountError(auth: MdbListAuthError?, sync: MdbListSyncError?): String? {
    val message = when (auth) {
        MdbListAuthError.MISSING_CLIENT_ID -> Res.string.settings_mdblist_missing_credentials
        MdbListAuthError.INVALID_RESPONSE -> Res.string.settings_mdblist_invalid_response
        MdbListAuthError.INSUFFICIENT_SCOPE -> Res.string.settings_mdblist_write_required
        MdbListAuthError.CODE_EXPIRED -> Res.string.settings_mdblist_auth_expired
        MdbListAuthError.ACCESS_DENIED -> Res.string.settings_mdblist_auth_denied
        MdbListAuthError.AUTHORIZATION_REVOKED -> Res.string.settings_mdblist_auth_revoked
        null -> when (sync) {
            MdbListSyncError.RATE_LIMIT -> Res.string.settings_mdblist_rate_limited
            MdbListSyncError.AUTHORIZATION_REVOKED -> Res.string.settings_mdblist_auth_revoked
            MdbListSyncError.INVALID_RESPONSE -> Res.string.settings_mdblist_invalid_response
            MdbListSyncError.UNAVAILABLE -> Res.string.settings_mdblist_unavailable
            null -> return null
        }
    }
    return stringResource(message)
}
