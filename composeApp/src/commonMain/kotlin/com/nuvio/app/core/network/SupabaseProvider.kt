package com.nuvio.app.core.network

import com.nuvio.app.core.build.AppVersionConfig
import io.github.jan.supabase.annotations.SupabaseInternal
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.ktor.client.plugins.HttpRequestRetry
import io.ktor.client.plugins.defaultRequest
import io.ktor.http.HttpHeaders
import io.ktor.http.takeFrom

object SupabaseProvider {
    @OptIn(SupabaseInternal::class)
    val client by lazy {
        val userAgent = "NuvioMobile/${AppVersionConfig.VERSION_NAME.ifBlank { "dev" }}"
        createSupabaseClient(
            supabaseUrl = SupabaseConfig.URL,
            supabaseKey = SupabaseConfig.ANON_KEY,
        ) {
            httpConfig {
                if (SupabaseEndpointConfig.hasFallback) {
                    install(HttpRequestRetry) {
                        retryOnExceptionIf(maxRetries = 1) { request, cause ->
                            SupabaseEndpointConfig.shouldRetryWithFallback(
                                requestUrl = request.url.buildString(),
                                cause = cause,
                            )
                        }
                        retryIf(maxRetries = 1) { request, response ->
                            SupabaseEndpointConfig.shouldRetryWithFallback(
                                requestUrl = request.url.toString(),
                                statusCode = response.status.value,
                            )
                        }
                        modifyRequest { request ->
                            SupabaseEndpointConfig.fallbackUrlFor(request.url.buildString())?.let { fallbackUrl ->
                                request.url.takeFrom(fallbackUrl)
                            }
                        }
                        constantDelay(millis = 100)
                    }
                }
                defaultRequest {
                    headers.append(HttpHeaders.UserAgent, userAgent)
                }
            }
            install(Auth)
            install(Postgrest)
            install(Functions)
            install(Realtime)
        }
    }
}
