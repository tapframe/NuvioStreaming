package com.nuvio.app.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.NuvioLoadingIndicator
import com.nuvio.app.features.membership.MemberTier
import com.nuvio.app.features.membership.MembershipOverview
import com.nuvio.app.features.membership.MembershipOverviewState
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.community_membership_connected_description
import nuvio.composeapp.generated.resources.community_membership_connected_title
import nuvio.composeapp.generated.resources.community_membership_description
import nuvio.composeapp.generated.resources.community_membership_manage
import nuvio.composeapp.generated.resources.community_membership_refresh
import nuvio.composeapp.generated.resources.community_membership_refreshing
import nuvio.composeapp.generated.resources.community_membership_supporter_since
import nuvio.composeapp.generated.resources.community_membership_tier_supporter
import nuvio.composeapp.generated.resources.community_membership_tier_supporter_plus
import nuvio.composeapp.generated.resources.community_membership_title
import nuvio.composeapp.generated.resources.community_membership_thank_you
import nuvio.composeapp.generated.resources.community_membership_unable_load
import nuvio.composeapp.generated.resources.community_membership_you_are
import nuvio.composeapp.generated.resources.community_view_supporter_membership
import org.jetbrains.compose.resources.stringResource

private val CardColor = Color(0xFF07080B)
private val PrimaryTextColor = Color(0xFFF6F7F9)
private val SecondaryTextColor = Color.White.copy(alpha = 0.65f)
private val TertiaryTextColor = Color.White.copy(alpha = 0.52f)

@Composable
internal fun SupporterMembershipCard(
    state: MembershipOverviewState,
    isTablet: Boolean,
    showAction: Boolean,
    actionEnabled: Boolean,
    onAction: () -> Unit,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(CardColor),
    ) {
        when {
            state.isLoading -> LoadingMembershipContent(isTablet = isTablet)
            state.overview == null -> MembershipLoadErrorContent(
                isTablet = isTablet,
                isRefreshing = state.isRefreshing,
                onRefresh = onRefresh,
            )
            state.overview.subscriptionActive -> ActiveSubscriptionContent(
                overview = state.overview,
                isTablet = isTablet,
                isRefreshing = state.isRefreshing,
                hasError = state.errorMessage != null,
                showAction = showAction,
                actionEnabled = actionEnabled,
                onAction = onAction,
                onRefresh = onRefresh,
            )
            state.overview.providerConnected && !state.overview.hasActiveGrant -> ConnectedMembershipContent(
                isTablet = isTablet,
                isRefreshing = state.isRefreshing,
                hasError = state.errorMessage != null,
                showAction = showAction,
                actionEnabled = actionEnabled,
                onAction = onAction,
                onRefresh = onRefresh,
            )
            state.overview.hasActiveGrant || state.overview.active -> GrantMembershipContent(
                overview = state.overview,
                isTablet = isTablet,
                isRefreshing = state.isRefreshing,
                hasError = state.errorMessage != null,
                showAction = showAction,
                actionEnabled = actionEnabled,
                onAction = onAction,
                onRefresh = onRefresh,
            )
            else -> NonMemberContent(
                isTablet = isTablet,
                isRefreshing = state.isRefreshing,
                hasError = state.errorMessage != null,
                showAction = showAction,
                actionEnabled = actionEnabled,
                onAction = onAction,
                onRefresh = onRefresh,
            )
        }
    }
}

@Composable
private fun LoadingMembershipContent(isTablet: Boolean) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = if (isTablet) 190.dp else 168.dp)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        NuvioLoadingIndicator()
    }
}

@Composable
private fun MembershipLoadErrorContent(
    isTablet: Boolean,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
) {
    MembershipMainContent(isTablet = isTablet) {
        Text(
            text = stringResource(Res.string.community_membership_title),
            style = MaterialTheme.typography.headlineSmall,
            color = PrimaryTextColor,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(Res.string.community_membership_unable_load),
            style = MaterialTheme.typography.bodyMedium,
            color = SecondaryTextColor,
        )
        Spacer(modifier = Modifier.height(20.dp))
        MembershipRefreshButton(
            isRefreshing = isRefreshing,
            onRefresh = onRefresh,
        )
    }
}

@Composable
private fun NonMemberContent(
    isTablet: Boolean,
    isRefreshing: Boolean,
    hasError: Boolean,
    showAction: Boolean,
    actionEnabled: Boolean,
    onAction: () -> Unit,
    onRefresh: () -> Unit,
) {
    MembershipMainContent(isTablet = isTablet) {
        Text(
            text = stringResource(Res.string.community_membership_title),
            style = MaterialTheme.typography.headlineSmall,
            color = PrimaryTextColor,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(Res.string.community_membership_description),
            style = MaterialTheme.typography.bodyMedium,
            color = SecondaryTextColor,
        )
        MembershipStatusError(visible = hasError)
        if (showAction) {
            Spacer(modifier = Modifier.height(28.dp))
            MembershipButton(
                label = stringResource(Res.string.community_view_supporter_membership),
                enabled = actionEnabled,
                onClick = onAction,
            )
        }
        if (hasError) {
            MembershipRefreshButton(
                isRefreshing = isRefreshing,
                onRefresh = onRefresh,
            )
        }
    }
}

@Composable
private fun ConnectedMembershipContent(
    isTablet: Boolean,
    isRefreshing: Boolean,
    hasError: Boolean,
    showAction: Boolean,
    actionEnabled: Boolean,
    onAction: () -> Unit,
    onRefresh: () -> Unit,
) {
    MembershipMainContent(isTablet = isTablet) {
        Text(
            text = stringResource(Res.string.community_membership_connected_title),
            style = MaterialTheme.typography.headlineSmall,
            color = PrimaryTextColor,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(Res.string.community_membership_connected_description),
            style = MaterialTheme.typography.bodyMedium,
            color = SecondaryTextColor,
        )
        MembershipStatusError(visible = hasError)
        Spacer(modifier = Modifier.height(24.dp))
        MembershipActions(
            primaryLabel = stringResource(Res.string.community_view_supporter_membership),
            showPrimary = showAction,
            primaryEnabled = actionEnabled,
            isRefreshing = isRefreshing,
            onPrimary = onAction,
            onRefresh = onRefresh,
        )
    }
}

@Composable
private fun ActiveSubscriptionContent(
    overview: MembershipOverview,
    isTablet: Boolean,
    isRefreshing: Boolean,
    hasError: Boolean,
    showAction: Boolean,
    actionEnabled: Boolean,
    onAction: () -> Unit,
    onRefresh: () -> Unit,
) {
    val tier = overview.membershipLevel ?: overview.tier ?: MemberTier.SUPPORTER
    val supporterSince = overview.supporterSince?.let { formatDonationDate(it) }

    MembershipMainContent(isTablet = isTablet) {
        TierTitle(tier = tier)
        supporterSince?.let { date ->
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(Res.string.community_membership_supporter_since, date),
                style = MaterialTheme.typography.bodyMedium,
                color = TertiaryTextColor,
            )
        }
        MembershipStatusError(visible = hasError)
    }
    ActiveMembershipFooter(
        showAction = showAction,
        actionEnabled = actionEnabled,
        isRefreshing = isRefreshing,
        onAction = onAction,
        onRefresh = onRefresh,
    )
}

@Composable
private fun GrantMembershipContent(
    overview: MembershipOverview,
    isTablet: Boolean,
    isRefreshing: Boolean,
    hasError: Boolean,
    showAction: Boolean,
    actionEnabled: Boolean,
    onAction: () -> Unit,
    onRefresh: () -> Unit,
) {
    val tier = overview.grantTier ?: overview.tier ?: MemberTier.SUPPORTER
    val supporterSince = overview.supporterSince?.let { formatDonationDate(it) }

    MembershipMainContent(isTablet = isTablet) {
        TierTitle(tier = tier)
        supporterSince?.let { date ->
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(Res.string.community_membership_supporter_since, date),
                style = MaterialTheme.typography.bodyMedium,
                color = TertiaryTextColor,
            )
        }
        MembershipStatusError(visible = hasError)
    }
    HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
    MembershipFooterActions(
        showAction = showAction,
        actionEnabled = actionEnabled,
        isRefreshing = isRefreshing,
        onAction = onAction,
        onRefresh = onRefresh,
    )
}

@Composable
private fun ActiveMembershipFooter(
    showAction: Boolean,
    actionEnabled: Boolean,
    isRefreshing: Boolean,
    onAction: () -> Unit,
    onRefresh: () -> Unit,
) {
    HorizontalDivider(color = Color.White.copy(alpha = 0.1f))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 20.dp),
    ) {
        MembershipActions(
            primaryLabel = stringResource(Res.string.community_membership_manage),
            showPrimary = showAction,
            primaryEnabled = actionEnabled,
            isRefreshing = isRefreshing,
            onPrimary = onAction,
            onRefresh = onRefresh,
        )
    }
}

@Composable
private fun MembershipFooterActions(
    showAction: Boolean,
    actionEnabled: Boolean,
    isRefreshing: Boolean,
    onAction: () -> Unit,
    onRefresh: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 20.dp),
    ) {
        MembershipActions(
            primaryLabel = stringResource(Res.string.community_view_supporter_membership),
            showPrimary = showAction,
            primaryEnabled = actionEnabled,
            isRefreshing = isRefreshing,
            onPrimary = onAction,
            onRefresh = onRefresh,
        )
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun TierTitle(
    tier: MemberTier,
) {
    val badgeStyle = remember(tier) { tier.badgeStyle() }
    val tierSize = remember(tier) { mutableStateOf(IntSize.Zero) }
    val tierBrush = rememberMemberBadgeGradientBrush(
        style = badgeStyle,
        size = tierSize.value,
    )
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(7.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = stringResource(Res.string.community_membership_you_are),
            style = MaterialTheme.typography.headlineSmall,
            color = PrimaryTextColor,
            fontWeight = FontWeight.SemiBold,
        )
        Row {
            Text(
                text = tier.displayName(),
                style = MaterialTheme.typography.headlineSmall.copy(brush = tierBrush),
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.onSizeChanged { tierSize.value = it },
            )
            Text(
                text = ".",
                style = MaterialTheme.typography.headlineSmall,
                color = PrimaryTextColor,
                fontWeight = FontWeight.SemiBold,
            )
        }
        Text(
            text = stringResource(Res.string.community_membership_thank_you),
            style = MaterialTheme.typography.headlineSmall,
            color = PrimaryTextColor,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun MemberTier.displayName(): String = when (this) {
    MemberTier.SUPPORTER -> stringResource(Res.string.community_membership_tier_supporter)
    MemberTier.SUPPORTER_PLUS -> stringResource(Res.string.community_membership_tier_supporter_plus)
}

@Composable
private fun MembershipMainContent(
    isTablet: Boolean,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = if (isTablet) 28.dp else 20.dp,
                vertical = if (isTablet) 32.dp else 28.dp,
            ),
        content = content,
    )
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun MembershipActions(
    primaryLabel: String,
    showPrimary: Boolean,
    primaryEnabled: Boolean,
    isRefreshing: Boolean,
    onPrimary: () -> Unit,
    onRefresh: () -> Unit,
) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MembershipRefreshButton(
            isRefreshing = isRefreshing,
            onRefresh = onRefresh,
        )
        if (showPrimary) {
            MembershipButton(
                label = primaryLabel,
                enabled = primaryEnabled,
                onClick = onPrimary,
            )
        }
    }
}

@Composable
private fun MembershipRefreshButton(
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
) {
    TextButton(
        onClick = onRefresh,
        enabled = !isRefreshing,
        colors = ButtonDefaults.textButtonColors(contentColor = SecondaryTextColor),
    ) {
        Text(
            stringResource(
                if (isRefreshing) {
                    Res.string.community_membership_refreshing
                } else {
                    Res.string.community_membership_refresh
                },
            ),
        )
    }
}

@Composable
private fun MembershipStatusError(visible: Boolean) {
    if (!visible) return
    Spacer(modifier = Modifier.height(12.dp))
    Text(
        text = stringResource(Res.string.community_membership_unable_load),
        style = MaterialTheme.typography.bodySmall,
        color = Color(0xFFFF9E9E),
    )
}

@Composable
private fun MembershipButton(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.heightIn(min = 44.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = PrimaryTextColor,
            contentColor = CardColor,
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp),
    ) {
        Text(label)
    }
}
