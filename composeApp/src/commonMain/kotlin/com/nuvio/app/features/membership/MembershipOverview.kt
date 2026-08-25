package com.nuvio.app.features.membership

data class MembershipOverview(
    val status: String = "inactive",
    val tier: MemberTier? = null,
    val verifiedAt: String? = null,
    val supporterSince: String? = null,
    val providerConnected: Boolean = false,
    val hasSubscription: Boolean = false,
    val subscriptionActive: Boolean = false,
    val subscriptionStatus: String? = null,
    val billingProvider: String? = null,
    val membershipLevel: MemberTier? = null,
    val currentPeriodEnd: String? = null,
    val cancelsAtPeriodEnd: Boolean = false,
    val hasActiveGrant: Boolean = false,
    val grantIsLifetime: Boolean = false,
    val grantExpiresAt: String? = null,
    val grantKind: String? = null,
    val grantTier: MemberTier? = null,
    val grantSource: String? = null,
    val hasLifetimeGrant: Boolean = false,
    val lifetimeGrantTier: MemberTier? = null,
) {
    val active: Boolean
        get() = status == "active" && tier != null
}

data class MembershipOverviewState(
    val overview: MembershipOverview? = null,
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
)
