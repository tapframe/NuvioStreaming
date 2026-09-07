package com.nuvio.app.features.membership

import com.nuvio.app.core.network.SupabaseProvider
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

internal object MembershipOverviewRemoteDataSource {
    suspend fun getMembershipOverview(): MembershipOverview {
        val response = SupabaseProvider.client.postgrest
            .rpc("get_my_membership_overview")
            .decodeList<MembershipOverviewResponse>()
            .firstOrNull()
            ?: return MembershipOverview()
        val hasActiveGrant = response.hasActiveGrant == true
        val subscriptionActive = response.subscriptionAccessActive == true
        val hasLifetimeGrant = hasActiveGrant && response.hasLifetimeGrant == true

        return MembershipOverview(
            status = response.status ?: "inactive",
            tier = response.tier.toMemberTier(),
            verifiedAt = response.verifiedAt,
            supporterSince = response.supporterSince,
            providerConnected = response.providerConnected == true,
            hasSubscription = response.hasSubscription == true,
            subscriptionActive = subscriptionActive,
            subscriptionStatus = response.subscriptionStatus,
            billingProvider = response.provider,
            membershipLevel = response.membershipLevel.toMemberTier(),
            currentPeriodEnd = response.currentPeriodEnd,
            cancelsAtPeriodEnd = subscriptionActive && response.cancelsAtPeriodEnd == true,
            hasActiveGrant = hasActiveGrant,
            grantIsLifetime = hasActiveGrant && response.grantIsLifetime == true,
            grantExpiresAt = response.grantExpiresAt.takeIf { hasActiveGrant },
            grantKind = response.grantKind.takeIf { hasActiveGrant },
            grantTier = response.grantTier.toMemberTier().takeIf { hasActiveGrant },
            grantSource = response.grantSource.takeIf { hasActiveGrant },
            hasLifetimeGrant = hasLifetimeGrant,
            lifetimeGrantTier = response.lifetimeGrantTier.toMemberTier().takeIf { hasLifetimeGrant },
        )
    }
}

private fun String?.toMemberTier(): MemberTier? =
    MemberTier.entries.firstOrNull { tier -> tier.name == this }

@Serializable
private data class MembershipOverviewResponse(
    val status: String? = null,
    val tier: String? = null,
    @SerialName("verified_at") val verifiedAt: String? = null,
    @SerialName("supporter_since") val supporterSince: String? = null,
    @SerialName("provider_connected") val providerConnected: Boolean? = null,
    @SerialName("has_subscription") val hasSubscription: Boolean? = null,
    @SerialName("subscription_access_active") val subscriptionAccessActive: Boolean? = null,
    @SerialName("subscription_status") val subscriptionStatus: String? = null,
    val provider: String? = null,
    @SerialName("membership_level") val membershipLevel: String? = null,
    @SerialName("current_period_end") val currentPeriodEnd: String? = null,
    @SerialName("cancels_at_period_end") val cancelsAtPeriodEnd: Boolean? = null,
    @SerialName("monthly_amount_cents") val monthlyAmountCents: Int? = null,
    @SerialName("currency_code") val currencyCode: String? = null,
    @SerialName("has_active_grant") val hasActiveGrant: Boolean? = null,
    @SerialName("grant_is_lifetime") val grantIsLifetime: Boolean? = null,
    @SerialName("grant_expires_at") val grantExpiresAt: String? = null,
    @SerialName("grant_kind") val grantKind: String? = null,
    @SerialName("grant_tier") val grantTier: String? = null,
    @SerialName("grant_source") val grantSource: String? = null,
    @SerialName("has_lifetime_grant") val hasLifetimeGrant: Boolean? = null,
    @SerialName("lifetime_grant_tier") val lifetimeGrantTier: String? = null,
)
