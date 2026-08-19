package com.nuvio.app.features.membership

import com.nuvio.app.core.network.SupabaseProvider
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.Serializable

internal object MemberAccessRemoteDataSource {
    suspend fun getMemberAccess(): MemberAccess {
        val remote = SupabaseProvider.client.postgrest
            .rpc("get_my_member_access")
            .decodeList<MemberAccessResponse>()
            .firstOrNull()
            ?: return MemberAccess.None
        val tier = MemberTier.entries.firstOrNull { it.name == remote.tier } ?: return MemberAccess.None
        val entitlements = remote.entitlements
            .mapNotNull { value -> CosmeticEntitlement.entries.firstOrNull { it.name == value } }
            .toSet()
        return MemberAccess(
            tier = tier,
            entitlements = CosmeticEntitlements(entitlements),
        )
    }
}

@Serializable
private data class MemberAccessResponse(
    val tier: String,
    val entitlements: List<String>,
)
