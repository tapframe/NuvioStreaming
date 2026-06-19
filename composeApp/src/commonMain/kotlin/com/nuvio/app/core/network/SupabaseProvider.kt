package com.nuvio.app.core.network

import com.nuvio.app.core.build.AppVersionConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.annotations.SupabaseInternal
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.ktor.client.plugins.defaultRequest
import io.ktor.http.HttpHeaders

object SupabaseProvider {
    private data class ClientHolder(
        val backend: SyncBackendConfig,
        val client: SupabaseClient,
    )

    private var holder: ClientHolder? = null

    val selectedBackend: SyncBackendConfig
        get() = SyncBackendRepository.selectedBackend

    @OptIn(SupabaseInternal::class)
    val client: SupabaseClient
        get() = clientFor(selectedBackend)

    fun rebuildClient() {
        holder = null
    }

    @OptIn(SupabaseInternal::class)
    private fun clientFor(config: SyncBackendConfig): SupabaseClient {
        holder
            ?.takeIf { it.backend.hasSameConnectionIdentity(config) }
            ?.let { return it.client }

        val userAgent = "NuvioMobile/${AppVersionConfig.VERSION_NAME.ifBlank { "dev" }}"
        val nextClient = createSupabaseClient(
            supabaseUrl = config.normalizedSupabaseUrl,
            supabaseKey = config.anonKey,
        ) {
            httpConfig {
                defaultRequest {
                    headers.append(HttpHeaders.UserAgent, userAgent)
                }
            }
            install(Auth)
            install(Postgrest)
            install(Functions)
        }
        holder = ClientHolder(backend = config, client = nextClient)
        return nextClient
    }
}
